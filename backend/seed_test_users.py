"""Seed deterministic test users for every plan state we support.

Inserts users + long-lived sessions directly into the DB. The existing Bearer
auth (session_token lookup) recognises them immediately — no auth code touched.

Log in as any of them from the browser console on the app origin:

    localStorage.setItem("moka_session_token", "<token>"); location.reload();

Run:  python seed_test_users.py
"""
import asyncio
from datetime import datetime, timezone, timedelta

from database import Database

db = Database()
now = datetime.now(timezone.utc)
NOW_ISO = now.isoformat()
FAR = (now + timedelta(days=3650)).isoformat()  # session expiry


def iso(days):
    return (now + timedelta(days=days)).isoformat()


# (user_id, email, name, token, extra user fields)
USERS = [
    ("test_free", "free@moka.test", "Test Free", "test-free-token", {
        "subscription_status": None, "plan": None, "pro_until": None,
    }),
    ("test_trial", "trial@moka.test", "Test Trial", "test-trial-token", {
        "subscription_status": "trialing", "plan": None,
        "pro_until": iso(7), "trial_start_date": NOW_ISO, "trial_end_date": iso(7),
    }),
    ("test_pro_monthly", "promonthly@moka.test", "Test Pro Monthly", "test-pro-monthly-token", {
        "subscription_status": "active", "plan": "monthly", "pro_until": iso(30),
        "stripe_customer_id": "cus_test_monthly", "stripe_subscription_id": "sub_test_monthly",
    }),
    ("test_pro_annual", "proannual@moka.test", "Test Pro Annual", "test-pro-annual-token", {
        "subscription_status": "active", "plan": "yearly", "pro_until": iso(365),
        "stripe_customer_id": "cus_test_annual", "stripe_subscription_id": "sub_test_annual",
    }),
]


async def upsert_user(uid, email, name, extra):
    base = {"user_id": uid, "email": email, "name": name, "created_at": NOW_ISO, "last_login_at": NOW_ISO}
    base.update(extra)
    if await db.users.find_one({"user_id": uid}):
        await db.users.update_one({"user_id": uid}, {"$set": base})
    else:
        await db.users.insert_one(base)


async def upsert_session(uid, token):
    doc = {"user_id": uid, "session_token": token, "expires_at": FAR, "created_at": NOW_ISO}
    if await db.user_sessions.find_one({"session_token": token}):
        await db.user_sessions.update_one({"session_token": token}, {"$set": doc})
    else:
        await db.user_sessions.insert_one(doc)


async def main():
    for uid, email, name, token, extra in USERS:
        await upsert_user(uid, email, name, extra)
        await upsert_session(uid, token)
        print(f"seeded {email:24} token={token}")
    print("\nDone. Log in via browser console:")
    print('  localStorage.setItem("moka_session_token", "<token>"); location.reload();')


if __name__ == "__main__":
    asyncio.run(main())
