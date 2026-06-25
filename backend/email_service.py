"""Resend email service + 7-day trial lifecycle.

Lightweight: no background workers. Lifecycle emails are evaluated lazily when a
user's session is created or their /auth/me is fetched, sent at most once each
(tracked in users.emails_sent JSON). Gracefully no-ops if RESEND_API_KEY is unset.
"""
import os
import json
import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

TRIAL_DAYS = 7
_BRAND = "Moka"


def _api_key() -> str:
    return os.environ.get("RESEND_API_KEY", "")


def _sender() -> str:
    return os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


def _pricing_url() -> str:
    base = (os.environ.get("APP_URL", "") or "").rstrip("/")
    return f"{base}/pricing" if base else "/pricing"


def _wrap(title: str, body: str, cta_url: str) -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;padding:32px 0;font-family:Arial,sans-serif;">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#141414;border-radius:12px;padding:40px;">
          <tr><td style="color:#39FF14;font-size:13px;letter-spacing:3px;text-transform:uppercase;font-weight:700;">{_BRAND}</td></tr>
          <tr><td style="color:#ffffff;font-size:26px;font-weight:800;padding-top:12px;">{title}</td></tr>
          <tr><td style="color:#9CA3AF;font-size:15px;line-height:1.6;padding-top:16px;">{body}</td></tr>
          <tr><td style="padding-top:24px;"><a href="{cta_url}" style="background:#39FF14;color:#000;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:700;display:inline-block;">View plans</a></td></tr>
          <tr><td style="color:#4B5563;font-size:12px;padding-top:32px;">You're receiving this because you started a {_BRAND} Pro trial.</td></tr>
        </table>
      </td></tr>
    </table>"""


def _template(kind: str, name: str) -> tuple[str, str]:
    name = name or "there"
    url = _pricing_url()
    if kind == "welcome":
        return (f"Welcome to {_BRAND} — your 7-day Pro trial is live",
                _wrap("Your Pro trial just started 🚀",
                      f"Hey {name}, you now have <b>full Pro access</b> for 7 days — every league, value bets, full odds comparison and unlimited AI analysis. Dive in!", url))
    if kind == "reminder":
        return ("2 days left in your Moka Pro trial",
                _wrap("2 days left ⏳",
                      f"Hey {name}, your Pro trial ends in 2 days. Go annual for €79/year and save €25+ versus monthly.", url))
    if kind == "urgency":
        return ("Last day of your Moka Pro trial",
                _wrap("Today is your last day ⚡",
                      f"Hey {name}, your Pro trial expires today. Upgrade now to keep every league, value bets and odds.", url))
    if kind == "expired":
        return ("Your Moka trial has ended — upgrade to keep Pro",
                _wrap("Your trial has ended",
                      f"Hey {name}, your free trial is over and your account moved to Free. Re-activate Pro any time — annual is just €79/year.", url))
    return ("", "")


async def _send(to_email: str, subject: str, html: str) -> bool:
    if not _api_key():
        logger.info("[email skipped — no RESEND_API_KEY] to=%s subject=%s", to_email, subject)
        return False
    try:
        import resend
        resend.api_key = _api_key()
        params = {"from": _sender(), "to": [to_email], "subject": subject, "html": html}
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info("Email sent to %s id=%s", to_email, (result or {}).get("id"))
        return True
    except Exception as e:
        logger.error("Resend send failed to %s: %s", to_email, e)
        return False


async def evaluate_lifecycle(db, user_doc: dict) -> None:
    """Send any due trial emails for this user (idempotent)."""
    if not user_doc or user_doc.get("subscription_status") == "active":
        return
    start_iso = user_doc.get("trial_start_date")
    if not start_iso:
        return
    try:
        start = datetime.fromisoformat(start_iso)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
    except Exception:
        return

    day = (datetime.now(timezone.utc) - start).days
    raw = user_doc.get("emails_sent")
    try:
        sent = set(json.loads(raw)) if raw else set()
    except Exception:
        sent = set()

    due = []
    if day >= 0 and "welcome" not in sent:
        due.append("welcome")
    if day >= 5 and "reminder" not in sent:
        due.append("reminder")
    if day >= 6 and "urgency" not in sent:
        due.append("urgency")
    if day >= TRIAL_DAYS and "expired" not in sent:
        due.append("expired")
    if not due:
        return

    for kind in due:
        subject, html = _template(kind, user_doc.get("name", ""))
        await _send(user_doc["email"], subject, html)
        sent.add(kind)

    await db.users.update_one({"user_id": user_doc["user_id"]},
                              {"$set": {"emails_sent": json.dumps(sorted(sent))}})
