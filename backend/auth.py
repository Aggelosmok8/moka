"""Auth module — Bearer token via Authorization header (no cookies).
Storing the token in localStorage on the frontend and sending it as
  Authorization: Bearer <token>
lets us use CORS with allow_origins=["*"] and allow_credentials=False,
which works with ANY Vercel preview URL without CORS config changes.
"""
import os
import uuid
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import Request, HTTPException, Depends, Response, APIRouter
from pydantic import BaseModel

import email_service

logger = logging.getLogger(__name__)

EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_DAYS = 7
TRIAL_DAYS = 7


class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    pro_until: Optional[str] = None
    is_pro: bool = False
    subscription_status: Optional[str] = None
    plan: Optional[str] = None
    trial_end_date: Optional[str] = None
    trial_days_left: int = 0


def _is_pro_now(user_doc: dict) -> bool:
    doc = user_doc or {}
    sub = doc.get("subscription_status")
    if sub == "active":
        return True
    # Trial ("trialing") grants Pro only while pro_until is still in the future.
    pro_until_iso = doc.get("pro_until")
    if not pro_until_iso:
        return sub == "trialing"
    try:
        dt = datetime.fromisoformat(pro_until_iso)
    except Exception:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt > datetime.now(timezone.utc)


def _effective_status(user_doc: dict) -> tuple[str, int]:
    """Derive (effective_status, trial_days_left) without mutating the DB.

    effective_status in: active | trial | expired | free
    """
    doc = user_doc or {}
    if doc.get("subscription_status") == "active":
        return "active", 0
    trial_end = doc.get("trial_end_date") or doc.get("pro_until")
    if doc.get("subscription_status") == "trialing" and trial_end:
        try:
            end = datetime.fromisoformat(trial_end)
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
            remaining = (end - datetime.now(timezone.utc)).total_seconds()
            if remaining > 0:
                return "trial", max(1, int((remaining + 86399) // 86400))
            return "expired", 0
        except Exception:
            return "expired", 0
    if doc.get("trial_start_date"):
        return "expired", 0
    return "free", 0


async def _resolve_token(request: Request) -> Optional[str]:
    """Extract Bearer token from Authorization header."""
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        tok = auth.split(" ", 1)[1].strip()
        return tok or None
    return None


def make_auth_router(db) -> APIRouter:
    router = APIRouter(prefix="/api/auth")

    async def _current_user_or_none(request: Request) -> Optional[User]:
        tok = await _resolve_token(request)
        if not tok:
            return None
        sess = await db.user_sessions.find_one({"session_token": tok})
        if not sess:
            return None
        exp = sess.get("expires_at")
        if isinstance(exp, str):
            try:
                exp = datetime.fromisoformat(exp)
            except Exception:
                return None
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp and exp < datetime.now(timezone.utc):
            return None
        user_doc = await db.users.find_one({"user_id": sess["user_id"]})
        if not user_doc:
            return None
        eff_status, days_left = _effective_status(user_doc)
        return User(
            user_id=user_doc["user_id"],
            email=user_doc["email"],
            name=user_doc.get("name", ""),
            picture=user_doc.get("picture"),
            pro_until=user_doc.get("pro_until"),
            is_pro=_is_pro_now(user_doc),
            subscription_status=eff_status,
            plan=user_doc.get("plan"),
            trial_end_date=user_doc.get("trial_end_date"),
            trial_days_left=days_left,
        )

    async def current_user(request: Request) -> User:
        u = await _current_user_or_none(request)
        if not u:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return u

    async def current_user_optional(request: Request) -> Optional[User]:
        return await _current_user_or_none(request)

    @router.post("/session")
    async def exchange_session(request: Request):
        """Exchange Emergent session_id for a Bearer token."""
        session_id = request.headers.get("X-Session-ID") or ""
        if not session_id:
            try:
                body = await request.json()
                session_id = body.get("session_id", "")
            except Exception:
                session_id = ""
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id required")

        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": session_id})
        if r.status_code != 200:
            logger.warning("Emergent auth failed %s: %s", r.status_code, r.text[:200])
            raise HTTPException(status_code=401, detail="Invalid session")

        data = r.json()
        email = data.get("email")
        if not email:
            raise HTTPException(status_code=401, detail="Email missing from auth")

        now = datetime.now(timezone.utc).isoformat()
        existing = await db.users.find_one({"email": email})
        if existing:
            user_id = existing["user_id"]
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {
                    "name": data.get("name", existing.get("name", "")),
                    "picture": data.get("picture", existing.get("picture")),
                    "last_login_at": now,
                }},
            )
        else:
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            trial_start = datetime.now(timezone.utc)
            trial_end = (trial_start + timedelta(days=TRIAL_DAYS)).isoformat()
            new_doc = {
                "user_id": user_id,
                "email": email,
                "name": data.get("name", ""),
                "picture": data.get("picture"),
                # 7-day no-card Pro trial — grants full Pro access via pro_until.
                "subscription_status": "trialing",
                "plan": None,
                "trial_start_date": trial_start.isoformat(),
                "trial_end_date": trial_end,
                "pro_until": trial_end,
                "emails_sent": "[]",
                "created_at": now,
                "last_login_at": now,
            }
            await db.users.insert_one(new_doc)
            # Fire welcome email (no-op without RESEND_API_KEY)
            await email_service.evaluate_lifecycle(db, new_doc)

        token = data.get("session_token") or uuid.uuid4().hex
        expires_at = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()
        await db.user_sessions.insert_one({
            "user_id": user_id,
            "session_token": token,
            "expires_at": expires_at,
            "created_at": now,
        })

        # Return token in response body — frontend stores in localStorage
        return {
            "ok": True,
            "user_id": user_id,
            "session_token": token,
            "expires_at": expires_at,
        }

    @router.get("/me", response_model=User)
    async def me(request: Request, user: User = Depends(current_user)):
        try:
            doc = await db.users.find_one({"user_id": user.user_id})
            # Lazy downgrade: flip an elapsed trial from "trialing" to "expired".
            if doc and doc.get("subscription_status") == "trialing" and not _is_pro_now(doc):
                await db.users.update_one({"user_id": user.user_id},
                                          {"$set": {"subscription_status": "expired"}})
                doc["subscription_status"] = "expired"
            await email_service.evaluate_lifecycle(db, doc)
        except Exception as e:
            logger.warning("lifecycle eval failed: %s", e)
        return user

    @router.post("/logout")
    async def logout(request: Request):
        tok = await _resolve_token(request)
        if tok:
            await db.user_sessions.delete_one({"session_token": tok})
        return {"ok": True}

    router.current_user = current_user
    router.current_user_optional = current_user_optional
    return router


async def grant_pro(db, user_id: str, days: int = 30) -> str:
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise ValueError(f"user {user_id} not found")
    base = datetime.now(timezone.utc)
    if user.get("pro_until"):
        try:
            existing = datetime.fromisoformat(user["pro_until"])
            if existing.tzinfo is None:
                existing = existing.replace(tzinfo=timezone.utc)
            if existing > base:
                base = existing
        except Exception:
            pass
    new_until = (base + timedelta(days=days)).isoformat()
    await db.users.update_one({"user_id": user_id}, {"$set": {"pro_until": new_until}})
    return new_until
