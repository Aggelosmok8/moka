"""Subscription routes: plans, status, activate (Stripe success redirect)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth_utils import get_current_user
from services import subscription_service

router = APIRouter(prefix="/api/subscription", tags=["subscription"])


class ActivateInput(BaseModel):
    plan: str = "monthly"


@router.get("/plans")
async def plans():
    return {
        "plans": list(subscription_service.PLANS.values()),
        "stripe_payment_link": subscription_service.STRIPE_PAYMENT_LINK,
        "trial_days": subscription_service.TRIAL_DAYS,
    }


@router.get("/status")
async def status(user: dict = Depends(get_current_user)):
    return await subscription_service.refresh_and_get_status(user)


@router.post("/activate")
async def activate(body: ActivateInput, user: dict = Depends(get_current_user)):
    """Called after Stripe payment-link success redirect to mark the user active."""
    result = await subscription_service.activate_subscription(user, body.plan)
    return result
