"""Subscription / trial logic + access control + lazy email lifecycle."""
import os
import uuid
from datetime import timedelta

from db import db, now_utc
from datetime import datetime
from services import email_service

TRIAL_DAYS = 7
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")
STRIPE_PAYMENT_LINK = os.environ.get("STRIPE_PAYMENT_LINK", "")

PLANS = {
    "monthly": {"id": "monthly", "label": "Monthly", "price": 8.99, "currency": "EUR", "interval": "month"},
    "yearly": {"id": "yearly", "label": "Annual", "price": 79.0, "currency": "EUR", "interval": "year",
               "recommended": True, "savings": "Save €25+ per year", "monthly_equivalent": 6.58},
}


def _parse(dt):
    if isinstance(dt, str):
        return datetime.fromisoformat(dt)
    return dt


def new_trial_fields() -> dict:
    start = now_utc()
    return {
        "subscription_status": "trial",
        "plan": None,
        "trial_start_date": start.isoformat(),
        "trial_end_date": (start + timedelta(days=TRIAL_DAYS)).isoformat(),
        "emails_sent": [],
    }


def compute_status(user: dict) -> dict:
    """Returns derived subscription view. Does not mutate DB."""
    status = user.get("subscription_status", "free")
    plan = user.get("plan")
    trial_end = _parse(user.get("trial_end_date")) if user.get("trial_end_date") else None
    days_left = 0
    expired = False

    if status == "active":
        is_pro = True
    elif status == "trial" and trial_end:
        remaining = (trial_end - now_utc()).total_seconds()
        if remaining <= 0:
            expired = True
            is_pro = False
            status = "expired"
        else:
            is_pro = True
            days_left = max(0, int(remaining // 86400) + (1 if remaining % 86400 else 0))
    else:
        is_pro = False
        if status == "trial":
            status = "expired"

    return {
        "subscription_status": status,
        "plan": plan,
        "is_pro": is_pro,
        "trial_end_date": user.get("trial_end_date"),
        "trial_days_left": days_left,
        "_expired_now": expired,
    }


async def refresh_and_get_status(user: dict) -> dict:
    """Computes status, downgrades expired trials in DB, and fires due lifecycle emails."""
    view = compute_status(user)

    if view["_expired_now"] and user.get("subscription_status") == "trial":
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"subscription_status": "expired"}},
        )

    await _evaluate_lifecycle_emails(user, view)
    view.pop("_expired_now", None)
    view["stripe_payment_link"] = STRIPE_PAYMENT_LINK
    return view


async def _evaluate_lifecycle_emails(user: dict, view: dict):
    if user.get("subscription_status") == "active":
        return
    start = _parse(user.get("trial_start_date")) if user.get("trial_start_date") else None
    if not start:
        return
    day = (now_utc() - start).days
    sent = set(user.get("emails_sent", []))

    due = []
    if day >= 0 and "welcome" not in sent:
        due.append("welcome")
    if day >= 5 and "reminder" not in sent:
        due.append("reminder")
    if day >= 6 and "urgency" not in sent:
        due.append("urgency")
    if (view["subscription_status"] == "expired" or day >= TRIAL_DAYS) and "expired" not in sent:
        due.append("expired")

    pricing_url = f"{FRONTEND_URL}/pricing" if FRONTEND_URL else STRIPE_PAYMENT_LINK
    for kind in due:
        subject, html = email_service.template(kind, user.get("name", ""), pricing_url)
        await email_service.send_email(user["email"], subject, html)
        sent.add(kind)

    if due:
        await db.users.update_one({"id": user["id"]}, {"$set": {"emails_sent": list(sent)}})


async def activate_subscription(user: dict, plan: str) -> dict:
    if plan not in PLANS:
        plan = "monthly"
    # Prevent double subscription: if already active on same plan, no-op.
    if user.get("subscription_status") == "active" and user.get("plan") == plan:
        return compute_status({**user})
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"subscription_status": "active", "plan": plan, "activated_at": now_utc().isoformat()}},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return compute_status(updated)
