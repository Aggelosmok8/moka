"""Seeded test-user Bearer tokens (Dev Login panel) — /api/auth/me + /api/me/entitlements."""
import os

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://teams-hub-1.preview.emergentagent.com"
).rstrip("/")

TOKENS = {
    "free": ("test-free-token", "free@moka.test", False, None, "free"),
    "trial": ("test-trial-token", "trial@moka.test", True, None, "pro"),
    "monthly": ("test-pro-monthly-token", "promonthly@moka.test", True, "monthly", "pro"),
    "annual": ("test-pro-annual-token", "proannual@moka.test", True, "yearly", "pro"),
}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def client(s, token):
    s.headers["Authorization"] = f"Bearer {token}"
    return s


# --- /api/auth/me for each seeded plan state ---
@pytest.mark.parametrize("key", list(TOKENS))
def test_auth_me_plan_state(s, key):
    token, email, is_pro, plan, _role = TOKENS[key]
    r = client(s, token).get(f"{BASE_URL}/api/auth/me", timeout=30)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["email"] == email
    assert d["is_pro"] is is_pro
    assert d.get("plan") == plan
    assert isinstance(d["user_id"], str) and d["user_id"]
    assert "_id" not in d


def test_trial_days_left_about_seven(s):
    r = client(s, "test-trial-token").get(f"{BASE_URL}/api/auth/me", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert 6 <= d["trial_days_left"] <= 7, d
    assert d["subscription_status"] in ("trial", "trialing")
    assert d["trial_end_date"]


def test_free_user_status(s):
    r = client(s, "test-free-token").get(f"{BASE_URL}/api/auth/me", timeout=30)
    d = r.json()
    assert d["subscription_status"] in ("free", None)
    assert d["trial_days_left"] == 0
    assert d["pro_until"] is None


# --- /api/me/entitlements role gating ---
@pytest.mark.parametrize("key", list(TOKENS))
def test_entitlements_role(s, key):
    token, _email, _is_pro, _plan, role = TOKENS[key]
    r = client(s, token).get(f"{BASE_URL}/api/me/entitlements", timeout=30)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["authenticated"] is True
    ent = d["entitlements"]
    assert ent["role"] == role
    if role == "pro":
        assert ent["all_leagues"] is True
        assert "extended_stats" in ent["features"]
        assert ent["refresh_seconds"] <= 60
    else:
        assert ent["all_leagues"] is False
        assert "extended_stats" not in ent["features"]


# --- auth rejection ---
def test_me_requires_token():
    r = requests.get(f"{BASE_URL}/api/auth/me", timeout=30)
    assert r.status_code == 401


def test_me_rejects_bad_token():
    r = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": "Bearer bogus-token"},
        timeout=30,
    )
    assert r.status_code == 401


# --- portfolio persistence for a seeded user ---
def test_portfolio_get_and_put(s):
    c = client(s, "test-free-token")
    r = c.get(f"{BASE_URL}/api/me/portfolio", timeout=30)
    assert r.status_code == 200, r.text[:300]
    original = r.json()

    payload = {"bets": [{"id": "TEST_bet_1", "stake": 10}], "tickets": []}
    p = c.put(f"{BASE_URL}/api/me/portfolio", json=payload, timeout=30)
    assert p.status_code in (200, 201), p.text[:300]

    g = c.get(f"{BASE_URL}/api/me/portfolio", timeout=30)
    assert g.status_code == 200
    saved = g.json()
    assert saved["bets"][0]["id"] == "TEST_bet_1"
    assert saved["bets"][0]["stake"] == 10

    # restore original state
    c.put(
        f"{BASE_URL}/api/me/portfolio",
        json={"bets": original.get("bets", []), "tickets": original.get("tickets", [])},
        timeout=30,
    )
