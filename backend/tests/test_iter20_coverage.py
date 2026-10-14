"""Iteration 20 regression tests.

Covers:
  * Specific Bets: Corners/Cards fully priced (many lines on Scottish/Danish
    fixtures via Sportmonks; 3-way-market whole-number corners via API-Football).
  * NO whole-number priced line on Goals / First-Half / Team Goals / Player props.
  * Odense vs Brondby (live_af_1549037): ~73/88 priced player rows including
    'to assist' and 'to be carded' and bookmaker canonicalised to 'Bet365'.
  * Fouls / Offsides / GK Saves / Score At Any Time stay unpriced BY DESIGN
    with the explanatory note.
  * LION tickets still render (count>=25, <=6 legs, parlay math holds).
  * /api/value-matches populated with >100 matches.
"""
import os
import re
from urllib.parse import urlparse

import pytest
import requests

BASE_URL = os.environ.get("VITE_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL") or "https://teams-hub-1.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

QA_EMAIL = "qa.owner@lionstats.app"
QA_PASS = "Qa-593ca402f165abc1!"

GREEK = {
    "stoiximan", "novibet", "pame stoixima", "pamestoixima", "opap", "elabet",
    "bwin", "bet365", "betsson", "netbet", "interwetten", "winmasters", "fonbet",
    "superbet", "vistabet", "sportingbet", "efbet",
}


def _canon_bk(name: str) -> str:
    return (name or "").strip().lower().replace(".gr", "").strip()


@pytest.fixture(scope="session")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": QA_EMAIL, "password": QA_PASS},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    tok = r.json().get("session_token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ----- /api/value-matches -----------------------------------------------------

def test_value_matches_populated():
    r = requests.get(f"{BASE_URL}/api/value-matches", timeout=60)
    assert r.status_code == 200
    d = r.json()
    assert d.get("count", 0) > 100
    assert isinstance(d.get("matches"), list)
    assert d["count"] == len(d["matches"])


# ----- Specific Bets ---------------------------------------------------------

FIXTURES = [
    "live_af_1549037",  # Odense vs Brondby (Danish Superliga, Sportmonks coverage)
    "live_af_1575188",  # Union Berlin vs Dortmund (Bundesliga, API-Football 3-way corners)
    "live_af_1557428",  # Brentford vs Liverpool (Premier League)
]


@pytest.fixture(scope="session")
def sb(auth):
    out = {}
    for fid in FIXTURES:
        r = requests.get(
            f"{BASE_URL}/api/specific-bets/{fid}", headers=auth, timeout=120
        )
        assert r.status_code == 200, f"{fid}: {r.status_code} {r.text[:200]}"
        out[fid] = r.json()
    return out


def _panel(data, title_substr):
    return next((p for p in data.get("panels", []) if title_substr in (p.get("title") or "")), None)


def _priced(panel):
    return [r for r in (panel or {}).get("rows", []) if r.get("odds")]


@pytest.mark.parametrize("fid", FIXTURES)
def test_cards_panel_fully_priced(sb, fid):
    p = _panel(sb[fid], "Cards")
    assert p is not None
    rows, pr = p["rows"], _priced(p)
    assert len(rows) == len(pr), f"{fid} Cards: {len(pr)}/{len(rows)} priced"
    assert len(pr) >= 2


@pytest.mark.parametrize("fid", FIXTURES)
def test_corners_panel_fully_priced(sb, fid):
    p = _panel(sb[fid], "Corners")
    assert p is not None
    rows, pr = p["rows"], _priced(p)
    assert len(rows) == len(pr), f"{fid} Corners: {len(pr)}/{len(rows)} priced"
    assert len(pr) >= 2


def test_corners_bundesliga_has_many_whole_number_lines(sb):
    # Union Berlin vs Dortmund — API-Football 3-way market exposes 20+ whole-number lines
    p = _panel(sb["live_af_1575188"], "Corners")
    pr = _priced(p)
    whole = [r for r in pr if re.search(r"_\d+$", r.get("pick") or "")]
    assert len(pr) >= 20, f"expected ~20-24 priced corner rows, got {len(pr)}"
    assert len(whole) >= 15, f"expected whole-number corner lines, got {len(whole)}"


