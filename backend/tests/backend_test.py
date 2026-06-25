"""StatLine backend regression tests.

Covers: auth (register/login/me), subscription (plans/activate/idempotency),
sports (leagues, matches, odds, teams, players), match chart CRUD, and
free-user access control (manually downgraded via Mongo).
"""
import os
import uuid
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env if env var not exported in shell
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or "statline_db"
_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


# ---------- shared fixtures ----------
@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def trial_user(http):
    """Register a brand-new trial user, return (token, user dict)."""
    email = f"test.{uuid.uuid4().hex[:10]}@statlinetest.com"
    r = http.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": "TEST Trial"
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and "user" in data
    return {"token": data["token"], "user": data["user"], "email": email}


@pytest.fixture(scope="session")
def trial_headers(trial_user):
    return {"Authorization": f"Bearer {trial_user['token']}"}


@pytest.fixture(scope="session")
def free_user(http):
    """Register a user then directly expire it in Mongo to simulate a FREE user."""
    email = f"test.free.{uuid.uuid4().hex[:8]}@statlinetest.com"
    r = http.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "name": "TEST Free"
    })
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    user_id = r.json()["user"]["id"]
    # Force-expire trial
    _db.users.update_one({"id": user_id}, {"$set": {"subscription_status": "expired"}})
    return {"token": token, "user_id": user_id, "email": email}


@pytest.fixture(scope="session")
def free_headers(free_user):
    return {"Authorization": f"Bearer {free_user['token']}"}


@pytest.fixture(scope="session", autouse=True)
def cleanup():
    yield
    _db.users.delete_many({"email": {"$regex": "@statlinetest\\.com$"}})
    _db.tracked_matches.delete_many({})  # only test users tracked here


