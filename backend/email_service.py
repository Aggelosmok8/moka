"""Resend email service + 7-day trial lifecycle.

Lightweight: no background workers. Lifecycle emails are evaluated lazily when a
user's session is created or their /auth/me is fetched, sent at most once each
(tracked in users.emails_sent JSON). Gracefully no-ops if RESEND_API_KEY is unset.
"""
import os
import re
import json
import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

TRIAL_DAYS = 7
_BRAND = "LION.STATS"


def _api_key() -> str:
    return os.environ.get("RESEND_API_KEY", "")


def _sender() -> str:
    return os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


def _from() -> str:
    """Resend rejects a malformed `from`. SENDER_EMAIL may already be a full
    "Name <addr>" header — in that case use it as-is instead of nesting it."""
    s = _sender().strip()
    return s if "<" in s else f"{_BRAND} <{s}>"


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
        return (f"2 days left in your {_BRAND} Pro trial",
                _wrap("2 days left ⏳",
                      f"Hey {name}, your Pro trial ends in 2 days. Go annual for €79/year and save €25+ versus monthly.", url))
    if kind == "urgency":
        return (f"Last day of your {_BRAND} Pro trial",
                _wrap("Today is your last day ⚡",
                      f"Hey {name}, your Pro trial expires today. Upgrade now to keep every league, value bets and odds.", url))
    if kind == "expired":
        return (f"Your {_BRAND} trial has ended — upgrade to keep Pro",
                _wrap("Your trial has ended",
                      f"Hey {name}, your free trial is over and your account moved to Free. Re-activate Pro any time — annual is just €79/year.", url))
    return ("", "")


def _debrand(text: str) -> str:
    """Last line of defence: the old brand can never reach an inbox."""
    return re.sub(r"(?i)\bmoka\b", _BRAND, text or "")


async def _send(to_email: str, subject: str, html: str) -> bool:
    subject, html = _debrand(subject), _debrand(html)
    if not _api_key():
        logger.info("[email skipped — no RESEND_API_KEY] to=%s subject=%s", to_email, subject)
        return False
    try:
        import resend
        resend.api_key = _api_key()
        params = {"from": _from(), "to": [to_email], "subject": subject, "html": html}
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info("Email sent to %s id=%s", to_email, (result or {}).get("id"))
        return True
    except Exception as e:
        logger.error("Resend send failed to %s: %s", to_email, e)
        return False


async def send_password_reset(name: str, to_email: str, link: str) -> bool:
    """Password reset link (1 hour, single use). No-op without RESEND_API_KEY."""
    return await _send(
        to_email,
        "Reset your LION.STATS password",
        _wrap("Reset your password",
              f"Hey {name or 'there'}, click the button below to set a new password. "
              "The link works once and expires in 1 hour. If you did not ask for this, ignore this email.",
              link),
    )


async def evaluate_lifecycle(db, user_doc: dict) -> None:
    """Send any due trial emails for this user (idempotent)."""
    # Paying users (subscription OR one-off access) never get trial nudges.
    if not user_doc or user_doc.get("subscription_status") in ("active", "one_off"):
        return
    # Admins hold Pro by allowlist, not by a trial — they must never be pitched.
    admins = [e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()]
    if (user_doc.get("email") or "").strip().lower() in admins:
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


async def send_invoice_email(to_email: str, inv: dict, pdf: bytes) -> tuple[bool, str]:
    """Deliver the Greek tax document as a PDF attachment. Returns (ok, error)."""
    if not _api_key():
        logger.info("[invoice email skipped — no RESEND_API_KEY] to=%s %s", to_email, inv.get("number"))
        return False, "RESEND_API_KEY not set"
    import base64
    name = f"{inv['series']}-{inv['number']}.pdf"
    title = {"5.1": "Πιστωτικό παραστατικό"}.get(inv.get("doc_type"), "Το παραστατικό σας")
    body = (f"Ευχαριστούμε για την αγορά σου. Επισυνάπτουμε το παραστατικό "
            f"<b>{inv['series']}-{inv['number']}</b> ποσού <b>€{inv['total']:.2f}</b>"
            + (f", ΜΑΡΚ <b>{inv['mark']}</b>." if inv.get("mark") else "."))
    try:
        import resend
        resend.api_key = _api_key()
        await asyncio.to_thread(resend.Emails.send, {
            "from": _from(),
            "to": [to_email],
            "subject": f"{title} — {inv['series']}-{inv['number']}",
            "html": _wrap(title, body, _pricing_url()),
            "attachments": [{"filename": name, "content": base64.b64encode(pdf).decode()}],
        })
        return True, ""
    except Exception as exc:
        # The provider's own message is what tells us WHY (unverified domain,
        # invalid from, sandbox recipient restriction) — keep it, don't bury it.
        logger.error("invoice email failed to %s: %s: %s", to_email, type(exc).__name__, exc)
        return False, f"{type(exc).__name__}: {exc}"[:300]


async def send_test_email(to_email: str) -> tuple[bool, str]:
    """Admin diagnostic: prove the mail provider works and surface its exact error."""
    if not _api_key():
        return False, "RESEND_API_KEY not set"
    try:
        import resend
        resend.api_key = _api_key()
        await asyncio.to_thread(resend.Emails.send, {
            "from": _from(),
            "to": [to_email],
            "subject": f"{_BRAND} — email test",
            "html": _wrap("Email test", "Αν το βλέπεις αυτό, η αποστολή email δουλεύει.", _pricing_url()),
        })
        return True, ""
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"[:300]
