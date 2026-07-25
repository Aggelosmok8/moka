"""Moka backend regression tests after Render deploy packaging fix."""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://teams-hub-1.preview.emergentagent.com"
).rstrip("/")

TRIAL_TOKEN = "tok_trial_b8dbf3199912416db7d4bdd8c243a614"
EXPIRED_TOKEN = "tok_exp_3dad7d70946446c3aa5df133f694c83c"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# --- Health ---
def test_health(s):
    r = s.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"


# --- Billing packages ---
def test_billing_packages(s):
    r = s.get(f"{BASE_URL}/api/billing/packages")
    assert r.status_code == 200
    data = r.json()
    # Could be dict or list
    if isinstance(data, dict) and "packages" in data:
        pkgs = data["packages"]
    else:
        pkgs = data
    # Normalize to dict-by-id
    if isinstance(pkgs, list):
        by_id = {p.get("id") or p.get("package_id"): p for p in pkgs}
    else:
        by_id = pkgs
    assert "pro_monthly" in by_id
    assert "pro_yearly" in by_id
    pm = by_id["pro_monthly"]
    py = by_id["pro_yearly"]
    assert float(pm.get("amount")) == 8.99
    assert (pm.get("currency") or "").lower() == "eur"
    assert float(py.get("amount")) == 79.0
    assert (py.get("currency") or "").lower() == "eur"


# --- Value engine ---
def test_value_matches(s):
    r = s.get(f"{BASE_URL}/api/value-matches")
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items") or data.get("matches") or data.get("data")
    assert isinstance(items, list)
    assert len(items) > 0
    first = items[0]
    assert "match" in first or "value" in first or "home" in first


# --- Teams ---
def test_teams_list_and_detail_and_players(s):
    r = s.get(f"{BASE_URL}/api/teams")
    assert r.status_code == 200
    data = r.json()
    teams = data if isinstance(data, list) else data.get("teams") or data.get("items") or data.get("data")
    assert isinstance(teams, list) and len(teams) > 0
    tid = teams[0].get("id") or teams[0].get("team_id")
    assert tid is not None

    r2 = s.get(f"{BASE_URL}/api/teams/{tid}")
    assert r2.status_code == 200
    detail = r2.json()
    assert detail

    r3 = s.get(f"{BASE_URL}/api/teams/{tid}/players")
    assert r3.status_code == 200
    p = r3.json()
    players = p if isinstance(p, list) else p.get("players") or p.get("data") or []
    assert isinstance(players, list) and len(players) > 0
    # source may be at top level
    src = p.get("source") if isinstance(p, dict) else None
    if src is not None:
        assert src == "sample"
    # Validate player fields
    pl = players[0]
    for f in ("name", "position", "age", "goals", "assists", "rating"):
        assert f in pl, f"missing field {f} in player {pl}"


# --- Auth /me TRIAL ---
def test_auth_me_trial(s):
    r = s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {TRIAL_TOKEN}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("is_pro") is True
    assert data.get("subscription_status") == "trial"
    tdl = data.get("trial_days_left")
    assert tdl is not None and 3 <= int(tdl) <= 7


# --- Entitlements TRIAL ---
def test_entitlements_trial(s):
    r = s.get(f"{BASE_URL}/api/me/entitlements", headers={"Authorization": f"Bearer {TRIAL_TOKEN}"})
    assert r.status_code == 200, r.text
    data = r.json()
    ent = data.get("entitlements", data)
    assert ent.get("role") == "pro"
    leagues = ent.get("leagues") or ent.get("allowed_leagues") or []
    assert len(leagues) >= 10, f"expected ~12 leagues, got {len(leagues)}"


# --- Auth /me EXPIRED ---
def test_auth_me_expired(s):
    r = s.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {EXPIRED_TOKEN}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("is_pro") is False
    assert data.get("subscription_status") == "expired"


# --- Entitlements EXPIRED ---
def test_entitlements_expired(s):
    r = s.get(f"{BASE_URL}/api/me/entitlements", headers={"Authorization": f"Bearer {EXPIRED_TOKEN}"})
    assert r.status_code == 200, r.text
    data = r.json()
    ent = data.get("entitlements", data)
    assert ent.get("role") == "free"
    leagues = ent.get("leagues") or ent.get("allowed_leagues") or []
    assert 4 <= len(leagues) <= 9, f"expected ~7 leagues, got {len(leagues)}"


# --- Stripe checkout ---
def test_billing_checkout(s):
    r = s.post(
        f"{BASE_URL}/api/billing/checkout",
        headers={"Authorization": f"Bearer {TRIAL_TOKEN}"},
        json={"package_id": "pro_yearly", "origin_url": "https://example.com"},
    )
    assert r.status_code in (200, 201), r.text
    data = r.json()
    url = data.get("url") or data.get("checkout_url") or data.get("session_url")
    assert url and url.startswith("http")


def test_billing_checkout_monthly(s):
    r = s.post(
        f"{BASE_URL}/api/billing/checkout",
        headers={"Authorization": f"Bearer {TRIAL_TOKEN}"},
        json={"package_id": "pro_monthly", "origin_url": "https://example.com"},
    )
    assert r.status_code in (200, 201), r.text
    data = r.json()
    url = data.get("url") or data.get("checkout_url") or data.get("session_url")
    assert url and url.startswith("http")
