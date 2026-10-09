"""One-off: remove the seeded QA test users and their long-lived tokens.

Those tokens were predictable strings, so anyone who knew one could sign in as a
Pro account. Run once per environment (preview and production):

    python tools/purge_test_users.py
"""
import asyncio
import sys

sys.path.insert(0, "/app/backend")
from database import Database  # noqa: E402

EMAILS = ["free@moka.test", "trial@moka.test", "promonthly@moka.test", "proannual@moka.test"]
USER_IDS = ["test_free", "test_trial", "test_pro_monthly", "test_pro_annual"]
TOKENS = ["test-free-token", "test-trial-token", "test-pro-monthly-token", "test-pro-annual-token"]

db = Database()


async def main():
    for t in TOKENS:
        r = await db.user_sessions.delete_many({"session_token": t})
        print(f"session {t:26} deleted={r.deleted_count}")
    for uid in USER_IDS:
        await db.user_sessions.delete_many({"user_id": uid})
        await db.user_portfolios.delete_many({"user_id": uid})
        r = await db.users.delete_many({"user_id": uid})
        print(f"user    {uid:26} deleted={r.deleted_count}")
    for e in EMAILS:
        r = await db.users.delete_many({"email": e})
        if r.deleted_count:
            print(f"user by email {e} deleted={r.deleted_count}")
    print("\nDone — no test accounts and no static tokens remain.")


asyncio.run(main())
