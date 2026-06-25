"""Mock football analytics data for top 5 European leagues."""
import random

LEAGUES = [
    {"id": "epl", "name": "Premier League", "country": "England", "short": "EPL"},
    {"id": "laliga", "name": "La Liga", "country": "Spain", "short": "ESP"},
    {"id": "seriea", "name": "Serie A", "country": "Italy", "short": "ITA"},
    {"id": "bundesliga", "name": "Bundesliga", "country": "Germany", "short": "GER"},
    {"id": "ligue1", "name": "Ligue 1", "country": "France", "short": "FRA"},
]

TEAMS_RAW = [
    # (id, name, short, league_id, color, api-sports logo id)
    # EPL
    ("man-city", "Manchester City", "MCI", "epl", "#6CABDD", 50),
    ("arsenal", "Arsenal", "ARS", "epl", "#EF0107", 42),
    ("liverpool", "Liverpool", "LIV", "epl", "#C8102E", 40),
    ("man-united", "Manchester United", "MUN", "epl", "#DA291C", 33),
    ("chelsea", "Chelsea", "CHE", "epl", "#034694", 49),
    ("tottenham", "Tottenham", "TOT", "epl", "#132257", 47),
    ("newcastle", "Newcastle", "NEW", "epl", "#241F20", 34),
    ("aston-villa", "Aston Villa", "AVL", "epl", "#670E36", 66),
    # La Liga
    ("real-madrid", "Real Madrid", "RMA", "laliga", "#FEBE10", 541),
    ("barcelona", "Barcelona", "BAR", "laliga", "#A50044", 529),
    ("atletico", "Atlético Madrid", "ATM", "laliga", "#CB3524", 530),
    ("sevilla", "Sevilla", "SEV", "laliga", "#D00027", 536),
    ("real-sociedad", "Real Sociedad", "RSO", "laliga", "#143C8B", 548),
    ("villarreal", "Villarreal", "VIL", "laliga", "#FFE667", 533),
    # Serie A
    ("inter", "Inter Milan", "INT", "seriea", "#0068A8", 505),
    ("juventus", "Juventus", "JUV", "seriea", "#FFFFFF", 496),
    ("milan", "AC Milan", "MIL", "seriea", "#FB090B", 489),
    ("napoli", "Napoli", "NAP", "seriea", "#12A0D7", 492),
    ("roma", "AS Roma", "ROM", "seriea", "#8E1F2F", 497),
    ("lazio", "Lazio", "LAZ", "seriea", "#87CEEB", 487),
    # Bundesliga
    ("bayern", "Bayern Munich", "BAY", "bundesliga", "#DC052D", 157),
    ("dortmund", "Dortmund", "BVB", "bundesliga", "#FDE100", 165),
    ("leverkusen", "Leverkusen", "B04", "bundesliga", "#E32221", 168),
    ("leipzig", "RB Leipzig", "RBL", "bundesliga", "#DD0741", 173),
    ("stuttgart", "Stuttgart", "STU", "bundesliga", "#E32219", 172),
    ("frankfurt", "Frankfurt", "SGE", "bundesliga", "#E1000F", 169),
    # Ligue 1
    ("psg", "Paris SG", "PSG", "ligue1", "#004170", 85),
    ("marseille", "Marseille", "OM", "ligue1", "#2FAEE0", 81),
    ("monaco", "Monaco", "MON", "ligue1", "#CC092F", 91),
    ("lyon", "Lyon", "OL", "ligue1", "#003399", 80),
    ("lille", "Lille", "LIL", "ligue1", "#E01E13", 79),
    ("nice", "Nice", "NCE", "ligue1", "#ED1C24", 84),
]

LEAGUE_MAP = {lg["id"]: lg for lg in LEAGUES}


