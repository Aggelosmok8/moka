"""A throwaway real account for tests — no static tokens live in the repo.

The seeded QA users and their predictable `test-*` tokens were removed, so tests
register a fresh account through the public endpoint and use its session token.
"""
import json
import os
import pathlib
import uuid

import requests

BASE_URL = os.environ.get("VITE_BACKEND_URL",
                          "https://teams-hub-1.preview.emergentagent.com").rstrip("/")

# One account per machine, reused by every test module: registering per module
# trips the auth rate limiter.
_CACHE = pathlib.Path("/tmp/qa_test_account.json")
_token = None


def token() -> str:
    global _token
    if _token:
        return _token
    if _CACHE.exists():
        creds = json.loads(_CACHE.read_text())
        r = requests.post(f"{BASE_URL}/api/auth/login", timeout=30,
                          json={"email": creds["email"], "password": creds["password"]})
        if r.status_code == 200:
            _token = r.json()["session_token"]
            return _token
    creds = {"email": f"qa.{uuid.uuid4().hex[:10]}@lionstats.test",
             "password": uuid.uuid4().hex + "Aa1!"}
    r = requests.post(f"{BASE_URL}/api/auth/register", timeout=30,
                      json={**creds, "name": "QA"})
    r.raise_for_status()
    _CACHE.write_text(json.dumps(creds))
    _token = r.json()["session_token"]
    return _token


def headers() -> dict:
    return {"Authorization": f"Bearer {token()}"}
