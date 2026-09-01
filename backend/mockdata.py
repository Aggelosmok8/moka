"""Deterministic built-in mock dataset — used as a fallback whenever the live
API returns nothing (e.g. free-plan daily quota exhausted or account inactive),
so users can always browse/test leagues, teams, players and basketball.

No network, no API credits. Data is stable (seeded by name) across restarts.
Team logos are omitted on purpose (frontend Crest falls back to initials).
"""
import hashlib
from datetime import datetime, timezone, timedelta

TEAMS = {
    "epl": ["Manchester City", "Arsenal", "Liverpool", "Aston Villa", "Tottenham Hotspur",
            "Chelsea", "Newcastle United", "Manchester United", "West Ham United", "Brighton",
            "Everton", "Fulham", "Crystal Palace", "Brentford", "Wolves",
            "Nottingham Forest", "Bournemouth", "Burnley", "Sheffield United", "Luton Town"],
    "laliga": ["Real Madrid", "Barcelona", "Girona", "Atletico Madrid", "Athletic Club",
               "Real Sociedad", "Real Betis", "Villarreal", "Valencia", "Sevilla",
               "Osasuna", "Getafe", "Rayo Vallecano", "Celta Vigo", "Mallorca",
               "Las Palmas", "Alaves", "Cadiz", "Granada", "Almeria"],
    "seriea": ["Inter", "Juventus", "AC Milan", "Napoli", "Roma", "Atalanta", "Lazio",
               "Fiorentina", "Bologna", "Torino", "Monza", "Genoa", "Lecce", "Udinese",
               "Cagliari", "Empoli", "Frosinone", "Sassuolo", "Verona", "Salernitana"],
    "bundesliga": ["Bayer Leverkusen", "Bayern Munich", "Stuttgart", "RB Leipzig", "Borussia Dortmund",
                   "Eintracht Frankfurt", "Hoffenheim", "Freiburg", "Augsburg", "Werder Bremen",
                   "Wolfsburg", "Borussia Monchengladbach", "Union Berlin", "Bochum", "Heidenheim",
                   "Mainz 05", "Koln", "Darmstadt"],
    "ligue1": ["Paris Saint-Germain", "Monaco", "Brest", "Lille", "Nice", "Lens", "Marseille",
               "Lyon", "Rennes", "Reims", "Toulouse", "Montpellier", "Strasbourg", "Nantes",
               "Le Havre", "Metz", "Lorient", "Clermont Foot"],
    "eredivisie": ["PSV Eindhoven", "Feyenoord", "Ajax", "AZ Alkmaar", "Twente", "Sparta Rotterdam",
                   "Go Ahead Eagles", "Utrecht", "NEC Nijmegen", "Fortuna Sittard", "Heerenveen",
                   "PEC Zwolle", "Heracles", "Almere City", "RKC Waalwijk", "Excelsior",
                   "Vitesse", "Volendam"],
    "primeira": ["Sporting CP", "Benfica", "Porto", "Braga", "Vitoria Guimaraes", "Moreirense",
                 "Famalicao", "Farense", "Gil Vicente", "Estoril", "Boavista", "Casa Pia",
                 "Rio Ave", "Estrela Amadora", "Vizela", "Portimonense", "Chaves", "Arouca"],
    "championship": ["Leicester City", "Ipswich Town", "Leeds United", "Southampton", "West Bromwich Albion",
                     "Norwich City", "Hull City", "Coventry City", "Middlesbrough", "Preston North End",
                     "Cardiff City", "Bristol City", "Sunderland", "Watford", "Stoke City",
                     "Millwall", "Blackburn Rovers", "Swansea City", "QPR", "Birmingham City"],
    "superleague": ["PAOK", "AEK Athens", "Panathinaikos", "Olympiacos", "Aris", "Panetolikos",
                    "OFI Crete", "Asteras Tripolis", "Atromitos", "Lamia", "Kifisia", "Volos",
                    "PAS Giannina", "Panserraikos"],
    "denmark": ["FC Copenhagen", "Brondby", "Midtjylland", "Nordsjaelland", "AGF", "Silkeborg",
                "Viborg", "Randers", "Lyngby", "OB Odense", "Hvidovre", "Vejle"],
    "scotland": ["Celtic", "Rangers", "Hearts", "Kilmarnock", "St Mirren", "Hibernian",
                 "Dundee", "Motherwell", "Aberdeen", "St Johnstone", "Ross County", "Livingston"],
    # Basketball
    "nba": ["Boston Celtics", "Denver Nuggets", "Oklahoma City Thunder", "Minnesota Timberwolves",
            "Milwaukee Bucks", "Los Angeles Clippers", "Dallas Mavericks", "Phoenix Suns",
            "New York Knicks", "Cleveland Cavaliers", "New Orleans Pelicans", "Los Angeles Lakers",
            "Sacramento Kings", "Philadelphia 76ers", "Indiana Pacers", "Miami Heat",
            "Golden State Warriors", "Chicago Bulls", "Atlanta Hawks", "Toronto Raptors"],
    "euroleague": ["Real Madrid", "Panathinaikos", "Barcelona", "Fenerbahce", "Olympiacos",
                   "Monaco", "Maccabi Tel Aviv", "Virtus Bologna", "Baskonia", "Zalgiris",
                   "Efes", "Partizan", "Bayern Munich", "Crvena Zvezda", "ASVEL", "Valencia"],
}

