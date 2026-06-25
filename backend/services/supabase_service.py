"""Supabase REST adapter — future primary data store.

Activates automatically when SUPABASE_URL and SUPABASE_ANON_KEY are set in the env.
Until then `is_enabled()` returns False and the app uses the MongoDB store (db.py).
This keeps a clean service-layer abstraction so Supabase can be injected later
without touching route code.
"""
import os
import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def is_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_ANON_KEY)


def _key() -> str:
    return SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY


def _headers(extra: dict | None = None) -> dict:
    h = {
        "apikey": _key(),
        "Authorization": f"Bearer {_key()}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _base() -> str:
    return f"{SUPABASE_URL}/rest/v1"


def select(table: str, params: dict | None = None) -> list:
    r = requests.get(f"{_base()}/{table}", headers=_headers(), params=params or {"select": "*"}, timeout=20)
    r.raise_for_status()
    return r.json()


def insert(table: str, rows) -> list:
    r = requests.post(
        f"{_base()}/{table}",
        headers=_headers({"Prefer": "return=representation"}),
        json=rows,
        timeout=20,
    )
    r.raise_for_status()
    return r.json()


def update(table: str, match: dict, patch: dict) -> list:
    r = requests.patch(
        f"{_base()}/{table}",
        headers=_headers({"Prefer": "return=representation"}),
        params=match,
        json=patch,
        timeout=20,
    )
    r.raise_for_status()
    return r.json()


def delete(table: str, match: dict) -> None:
    r = requests.delete(f"{_base()}/{table}", headers=_headers(), params=match, timeout=20)
    r.raise_for_status()
