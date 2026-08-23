"""Moka backend regression tests — Supabase Postgres + user's own Stripe TEST key era.

Covers: health, billing packages, leagues/teams/value/trending feeds,
auth-gated /auth/me (Supabase read), billing me/subscription, and a real
Stripe Checkout session creation (Supabase write to payment_transactions).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://teams-hub-1.preview.emergentagent.com"
).rstrip("/")

# Seeded QA user in Supabase (7-day trial)
QA_TOKEN = "tok_qa_dcfd52cfd2b949188a5a552d4e55610f"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def auth(s):
    sess = requests.Session()
    sess.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {QA_TOKEN}",
    })
    return sess


# --- Health ---
def test_health(s):
    r = s.get(f"{BASE_URL}/api/")
    assert r.status_code == 200, r.text[:300]
    assert r.json().get("status") == "ok"


# --- Billing packages (public) ---
def test_billing_packages(s):
    r = s.get(f"{BASE_URL}/api/billing/packages")
    assert r.status_code == 200, r.text[:300]
    pkgs = r.json()["packages"]
    by_id = {p["id"]: p for p in pkgs}
    assert set(by_id) == {"pro_monthly", "pro_yearly"}
    assert float(by_id["pro_monthly"]["amount"]) == 8.99
    assert by_id["pro_monthly"]["currency"].lower() == "eur"
    assert by_id["pro_monthly"]["interval"] == "month"
    assert float(by_id["pro_yearly"]["amount"]) == 79.0
    assert by_id["pro_yearly"]["currency"].lower() == "eur"
    assert by_id["pro_yearly"]["interval"] == "year"


# --- Public feeds (mock data is expected) ---
def test_leagues(s):
    r = s.get(f"{BASE_URL}/api/leagues")
    assert r.status_code == 200, r.text[:300]
    leagues = r.json()["leagues"]
    assert isinstance(leagues, list) and len(leagues) > 0


def test_teams(s):
    r = s.get(f"{BASE_URL}/api/teams")
    assert r.status_code == 200, r.text[:300]
    teams = r.json()["teams"]
    assert isinstance(teams, list) and len(teams) > 0
    assert "id" in teams[0] and "name" in teams[0]


def test_value_matches(s):
    r = s.get(f"{BASE_URL}/api/value-matches")
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    items = data if isinstance(data, list) else (
        data.get("items") or data.get("matches") or data.get("data")
    )
    assert isinstance(items, list) and len(items) > 0


def test_trending_matches(s):
    r = s.get(f"{BASE_URL}/api/matches/trending")
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert isinstance(data["matches"], list) and len(data["matches"]) > 0


# --- Auth-gated (Supabase reads) ---
def test_auth_me(auth):
    r = auth.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200, r.text[:300]
    u = r.json()
    assert u["subscription_status"] == "trial"
    assert u["is_pro"] is True
    assert 5 <= int(u["trial_days_left"]) <= 7
    assert u["email"] and "@" in u["email"]
    assert "_id" not in u


def test_auth_me_unauthorized(s):
    r = s.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}"


def test_billing_me(auth):
    r = auth.get(f"{BASE_URL}/api/billing/me")
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["authenticated"] is True
    assert "is_pro" in d and "subscription_status" in d


def test_billing_subscription(auth):
    r = auth.get(f"{BASE_URL}/api/billing/subscription")
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["user_id"]
    assert "is_pro" in d and "cancel_at_period_end" in d


# --- Stripe checkout (real test key + Supabase write) ---
@pytest.mark.parametrize("pkg", ["pro_monthly", "pro_yearly"])
def test_billing_checkout(auth, pkg):
    r = auth.post(f"{BASE_URL}/api/billing/checkout", json={
        "package_id": pkg,
        "origin_url": BASE_URL,
    })
    assert r.status_code == 200, r.text[:500]
    d = r.json()
    assert d["url"].startswith("https://checkout.stripe.com"), d["url"]
    assert d["session_id"].startswith("cs_")
    assert d["mode"] == "subscription"

    # Verify the payment_transactions row was persisted (Supabase write)
    st = auth.get(f"{BASE_URL}/api/billing/status/{d['session_id']}")
    assert st.status_code == 200, st.text[:300]
    assert st.json()["payment_status"] in ("unpaid", "pending", "no_payment_required")


def test_billing_checkout_invalid_package(auth):
    r = auth.post(f"{BASE_URL}/api/billing/checkout", json={
        "package_id": "bogus", "origin_url": BASE_URL,
    })
    assert r.status_code == 400, r.text[:300]


def test_billing_checkout_requires_auth(s):
    r = s.post(f"{BASE_URL}/api/billing/checkout", json={
        "package_id": "pro_monthly", "origin_url": BASE_URL,
    })
    assert r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}"
