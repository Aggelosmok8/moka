"""Auth routes: register, login, me, logout."""
import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field

from db import db, now_utc
from auth_utils import hash_password, verify_password, create_access_token, get_current_user
from services import subscription_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = ""


class LoginInput(BaseModel):
    email: EmailStr
    password: str


def _public(user: dict) -> dict:
    user = dict(user)
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


@router.post("/register")
async def register(body: RegisterInput):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password),
        "role": "user",
        "created_at": now_utc().isoformat(),
        **subscription_service.new_trial_fields(),
    }
    await db.users.insert_one(user)
    # fire welcome email lazily via lifecycle evaluation
    await subscription_service.refresh_and_get_status(user)
    token = create_access_token(user["id"], email)
    return {"token": token, "user": _public(user)}


@router.post("/login")
async def login(body: LoginInput):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    return {"token": token, "user": _public(user)}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    status = await subscription_service.refresh_and_get_status(user)
    return {"user": user, "subscription": status}


@router.post("/logout")
async def logout():
    return {"ok": True}
