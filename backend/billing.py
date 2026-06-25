"""Stripe billing — recurring subscription only.

Creates a Stripe Checkout Session in `subscription` mode with an inline recurring
price (Emergent test proxy does not expose Product/Price endpoints).
Subscription state (status, current_period_end, customer/sub IDs) is persisted on
the `users` document so Pro access can be verified server-side at any time via
`is_active_subscription(db, user_id)`.

All Stripe SDK calls (sync) are wrapped in `asyncio.to_thread`.
"""
import os
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel

from auth import grant_pro

logger = logging.getLogger(__name__)

# Subscription statuses Stripe considers "good standing" for granting Pro access.
ACTIVE_SUBSCRIPTION_STATUSES = {"active", "trialing"}

PACKAGES = {
    "pro_monthly": {
        "amount": 8.99,
        "currency": "eur",
        "label": "Moka Pro · Monthly",
        "interval": "month",
        "days": 30,
        "product_name": "Moka Pro",
    },
    "pro_yearly": {
        "amount": 79.0,
        "currency": "eur",
        "label": "Moka Pro · Annual",
        "interval": "year",
        "days": 365,
        "product_name": "Moka Pro",
    },
}


async def is_active_subscription(db, user_id: str) -> bool:
    """Authoritative check for Pro access based on persisted subscription state.

    Returns True iff the user has a Stripe subscription whose status is in
    ACTIVE_SUBSCRIPTION_STATUSES AND the current period has not yet ended.
    Safe to call from any route that needs to gate Pro features.
    """
    if not user_id:
        return False
    u = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "subscription_status": 1, "pro_until": 1, "stripe_subscription_id": 1},
    )
    if not u:
        return False
    status = u.get("subscription_status")
    if status not in ACTIVE_SUBSCRIPTION_STATUSES:
        return False
    pro_until = u.get("pro_until")
    if not pro_until:
        # Status is active but we don't yet know the period end — trust Stripe status.
        return True
    try:
        end = datetime.fromisoformat(pro_until.replace("Z", "+00:00"))
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return end > datetime.now(timezone.utc)
    except (ValueError, AttributeError):
        return True


