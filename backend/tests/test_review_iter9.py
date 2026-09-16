"""Backend regression for review iteration 9 (Olympiacos match, cups, Compare)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://teams-hub-1.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
PRO_TOKEN = "test-pro-monthly-token"


@pytest.fixture
def pro_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {PRO_TOKEN}"})
    return s


# -- /api/leagues: new cups present with correct ids --------------------------
class TestLeagues:
    def test_leagues_includes_new_cups(self, pro_client):
        r = pro_client.get(f"{BASE_URL}/api/leagues")
        assert r.status_code == 200, r.text
        data = r.json()
        leagues = data.get("leagues") or data
        ids = {l["id"] for l in leagues}
        for slug in ("portugalcup", "knvbbeker", "scottishcup", "danishcup", "greekcup"):
            assert slug in ids, f"missing league slug {slug}"

    def test_greekcup_apifootball_id_is_199(self):
        import sys, importlib
        sys.path.insert(0, "/app/backend")
        af = importlib.import_module("apifootball")
        assert af.CATALOG["greekcup"]["league_id"] == 199
        assert af.CATALOG["portugalcup"]["league_id"] == 96
        assert af.CATALOG["knvbbeker"]["league_id"] == 90
        assert af.CATALOG["scottishcup"]["league_id"] == 181
        assert af.CATALOG["danishcup"]["league_id"] == 121


# -- /api/value-matches: Europa League Olympiacos ------------------------------
class TestValueMatches:
    def test_value_matches_has_olympiacos_uel(self, pro_client):
        r = pro_client.get(f"{BASE_URL}/api/value-matches", timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        raw = data.get("matches") or data
        assert isinstance(raw, list) and len(raw) > 0
        found = False
        for item in raw:
            m = item.get("match") if isinstance(item, dict) and "match" in item else item
            h = (m or {}).get("home") or {}; a = (m or {}).get("away") or {}
            hn = h.get("name") if isinstance(h, dict) else str(h)
            an = a.get("name") if isinstance(a, dict) else str(a)
            names = f"{hn} {an}".lower()
            if ("olympiakos" in names or "olympiacos" in names) and "jagiellonia" in names:
                found = True; break
        assert found, "Olympiacos vs Jagiellonia not present in /api/value-matches"

    def test_max_per_league_is_14(self):
        import sys, importlib
        sys.path.insert(0, "/app/backend")
        lv = importlib.import_module("live_values")
        assert lv.MAX_PER_LEAGUE == 14


# -- /api/teams and /api/teams/{id}/players -----------------------------------
class TestTeamsAndPlayers:
    def test_teams_epl(self, pro_client):
        r = pro_client.get(f"{BASE_URL}/api/teams?league=epl")
        assert r.status_code == 200
        teams = r.json().get("teams") or []
        assert len(teams) > 0
        assert "id" in teams[0] and "name" in teams[0]

    def test_teams_new_cup_slug(self, pro_client):
        r = pro_client.get(f"{BASE_URL}/api/teams?league=portugalcup")
        assert r.status_code == 200
        # cup may return empty or mock — must not 500
        assert isinstance(r.json().get("teams"), list)

    def test_team_players_and_player_stats(self, pro_client):
        r = pro_client.get(f"{BASE_URL}/api/teams?league=epl")
        teams = r.json()["teams"]
        assert teams
        tid = teams[0]["id"]
        rp = pro_client.get(f"{BASE_URL}/api/teams/{tid}/players", timeout=30)
        assert rp.status_code == 200, rp.text
        players = rp.json().get("players") or []
        assert len(players) > 0
        pid = players[0]["id"]
        if str(pid).isdigit():
            rs = pro_client.get(f"{BASE_URL}/api/players/{pid}?team={tid}", timeout=30)
            # 404 acceptable if this specific player has no stats
            assert rs.status_code in (200, 404)


# -- /api/compare/ai ----------------------------------------------------------
class TestCompareAI:
    def test_missing_sides_returns_400(self, pro_client):
        r = pro_client.post(f"{BASE_URL}/api/compare/ai", json={"kind": "teams", "a": {}, "b": {}})
        assert r.status_code == 400

    def test_teams_returns_text(self, pro_client):
        payload = {"kind": "teams",
                   "a": {"name": "Arsenal", "goalsPerGame": 2.1, "concededPerGame": 0.9, "points": 45, "played": 20},
                   "b": {"name": "Chelsea", "goalsPerGame": 1.6, "concededPerGame": 1.2, "points": 35, "played": 20}}
        r = pro_client.post(f"{BASE_URL}/api/compare/ai", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # if OPENAI_API_KEY missing endpoint returns error:no_key with 200
        if data.get("error") == "no_key":
            pytest.skip("OPENAI_API_KEY not configured")
        assert isinstance(data.get("text"), str) and len(data["text"]) > 10

    def test_players_returns_text(self, pro_client):
        payload = {"kind": "players",
                   "a": {"name": "Player A", "goals": 12, "assists": 5, "appearances": 20},
                   "b": {"name": "Player B", "goals": 8,  "assists": 10, "appearances": 22}}
        r = pro_client.post(f"{BASE_URL}/api/compare/ai", json=payload, timeout=60)
        assert r.status_code == 200
        data = r.json()
        if data.get("error") == "no_key":
            pytest.skip("OPENAI_API_KEY not configured")
        assert isinstance(data.get("text"), str) and len(data["text"]) > 10