def _seed_team(idx, raw):
    tid, name, short, league_id, color, logo_id = raw
    rnd = random.Random(idx + 7)
    matches_played = rnd.randint(22, 26)
    goals_scored = rnd.randint(28, 70)
    goals_conceded = rnd.randint(15, 45)
    wins = rnd.randint(6, 18)
    draws = rnd.randint(2, 8)
    losses = matches_played - wins - draws
    if losses < 0:
        losses = 0
    points = wins * 3 + draws
    form = [rnd.choice(["W", "W", "W", "D", "L"]) for _ in range(5)]
    btts_pct = rnd.randint(40, 75)
    over25_pct = rnd.randint(45, 80)
    under25_pct = 100 - over25_pct
    clean_sheets_pct = rnd.randint(20, 55)
    return {
        "id": tid,
        "name": name,
        "short": short,
        "color": color,
        "apiId": logo_id,
        "logoUrl": f"https://media.api-sports.io/football/teams/{logo_id}.png",
        "leagueId": league_id,
        "leagueName": LEAGUE_MAP[league_id]["name"],
        "rank": 0,  # filled later per league
        "matchesPlayed": matches_played,
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "points": points,
        "goalsScored": goals_scored,
        "goalsConceded": goals_conceded,
        "goalDiff": goals_scored - goals_conceded,
        "goalsPerGame": round(goals_scored / matches_played, 2),
        "concededPerGame": round(goals_conceded / matches_played, 2),
        "shotsPerGame": round(rnd.uniform(9.5, 18.4), 1),
        "shotsOnTargetPerGame": round(rnd.uniform(3.5, 7.8), 1),
        "possession": rnd.randint(42, 67),
        "passAccuracy": rnd.randint(75, 91),
        "cornersPerGame": round(rnd.uniform(3.8, 7.2), 1),
        "foulsPerGame": round(rnd.uniform(8.5, 14.0), 1),
        "yellowsPerGame": round(rnd.uniform(1.4, 3.2), 1),
        "cleanSheetsPct": clean_sheets_pct,
        "btts": btts_pct,
        "over25": over25_pct,
        "under25": under25_pct,
        "form": form,
        "radar": {
            "attack": rnd.randint(50, 95),
            "defense": rnd.randint(45, 92),
            "possession": rnd.randint(50, 90),
            "pace": rnd.randint(55, 95),
            "discipline": rnd.randint(50, 90),
            "finishing": rnd.randint(55, 95),
        },
        "trendGoals": [rnd.randint(0, 4) for _ in range(10)],
        "trendConceded": [rnd.randint(0, 3) for _ in range(10)],
    }


TEAMS = [_seed_team(i, raw) for i, raw in enumerate(TEAMS_RAW)]

# Assign rank within league
_by_league = {}
for t in TEAMS:
    _by_league.setdefault(t["leagueId"], []).append(t)
for lid, lst in _by_league.items():
    lst.sort(key=lambda x: (-x["points"], -x["goalDiff"]))
    for i, t in enumerate(lst):
        t["rank"] = i + 1

TEAM_MAP = {t["id"]: t for t in TEAMS}


def _seed_recent_matches(team_id):
    rnd = random.Random(hash(team_id) % 99991)
    pool = [t for t in TEAMS if t["id"] != team_id]
    results = []
    for i in range(6):
        opp = rnd.choice(pool)
        home = rnd.random() > 0.5
        a = rnd.randint(0, 4)
        b = rnd.randint(0, 4)
        results.append({
            "id": f"{team_id}-rm-{i}",
            "home": team_id if home else opp["id"],
            "away": opp["id"] if home else team_id,
            "homeName": TEAM_MAP[team_id]["short"] if home else opp["short"],
            "awayName": opp["short"] if home else TEAM_MAP[team_id]["short"],
            "homeScore": a,
            "awayScore": b,
            "date": f"2026-02-{(20 - i*3):02d}",
            "competition": LEAGUE_MAP[TEAM_MAP[team_id]["leagueId"]]["short"],
        })
    return results


