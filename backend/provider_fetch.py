"""One switch that decides whether this environment may call paid odds feeds.

The RapidAPI key is shared by preview and production and the provider counts the
calls together, so the preview must never spend the allowance: it serves the odds
already cached in its database instead.

Set ODDS_PROVIDER_FETCH=off in the preview environment only.
"""
import os


def fetch_allowed() -> bool:
    return (os.environ.get("ODDS_PROVIDER_FETCH", "on") or "on").strip().lower() not in (
        "off", "0", "false", "no")