@pytest.mark.parametrize("fid", FIXTURES)
@pytest.mark.parametrize("title", ["Goals Over / Under", "Team Goals", "First Half"])
def test_no_whole_number_priced_in_forbidden_markets(sb, fid, title):
    p = _panel(sb[fid], title)
    if not p:
        pytest.skip(f"no '{title}' panel on {fid}")
    pr = _priced(p)
    bad = [r["pick"] for r in pr if re.search(r"_\d+$", r.get("pick") or "")]
    assert bad == [], f"{fid} '{title}' has priced whole-number lines: {bad}"


@pytest.mark.parametrize("fid", FIXTURES)
@pytest.mark.parametrize("title", ["Score At Any Time", "Fouls", "Offsides", "Goalkeeper Saves"])
def test_unpriced_markets_show_explanatory_note(sb, fid, title):
    p = _panel(sb[fid], title)
    assert p is not None, f"{fid} missing '{title}' panel"
    assert _priced(p) == [], f"{fid} '{title}' is priced but shouldn't be"
    assert "No bookmaker prices this market" in (p.get("note") or ""), (
        f"{fid} '{title}' note missing: {p.get('note')!r}"
    )


@pytest.mark.parametrize("fid", FIXTURES)
def test_no_whole_number_priced_player_props(sb, fid):
    bad = []
    for pl in sb[fid].get("players", []) or []:
        for r in pl.get("rows", []) or []:
            if r.get("odds") and re.search(r"_\d+$", r.get("pick") or ""):
                bad.append(r["pick"])
    assert bad == [], f"{fid}: priced whole-number player rows: {bad[:5]}"


@pytest.mark.parametrize("fid", FIXTURES)
def test_priced_rows_use_only_greek_bookmakers(sb, fid):
    bad = []
    panels = sb[fid].get("panels", []) + [p for pl in sb[fid].get("players", []) for p in [pl]]
    for p in sb[fid].get("panels", []):
        for r in p.get("rows", []):
            if not r.get("odds"):
                continue
            bk = _canon_bk(r.get("bookmaker"))
            if bk not in GREEK:
                bad.append((p.get("title"), r.get("pick"), r.get("bookmaker")))
    for pl in sb[fid].get("players", []) or []:
        for r in pl.get("rows", []) or []:
            if not r.get("odds"):
                continue
            bk = _canon_bk(r.get("bookmaker"))
            if bk not in GREEK:
                bad.append(("player", r.get("pick"), r.get("bookmaker")))
    assert bad == [], f"{fid} non-greek bookmakers: {bad[:5]}"


# ----- Odense vs Brondby — Sportmonks player coverage ------------------------

def test_odense_brondby_player_rows_priced(sb):
    d = sb["live_af_1549037"]
    tot, priced = 0, 0
    assist_priced = carded_priced = 0
    assist_tot = carded_tot = 0
    bks = set()
    for pl in d.get("players", []) or []:
        for r in pl.get("rows", []) or []:
            tot += 1
            lbl = (r.get("selection") or r.get("market") or r.get("pick") or "").lower()
            if r.get("odds"):
                priced += 1
                bks.add(r.get("bookmaker"))
            if "assist" in lbl:
                assist_tot += 1
                if r.get("odds"):
                    assist_priced += 1
            if "card" in lbl or "booked" in lbl:
                carded_tot += 1
                if r.get("odds"):
                    carded_priced += 1
    assert priced >= 60, f"expected ~73 priced player rows, got {priced}/{tot}"
    assert assist_priced >= 1, "no 'to assist' priced rows"
    assert carded_priced >= 1, "no 'to be carded' priced rows"
    # Canonicalised bookmaker name
    assert "Bet365" in bks, f"expected canonical 'Bet365', got {bks}"


# ----- LION tickets ----------------------------------------------------------

def test_lion_tickets(auth):
    r = requests.get(f"{BASE_URL}/api/lion-tickets", headers=auth, timeout=180)
    assert r.status_code == 200
    d = r.json()
    tickets = d.get("tickets") or []
    assert len(tickets) >= 25, f"expected >=25 tickets, got {len(tickets)}"
    for t in tickets:
        legs = t.get("legs") or []
        assert 1 <= len(legs) <= 6, f"ticket {t.get('id')} legs={len(legs)}"
        prod = 1.0
        for lg in legs:
            prod *= float(lg["odds"])
            assert _canon_bk(lg.get("bookmaker")) in GREEK, (
                f"non-greek bookmaker on leg: {lg.get('bookmaker')}"
            )
        par = t.get("parlay")
        if par:
            assert float(par["odds"]) <= prod + 0.01, (
                f"parlay odds {par['odds']} > product {prod:.3f} on {t.get('id')}"
            )