async def _persist_subscription_state(
    db,
    user_id: str,
    *,
    subscription_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    status: Optional[str] = None,
    current_period_end: Optional[int] = None,
    cancel_at_period_end: Optional[bool] = None,
) -> None:
    """Single write path for persisting Stripe subscription state on a user."""
    update: dict = {}
    if subscription_id is not None:
        update["stripe_subscription_id"] = subscription_id
    if customer_id is not None:
        update["stripe_customer_id"] = customer_id
    if status is not None:
        update["subscription_status"] = status
    if cancel_at_period_end is not None:
        update["subscription_cancel_at_period_end"] = cancel_at_period_end
    if current_period_end is not None:
        update["pro_until"] = datetime.fromtimestamp(
            current_period_end, tz=timezone.utc
        ).isoformat()
    if not update:
        return
    update["subscription_updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"user_id": user_id}, {"$set": update})


def _stripe_init():
    key = os.environ.get("STRIPE_API_KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    stripe.api_key = key
    # Emergent-managed test key routes through their proxy
    if "sk_test_emergent" in key:
        stripe.api_base = "https://integrations.emergentagent.com/stripe"
    return stripe


async def _get_or_create_price(db, package_id: str) -> Optional[str]:
    """RESERVED for future use with a non-proxy Stripe key. The Emergent test proxy
    rejects Product/Price create calls, so checkout currently uses inline price_data."""
    return None


async def _get_or_create_customer(db, user) -> Optional[str]:
    """The Emergent test proxy doesn't persist Customer objects.
    Skip explicit Customer.create — Stripe will create one on checkout from customer_email."""
    return None


class CheckoutRequest(BaseModel):
    package_id: str
    origin_url: str


def make_billing_router(db, current_user, current_user_optional) -> APIRouter:
    router = APIRouter(prefix="/api/billing")

    @router.get("/packages")
    async def list_packages():
        return {"packages": [{"id": k, **v} for k, v in PACKAGES.items()]}

    @router.get("/me")
    async def my_status(user=Depends(current_user_optional)):
        if not user:
            return {"authenticated": False, "is_pro": False, "pro_until": None, "subscription_status": None}
        u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0}) or {}
        is_pro = await is_active_subscription(db, user.user_id)
        return {
            "authenticated": True,
            "user_id": user.user_id,
            "is_pro": is_pro,
            "pro_until": u.get("pro_until"),
            "subscription_status": u.get("subscription_status"),
            "has_customer": bool(u.get("stripe_customer_id")),
        }

    @router.post("/checkout")
    async def create_checkout(body: CheckoutRequest, user=Depends(current_user)):
        """Create a Stripe Checkout Session in `subscription` mode (recurring only)."""
        pkg = PACKAGES.get(body.package_id)
        if not pkg:
            raise HTTPException(status_code=400, detail="Invalid package")
        customer_id = await _get_or_create_customer(db, user)
        # Re-use the stored Stripe customer if we already have one for this user.
        if not customer_id:
            u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "stripe_customer_id": 1}) or {}
            customer_id = u.get("stripe_customer_id")
        origin = body.origin_url.rstrip("/")
        _stripe_init()

        # Inline price_data so we don't need to call Product/Price endpoints
        # (the Emergent test proxy doesn't expose those).
        line_item = {
            "price_data": {
                "currency": pkg["currency"],
                "unit_amount": int(round(pkg["amount"] * 100)),
                "recurring": {"interval": pkg["interval"]},
                "product_data": {"name": pkg["product_name"]},
            },
            "quantity": 1,
        }
        meta = {"user_id": user.user_id, "package_id": body.package_id}
        session_args = dict(
            mode="subscription",
            line_items=[line_item],
            success_url=f"{origin}/pricing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{origin}/pricing?canceled=1",
            metadata=meta,
            subscription_data={"metadata": meta},
        )
        if customer_id:
            session_args["customer"] = customer_id
        else:
            session_args["customer_email"] = user.email

        try:
            session = await asyncio.to_thread(stripe.checkout.Session.create, **session_args)
        except stripe.error.StripeError as exc:
            logger.exception("Stripe checkout (subscription) failed for user %s", user.user_id)
            raise HTTPException(status_code=502, detail=f"Stripe checkout failed: {exc}") from exc

        await db.payment_transactions.insert_one({
            "session_id": session.id,
            "user_id": user.user_id,
            "email": user.email,
            "package_id": body.package_id,
            "amount": float(pkg["amount"]),
            "currency": pkg["currency"],
            "metadata": meta,
            "status": "initiated",
            "payment_status": "pending",
            "mode": "subscription",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"url": session.url, "session_id": session.id, "mode": "subscription"}

    @router.get("/status/{session_id}")
    async def checkout_status(session_id: str, user=Depends(current_user)):
        tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        if not tx:
            raise HTTPException(status_code=404, detail="Transaction not found")
        if tx.get("user_id") != user.user_id:
            raise HTTPException(status_code=403, detail="Not your transaction")

        _stripe_init()
        try:
            session = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id)
        except Exception as exc:
            logger.warning("Stripe session retrieve failed: %s", exc)
            session = None

        payment_status = (session.payment_status if session else tx.get("payment_status", "pending"))
        status = (session.status if session else tx.get("status", "open"))
        sub_id = (session.subscription if session else None)
        customer_id = (session.customer if session else None)
        sub_status = None
        period_end = None
        cancel_at_period_end = None
        if sub_id:
            try:
                sub = await asyncio.to_thread(stripe.Subscription.retrieve, sub_id)
                sub_status = sub.status
                period_end = getattr(sub, "current_period_end", None)
                cancel_at_period_end = getattr(sub, "cancel_at_period_end", None)
            except Exception as exc:
                logger.warning("Subscription retrieve failed %s: %s", sub_id, exc)

        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": status, "payment_status": payment_status,
                "stripe_subscription_id": sub_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )

        # Persist subscription state on the user document — single source of truth.
        if sub_id or customer_id or sub_status:
            await _persist_subscription_state(
                db,
                user.user_id,
                subscription_id=sub_id,
                customer_id=customer_id,
                status=sub_status,
                current_period_end=period_end,
                cancel_at_period_end=cancel_at_period_end,
            )
            # Store which plan (monthly/yearly) was purchased.
            plan = "yearly" if tx.get("package_id") == "pro_yearly" else "monthly"
            await db.users.update_one({"user_id": user.user_id}, {"$set": {"plan": plan}})

        is_pro = await is_active_subscription(db, user.user_id)
        u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0}) or {}
        return {
            "status": status,
            "payment_status": payment_status,
            "subscription_status": sub_status or u.get("subscription_status"),
            "is_pro": is_pro,
            "pro_until": u.get("pro_until"),
        }

    @router.get("/subscription")
    async def subscription_state(user=Depends(current_user)):
        """Authoritative endpoint for the frontend to verify Pro access."""
        u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0}) or {}
        active = await is_active_subscription(db, user.user_id)
        return {
            "user_id": user.user_id,
            "is_pro": active,
            "subscription_status": u.get("subscription_status"),
            "subscription_id": u.get("stripe_subscription_id"),
            "cancel_at_period_end": u.get("subscription_cancel_at_period_end", False),
            "pro_until": u.get("pro_until"),
            "has_customer": bool(u.get("stripe_customer_id")),
        }

    @router.post("/portal")
    async def billing_portal(body: dict, user=Depends(current_user)):
        """Open a Stripe Customer Portal session so users can manage/cancel their subscription."""
        u = await db.users.find_one({"user_id": user.user_id}, {"_id": 0}) or {}
        customer_id = u.get("stripe_customer_id")
        if not customer_id:
            raise HTTPException(status_code=400, detail="No Stripe customer yet")
        origin = (body.get("return_url") or "").rstrip("/") or "https://example.com"
        _stripe_init()
        try:
            portal = await asyncio.to_thread(
                stripe.billing_portal.Session.create,
                customer=customer_id,
                return_url=f"{origin}/pricing",
            )
            return {"url": portal.url}
        except stripe.error.InvalidRequestError as exc:
            # Test-mode portal needs config — surface a friendlier error
            logger.warning("Portal create failed: %s", exc)
            raise HTTPException(status_code=503, detail="Customer Portal not configured in Stripe Dashboard yet")

    return router