def get_team_detail(team_id):
    t = TEAM_MAP.get(team_id)
    if not t:
        return None
    return {**t, "recentMatches": _seed_recent_matches(team_id)}


def _seed_match(idx, home_id, away_id, status="upcoming"):
    rnd = random.Random(idx * 31 + 11)
    home = TEAM_MAP[home_id]
    away = TEAM_MAP[away_id]
    home_score = rnd.randint(0, 4) if status != "upcoming" else None
    away_score = rnd.randint(0, 4) if status != "upcoming" else None
    minute = rnd.randint(12, 87) if status == "live" else None
    return {
        "id": f"m-{idx}",
        "home": {"id": home_id, "name": home["name"], "short": home["short"], "color": home["color"], "logoUrl": home["logoUrl"], "form": home["form"]},
        "away": {"id": away_id, "name": away["name"], "short": away["short"], "color": away["color"], "logoUrl": away["logoUrl"], "form": away["form"]},
        "homeScore": home_score,
        "awayScore": away_score,
        "status": status,
        "minute": minute,
        "leagueId": home["leagueId"],
        "leagueName": home["leagueName"],
        "kickoff": "2026-02-22T19:30:00Z",
        "venue": f"{home['name']} Stadium",
        "predictedStrength": {
            "home": rnd.randint(45, 72),
            "draw": rnd.randint(18, 30),
            "away": rnd.randint(20, 55),
        },
    }


# Normalize predictedStrength to sum to ~100
def _normalize_match(m):
    p = m["predictedStrength"]
    total = p["home"] + p["draw"] + p["away"]
    m["predictedStrength"] = {
        "home": round(p["home"] / total * 100),
        "draw": round(p["draw"] / total * 100),
        "away": round(p["away"] / total * 100),
    }
    return m


_MATCH_PAIRS = [
    ("man-city", "arsenal", "live"),
    ("real-madrid", "barcelona", "live"),
    ("inter", "juventus", "upcoming"),
    ("bayern", "dortmund", "upcoming"),
    ("psg", "marseille", "upcoming"),
    ("liverpool", "chelsea", "upcoming"),
    ("atletico", "sevilla", "upcoming"),
    ("milan", "napoli", "finished"),
    ("leverkusen", "leipzig", "upcoming"),
    ("monaco", "lyon", "upcoming"),
    ("tottenham", "newcastle", "finished"),
    ("villarreal", "real-sociedad", "upcoming"),
]

MATCHES = [_normalize_match(_seed_match(i, h, a, s)) for i, (h, a, s) in enumerate(_MATCH_PAIRS)]
MATCH_MAP = {m["id"]: m for m in MATCHES}


def get_match_detail(match_id):
    m = MATCH_MAP.get(match_id)
    if not m:
        return None
    home_t = get_team_detail(m["home"]["id"])
    away_t = get_team_detail(m["away"]["id"])
    return {
        **m,
        "homeTeam": home_t,
        "awayTeam": away_t,
        "h2h": [
            {"date": "2025-11-08", "homeScore": 2, "awayScore": 1, "homeShort": m["home"]["short"], "awayShort": m["away"]["short"]},
            {"date": "2025-04-21", "homeScore": 1, "awayScore": 1, "homeShort": m["away"]["short"], "awayShort": m["home"]["short"]},
            {"date": "2024-10-12", "homeScore": 0, "awayScore": 3, "homeShort": m["home"]["short"], "awayShort": m["away"]["short"]},
        ],
    }


def get_top_teams(limit=8):
    sorted_teams = sorted(TEAMS, key=lambda x: (-x["points"], -x["goalDiff"]))
    return sorted_teams[:limit]


def get_trending_matches():
    # live first, then upcoming, then finished
    order = {"live": 0, "upcoming": 1, "finished": 2}
    return sorted(MATCHES, key=lambda x: order.get(x["status"], 3))