BASKET = {"nba", "euroleague"}

LEAGUE_NAMES = {
    "epl": "Premier League (England)", "laliga": "La Liga (Spain)", "seriea": "Serie A (Italy)",
    "bundesliga": "Bundesliga (Germany)", "ligue1": "Ligue 1 (France)", "eredivisie": "Eredivisie (Netherlands)",
    "primeira": "Primeira Liga (Portugal)", "championship": "Championship (England)",
    "superleague": "Super League 1 (Greece)", "denmark": "Superliga (Denmark)", "scotland": "Premiership (Scotland)",
    "nba": "NBA (USA)", "euroleague": "EuroLeague",
}


def _league_name(slug):
    return LEAGUE_NAMES.get(slug, slug)

_FIRST = ["Lucas", "Marco", "David", "Alex", "Daniel", "Leon", "Mateo", "Noah", "Erik", "Jonas",
          "Kevin", "Adam", "Youssef", "Diego", "Filip", "Andreas", "Rasmus", "Tomas", "Pavel", "Ivan",
          "Carlos", "Bruno", "Nikola", "Sam", "Oliver", "Max", "Felix", "Jan", "Luka", "Milan"]
_LAST = ["Silva", "Johansen", "Muller", "Rossi", "Garcia", "Nielsen", "Andersen", "Kowalski", "Novak", "Petrov",
         "Costa", "Berg", "Hansen", "Lopez", "Schmidt", "Dubois", "Moreau", "Ferrari", "Jensen", "Larsen",
         "Martin", "Bianchi", "Popovic", "Wright", "Walker", "Fischer", "Nowak", "Horvat", "Ilic", "Vidal"]


def _h(s: str) -> int:
    return int(hashlib.md5(s.encode()).hexdigest(), 16)


def standings(slug: str) -> list:
    names = TEAMS.get(slug, [])
    basket = slug in BASKET
    out = []
    for i, name in enumerate(names):
        h = _h(f"{slug}:{name}")
        played = 34 if not basket else 60
        if basket:
            wins = 60 - i * 2 - (h % 4)
            wins = max(10, min(60, wins))
            losses = played - wins
            out.append({
                "id": f"m_{slug}_{i}", "name": name, "image": None,
                "position": i + 1, "points": wins, "played": played,
                "wins": wins, "losses": losses,
                "winPct": round(wins / played, 3),
                "form": [], "goalsPerGame": None, "concededPerGame": None,
                "leagueName": _league_name(slug), "sport": "basketball",
            })
        else:
            pts = 88 - i * 3 - (h % 3)
            pts = max(20, pts)
            gpg = round(2.6 - i * 0.07 + (h % 5) * 0.03, 2)
            cpg = round(0.7 + i * 0.06 + (h % 4) * 0.03, 2)
            form = [("W", "D", "L")[(h >> (k * 2)) % 3] for k in range(5)]
            out.append({
                "id": f"m_{slug}_{i}", "name": name, "image": None,
                "position": i + 1, "points": pts, "played": played,
                "form": form, "goalsPerGame": max(0.4, gpg),
                "concededPerGame": max(0.3, cpg),
                "leagueName": _league_name(slug), "sport": "football",
            })
    if slug in BASKET:
        out.sort(key=lambda r: r["wins"], reverse=True)
        for i, r in enumerate(out):
            r["position"] = i + 1
    return out


def _iso(days):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def fixtures(slug: str) -> dict:
    names = TEAMS.get(slug, [])
    if slug in BASKET or len(names) < 2:
        return {"upcoming": [], "results": []}
    results, upcoming = [], []
    n = len(names)
    for i in range(min(10, n // 2)):
        h, a = names[i], names[n - 1 - i]
        hh = _h(f"{slug}:res:{h}:{a}")
        results.append({
            "id": f"m_{slug}_r{i}", "home": h, "away": a, "homeImg": None, "awayImg": None,
            "kickoff": _iso(-(i + 1) * 3), "homeScore": hh % 4, "awayScore": (hh >> 3) % 4,
            "finished": True,
        })
    for i in range(min(10, n // 2)):
        h, a = names[(i + 1) % n], names[(n - 2 - i) % n]
        upcoming.append({
            "id": f"m_{slug}_u{i}", "home": h, "away": a, "homeImg": None, "awayImg": None,
            "kickoff": _iso((i + 1) * 2), "homeScore": None, "awayScore": None, "finished": False,
        })
    return {"upcoming": upcoming, "results": results}


_POS = [("Goalkeeper", 3), ("Defender", 8), ("Midfielder", 7), ("Attacker", 4)]


def players_for_mock_team(team_id: str) -> list:
    """team_id like 'm_<slug>_<idx>' -> deterministic squad."""
    seed = _h(team_id)
    players, num = [], 1
    for pos, count in _POS:
        for k in range(count):
            s = seed + _h(f"{pos}{k}")
            fn = _FIRST[s % len(_FIRST)]
            ln = _LAST[(s >> 5) % len(_LAST)]
            players.append({
                "id": f"{team_id}_p{num}", "name": f"{fn} {ln}",
                "number": num, "position": pos, "photo": None,
                "age": 19 + (s % 17),
            })
            num += 1
    return players
