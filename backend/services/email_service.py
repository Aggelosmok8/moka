"""Resend email service + trial lifecycle templates.

Lightweight: no background workers. Lifecycle emails are evaluated lazily whenever a
user's subscription status is checked (login / dashboard load) and sent at most once
each (tracked in user.emails_sent). Gracefully no-ops if RESEND_API_KEY is missing.
"""
import os
import asyncio
import logging

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

_BRAND = "StatLine"


def _wrap(title: str, body_html: str, cta_label: str | None = None, cta_url: str | None = None) -> str:
    cta = ""
    if cta_label and cta_url:
        cta = (
            f'<tr><td style="padding-top:24px;"><a href="{cta_url}" '
            f'style="background:#007AFF;color:#ffffff;text-decoration:none;padding:14px 28px;'
            f'border-radius:6px;font-weight:700;display:inline-block;">{cta_label}</a></td></tr>'
        )
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;padding:32px 0;font-family:Arial,sans-serif;">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#141414;border-radius:12px;padding:40px;">
          <tr><td style="color:#007AFF;font-size:13px;letter-spacing:3px;text-transform:uppercase;font-weight:700;">{_BRAND}</td></tr>
          <tr><td style="color:#ffffff;font-size:26px;font-weight:800;padding-top:12px;">{title}</td></tr>
          <tr><td style="color:#9CA3AF;font-size:15px;line-height:1.6;padding-top:16px;">{body_html}</td></tr>
          {cta}
          <tr><td style="color:#4B5563;font-size:12px;padding-top:32px;border-top:1px solid rgba(255,255,255,0.08);margin-top:24px;">You are receiving this because you started a {_BRAND} trial.</td></tr>
        </table>
      </td></tr>
    </table>
    """


def template(kind: str, name: str, pricing_url: str) -> tuple[str, str]:
    name = name or "there"
    if kind == "welcome":
        return (
            f"Welcome to {_BRAND} — your 7-day Pro trial is live",
            _wrap(
                "Your Pro trial just started 🚀",
                f"Hey {name}, you now have <b>full Pro access</b> for 7 days — every league, "
                f"live match charts, full team rosters and real-time odds. Dive in and start tracking.",
                "Open Dashboard",
                pricing_url,
            ),
        )
    if kind == "reminder":
        return (
            "2 days left in your Pro trial",
            _wrap(
                "2 days left ⏳",
                f"Hey {name}, your Pro trial ends in 2 days. Lock in unlimited access and keep your "
                f"match charts and odds running without interruption. The annual plan saves you €25+/year.",
                "View Plans",
                pricing_url,
            ),
        )
    if kind == "urgency":
        return (
            "Last day of your Pro trial",
            _wrap(
                "Today is your last day ⚡",
                f"Hey {name}, your Pro trial expires today. Upgrade now to keep full access to all leagues, "
                f"live charts and odds. Go annual for €79/year — best value.",
                "Upgrade Now",
                pricing_url,
            ),
        )
    if kind == "expired":
        return (
            "Your trial has ended — upgrade to keep Pro",
            _wrap(
                "Your trial has ended",
                f"Hey {name}, your free trial is over and your account moved to the Free tier. "
                f"Re-activate Pro any time to unlock all leagues, full stats and odds. "
                f"Annual is just €79/year (save €25+).",
                "Upgrade to Pro",
                pricing_url,
            ),
        )
    return ("", "")


async def send_email(to_email: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        logger.info("[email skipped — no RESEND_API_KEY] to=%s subject=%s", to_email, subject)
        return False
    try:
        import resend

        resend.api_key = RESEND_API_KEY
        params = {"from": SENDER_EMAIL, "to": [to_email], "subject": subject, "html": html}
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info("Email sent to %s id=%s", to_email, result.get("id"))
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, e)
        return False