# ---------- health ----------
def test_health(http):
    r = http.get(f"{API}/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ---------- auth ----------
class TestAuth:
    def test_register_creates_trial(self, trial_user):
        u = trial_user["user"]
        assert u["subscription_status"] == "trial"
        assert u["plan"] is None
        assert u["trial_start_date"] and u["trial_end_date"]
        # ~7 days apart
        from datetime import datetime
        s = datetime.fromisoformat(u["trial_start_date"])
        e = datetime.fromisoformat(u["trial_end_date"])
        diff_days = (e - s).total_seconds() / 86400
        assert 6.9 < diff_days < 7.1

    def test_register_duplicate_email_400(self, http, trial_user):
        r = http.post(f"{API}/auth/register", json={
            "email": trial_user["email"], "password": "Passw0rd!", "name": "dup"
        })
        assert r.status_code == 400

    def test_login_success(self, http, trial_user):
        r = http.post(f"{API}/auth/login", json={
            "email": trial_user["email"], "password": "Passw0rd!"
        })
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_invalid(self, http):
        r = http.post(f"{API}/auth/login", json={
            "email": "nobody.unknown@statlinetest.com", "password": "wrong"
        })
        assert r.status_code == 401

    def test_me_returns_subscription(self, http, trial_headers):
        r = http.get(f"{API}/auth/me", headers=trial_headers)
        assert r.status_code == 200
        body = r.json()
        assert "user" in body and "subscription" in body
        sub = body["subscription"]
        assert sub["is_pro"] is True
        assert sub["subscription_status"] == "trial"
        assert 6 <= sub["trial_days_left"] <= 7

    def test_me_unauthorized(self, http):
        r = http.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------- subscription ----------
class TestSubscription:
    def test_plans(self, http):
        r = http.get(f"{API}/subscription/plans")
        assert r.status_code == 200
        data = r.json()
        plans = {p["id"]: p for p in data["plans"]}
        assert plans["monthly"]["price"] == 8.99
        assert plans["yearly"]["price"] == 79.0
        assert plans["yearly"].get("recommended") is True
        assert "savings" in plans["yearly"]
        assert data.get("stripe_payment_link")

    def test_activate_yearly_then_idempotent(self, http, trial_headers):
        r1 = http.post(f"{API}/subscription/activate", json={"plan": "yearly"}, headers=trial_headers)
        assert r1.status_code == 200, r1.text
        s1 = r1.json()
        assert s1["subscription_status"] == "active"
        assert s1["plan"] == "yearly"
        assert s1["is_pro"] is True
        # second call same plan - no error, still active
        r2 = http.post(f"{API}/subscription/activate", json={"plan": "yearly"}, headers=trial_headers)
        assert r2.status_code == 200
        s2 = r2.json()
        assert s2["subscription_status"] == "active"
        assert s2["plan"] == "yearly"


# ---------- sports ----------
class TestSports:
    def test_leagues_for_trial(self, http, trial_headers):
        r = http.get(f"{API}/sports/leagues", headers=trial_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["is_pro"] is True
        leagues = data["leagues"]
        assert len(leagues) == 9
        # trial -> all unlocked
        assert all(l["locked"] is False for l in leagues)

    def test_leagues_for_free(self, http, free_headers):
        r = http.get(f"{API}/sports/leagues", headers=free_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["is_pro"] is False
        locked = {l["key"]: l["locked"] for l in data["leagues"]}
        assert locked["soccer_epl"] is False
        assert locked["basketball_nba"] is False
        assert locked["soccer_spain_la_liga"] is True

    def test_matches_soccer_epl(self, http, trial_headers):
        r = http.get(f"{API}/sports/matches", headers=trial_headers, params={"sport": "soccer_epl"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data["matches"], list)
        if data["matches"]:
            m = data["matches"][0]
            assert "home_team" in m and "away_team" in m and "status" in m
            assert "id" in m
            pytest.first_match_id = m["id"]
            pytest.first_match_sport = m["sport"]

    def test_matches_locked_for_free(self, http, free_headers):
        r = http.get(f"{API}/sports/matches", headers=free_headers, params={"sport": "soccer_spain_la_liga"})
        assert r.status_code == 403

    def test_odds_pro(self, http, trial_headers):
        if not getattr(pytest, "first_match_id", None):
            pytest.skip("No EPL matches available right now to test odds")
        r = http.get(f"{API}/sports/odds", headers=trial_headers,
                     params={"sport": pytest.first_match_sport, "event_id": pytest.first_match_id})
        assert r.status_code == 200, r.text
        data = r.json()
        # odds returns dict; might be empty if event has no bookmaker yet but key should exist
        assert isinstance(data, dict)
        # If non-empty, structure should be valid
        if data:
            assert "bookmakers" in data

    def test_odds_blocked_for_free(self, http, free_headers):
        r = http.get(f"{API}/sports/odds", headers=free_headers,
                     params={"sport": "soccer_epl", "event_id": "any"})
        assert r.status_code == 403

    def test_teams(self, http, trial_headers):
        r = http.get(f"{API}/sports/teams", headers=trial_headers, params={"sport": "soccer_epl"})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["teams"], list)
        if data["teams"]:
            assert "name" in data["teams"][0]
            pytest.first_team_name = data["teams"][0]["name"]

    def test_players_pro_full_roster(self, http, trial_headers):
        team = getattr(pytest, "first_team_name", "Arsenal")
        r = http.get(f"{API}/sports/players", headers=trial_headers,
                     params={"sport": "soccer_epl", "team": team})
        assert r.status_code == 200
        data = r.json()
        assert data["source"] == "sample"
        assert data["is_pro"] is True
        assert data["locked_count"] == 0
        assert len(data["players"]) >= 5

    def test_players_free_partial(self, http, free_headers):
        r = http.get(f"{API}/sports/players", headers=free_headers,
                     params={"sport": "soccer_epl", "team": "Arsenal"})
        assert r.status_code == 200
        data = r.json()
        assert data["is_pro"] is False
        assert len(data["players"]) == 3
        assert data["locked_count"] >= 1


# ---------- match chart ----------
class TestMatchChart:
    @pytest.fixture(scope="class")
    def chart_user(self, http):
        """Separate user to isolate chart state from subscription tests."""
        email = f"test.chart.{uuid.uuid4().hex[:8]}@statlinetest.com"
        r = http.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd!", "name": "chart"
        })
        assert r.status_code == 200
        return {"token": r.json()["token"], "email": email,
                "headers": {"Authorization": f"Bearer {r.json()['token']}"}}

    def test_full_chart_crud(self, http, chart_user):
        h = chart_user["headers"]
        match = {
            "match_id": f"TESTMATCH_{uuid.uuid4().hex[:8]}",
            "sport": "soccer_epl",
            "home_team": "Arsenal",
            "away_team": "Chelsea",
            "commence_time": "2026-01-15T20:00:00Z",
            "league": "Premier League",
        }
        # initially empty
        r0 = http.get(f"{API}/chart", headers=h)
        assert r0.status_code == 200
        assert r0.json()["tracked"] == []

        # add
        r1 = http.post(f"{API}/chart", json=match, headers=h)
        assert r1.status_code == 200
        assert r1.json()["ok"] is True
        assert not r1.json().get("already")

        # idempotent add -> already=true
        r2 = http.post(f"{API}/chart", json=match, headers=h)
        assert r2.status_code == 200
        assert r2.json().get("already") is True

        # list - should contain enriched record
        r3 = http.get(f"{API}/chart", headers=h)
        tracked = r3.json()["tracked"]
        assert len(tracked) == 1
        t = tracked[0]
        assert t["match_id"] == match["match_id"]
        assert t["home_team"] == "Arsenal"
        assert "status" in t  # enriched

        # delete
        r4 = http.delete(f"{API}/chart/{match['match_id']}", headers=h)
        assert r4.status_code == 200
        assert r4.json()["ok"] is True

        # verify removed
        r5 = http.get(f"{API}/chart", headers=h)
        assert r5.json()["tracked"] == []
