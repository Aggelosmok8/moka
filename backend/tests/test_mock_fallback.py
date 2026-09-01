"""Tests for the sports-stats mock fallback (leagues/teams/players/basketball)."""
import os

import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://teams-hub-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

FOOTBALL_SLUGS = ["epl", "laliga", "seriea", "bundesliga", "ligue1", "eredivisie",
                  "primeira", "championship", "superleague", "denmark", "scotland"]
BASKET_SLUGS = ["nba", "euroleague"]


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- leagues catalog ---
def test_leagues_catalog(client):
    r = client.get(f"{API}/leagues", timeout=60)
    assert r.status_code == 200, r.text
    leagues = r.json()["leagues"]
    assert len(leagues) == 13, f"expected 13 leagues, got {len(leagues)}"
    slugs = [l["id"] for l in leagues]
    for s in FOOTBALL_SLUGS + BASKET_SLUGS:
        assert s in slugs
    sports = {l["sport"] for l in leagues}
    assert sports == {"football", "basketball"}


# --- teams endpoint (mock fallback) ---
def test_teams_epl_returns_20(client):
    r = client.get(f"{API}/teams", params={"league": "epl"}, timeout=90)
    assert r.status_code == 200, r.text
    teams = r.json()["teams"]
    assert len(teams) == 20, f"expected 20 EPL teams, got {len(teams)}"
    names = [t["name"] for t in teams]
    assert "Manchester City" in names
    t0 = teams[0]
    for f in ("id", "name", "position", "points", "played", "form", "sport"):
        assert f in t0
    assert t0["sport"] == "football"
    assert isinstance(t0["form"], list) and len(t0["form"]) == 5


@pytest.mark.parametrize("slug", FOOTBALL_SLUGS + BASKET_SLUGS)
def test_teams_non_empty_all_leagues(client, slug):
    r = client.get(f"{API}/teams", params={"league": slug}, timeout=90)
    assert r.status_code == 200, r.text
    teams = r.json()["teams"]
    assert len(teams) >= 10, f"{slug} returned only {len(teams)} teams"
    assert all(t.get("name") for t in teams)


def test_teams_invalid_league(client):
    r = client.get(f"{API}/teams", params={"league": "not_a_league"}, timeout=60)
    assert r.status_code == 200
    assert r.json()["teams"] == []


def test_teams_limit(client):
    r = client.get(f"{API}/teams", params={"league": "epl", "limit": 5}, timeout=60)
    assert r.status_code == 200
    assert len(r.json()["teams"]) == 5


# --- league detail ---
def test_league_detail_seriea_populated(client):
    r = client.get(f"{API}/leagues/seriea", timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["slug"] == "seriea"
    assert d["sport"] == "football"
    assert len(d["standings"]) == 20
    assert len(d["results"]) > 0, "results empty"
    assert len(d["upcoming"]) > 0, "upcoming empty"
    res = d["results"][0]
    assert res["finished"] is True
    assert isinstance(res["homeScore"], int) and isinstance(res["awayScore"], int)
    up = d["upcoming"][0]
    assert up["finished"] is False and up["homeScore"] is None
    assert up["home"] and up["away"] and up["kickoff"]


def test_league_detail_nba_basketball(client):
    r = client.get(f"{API}/leagues/nba", timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["sport"] == "basketball"
    st = d["standings"]
    assert len(st) >= 16, f"nba standings {len(st)}"
    names = [t["name"] for t in st]
    assert "Boston Celtics" in names
    t0 = st[0]
    for f in ("wins", "losses", "winPct"):
        assert f in t0 and t0[f] is not None, f"missing {f}"
    assert t0["wins"] + t0["losses"] == t0["played"]
    assert d["upcoming"] == [] and d["results"] == []


def test_league_detail_404(client):
    r = client.get(f"{API}/leagues/zzz", timeout=60)
    assert r.status_code == 404


# --- players / squad ---
def test_players_mock_team_22(client):
    r = client.get(f"{API}/teams/m_epl_0/players", timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["team_id"] == "m_epl_0"
    players = d["players"]
    assert len(players) == 22, f"expected 22 players, got {len(players)}"
    positions = {p["position"] for p in players}
    assert positions == {"Goalkeeper", "Defender", "Midfielder", "Attacker"}
    p = players[0]
    assert p["id"].startswith("m_epl_0_p")
    assert p["name"] and " " in p["name"]
    assert isinstance(p["number"], int)
    assert isinstance(p["age"], int)
    # deterministic
    r2 = client.get(f"{API}/teams/m_epl_0/players", timeout=60)
    assert r2.json()["players"] == players


def test_players_other_league_team(client):
    r = client.get(f"{API}/teams/m_laliga_1/players", timeout=90)
    assert r.status_code == 200
    assert len(r.json()["players"]) == 22


def test_team_detail_mock_id(client):
    r = client.get(f"{API}/teams/m_epl_0", timeout=120)
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["name"] == "Manchester City"
    assert "_id" not in t


def test_team_detail_unknown(client):
    r = client.get(f"{API}/teams/does_not_exist_123", timeout=120)
    assert r.status_code == 404


def test_teams_top(client):
    r = client.get(f"{API}/teams/top", params={"limit": 5}, timeout=90)
    assert r.status_code == 200
    assert len(r.json()["teams"]) == 5