def make_webhook_router(db) -> APIRouter:
    router = APIRouter()

    @router.post("/api/webhook/stripe")
    async def stripe_webhook(request: Request):
        body = await request.body()
        sig = request.headers.get("Stripe-Signature", "")
        webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
        _stripe_init()
        try:
            if webhook_secret:
                event = await asyncio.to_thread(stripe.Webhook.construct_event, body, sig, webhook_secret)
            else:
                # No secret configured (test mode) — parse without verification
                import json as _json
                event = _json.loads(body)
        except Exception as exc:
            logger.warning("Webhook signature failed: %s", exc)
            raise HTTPException(status_code=400, detail="Bad signature")

        etype = event.get("type") if isinstance(event, dict) else event["type"]
        data = (event.get("data") if isinstance(event, dict) else event["data"]).get("object", {})

        if etype == "checkout.session.completed":
            sid = data.get("id")
            sub_id = data.get("subscription")
            customer = data.get("customer")
            user_id = (data.get("metadata") or {}).get("user_id")
            package_id = (data.get("metadata") or {}).get("package_id")
            if user_id:
                sub_status = None
                period_end = None
                cancel_at_period_end = None
                if sub_id:
                    try:
                        sub = await asyncio.to_thread(stripe.Subscription.retrieve, sub_id)
                        sub_status = sub.status
                        period_end = getattr(sub, "current_period_end", None)
                        cancel_at_period_end = getattr(sub, "cancel_at_period_end", None)
                    except Exception:
                        pass
                await _persist_subscription_state(
                    db,
                    user_id,
                    subscription_id=sub_id,
                    customer_id=customer,
                    status=sub_status,
                    current_period_end=period_end,
                    cancel_at_period_end=cancel_at_period_end,
                )
                plan = "yearly" if package_id == "pro_yearly" else "monthly"
                await db.users.update_one({"user_id": user_id}, {"$set": {"plan": plan}})
            if sid:
                await db.payment_transactions.update_one(
                    {"session_id": sid},
                    {"$set": {"status": "completed", "payment_status": "paid", "stripe_subscription_id": sub_id}},
                )

        elif etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
            sub_id = data.get("id")
            status = data.get("status")
            # `customer.subscription.deleted` arrives with status="canceled"; treat as inactive.
            if etype == "customer.subscription.deleted" and not status:
                status = "canceled"
            cancel_at_period_end = data.get("cancel_at_period_end", False)
            period_end = data.get("current_period_end")
            user_q = await db.users.find_one({"stripe_subscription_id": sub_id}, {"_id": 0, "user_id": 1})
            if user_q:
                await _persist_subscription_state(
                    db,
                    user_q["user_id"],
                    status=status,
                    current_period_end=period_end,
                    cancel_at_period_end=cancel_at_period_end,
                )

        return {"ok": True}

    return router
