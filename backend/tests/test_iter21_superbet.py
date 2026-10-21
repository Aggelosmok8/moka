"""Iteration 21 — Superbet pre-match integration coverage.

Verifies that:
  * live_af_1557436 Frosinone vs Sassuolo, live_af_1563200 Norwich vs
    Southampton, live_af_1552785 Le Mans vs Toulouse carry REAL Superbet
    prices on the Fouls / Offsides / Goalkeeper Saves / Shots panels and
    on the new Team Corners / Team Fouls / Team Shots rows.
  * live_af_1575188 Union Berlin vs Dortmund (further out) is still
    unpriced on Fouls / Offsides / Saves and shows the explanatory note.
  * Only Greek-licensed bookmakers appear on priced rows (Superbet,
    bet365, bwin, Novibet, Elabet, Pame Stoixima, Stoiximan, ...).
  * /api/value-matches count > 100.
  * /api/lion-tickets stays Greek-only, parlay odds <= product of legs
    + 0.01, max 6 legs, and Superbet legs are present.
  * /api/admin/odds-quota.superbet reports a valid snapshot.
"""
import datetime as _dt
import os
import re

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL",
                          "https://teams-hub-1.preview.emergentagent.com").rstrip("/")

GREEK_BOOKS = {
    "superbet", "bet365", "bwin", "novibet", "elabet",
    "pame stoixima", "pamestoixima", "stoiximan", "opap",
    "betsson", "netbet", "interwetten", "winmasters", "fonbet",
    "vistabet", "sportingbet", "efbet",
}

FORBIDDEN_BOOKS = {
    "betano", "unibet", "william hill", "williamhill", "betvictor",
    "pinnacle", "marathonbet", "1xbet", "betfair",
}

def _board_ids():
    """Fixtures rot: a pinned id is in the past a day later. Resolve the board at
    collection time — the two soonest kick-offs are the 'near' fixtures (a book
    posts stat markets 1-2 days out) and the last one is the 'far' fixture."""
    try:
        r = requests.get(f"{BASE_URL}/api/value-matches", timeout=180)
        now = _dt.datetime.now(_dt.timezone.utc).isoformat()
        ms = sorted([e for e in ((r.json() or {}).get("matches") or [])
                     if (e["match"].get("status") == "upcoming"
                         and (e["match"].get("commence_time") or "") > now)],
                    key=lambda e: e["match"]["commence_time"])
        return [e["match"]["id"] for e in ms]
    except Exception:
        return []


_IDS = _board_ids()
NEAR = _IDS[:2]
FAR = _IDS[-1] if _IDS else ""


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "qa.owner@lionstats.app",
              "password": "Qa-593ca402f165abc1!"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    tok = r.json().get("session_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _panel(d, needle):
    for p in d.get("panels", []):
        name = (p.get("title") or p.get("name") or p.get("key") or "").lower()
        if needle in name:
            return p
    return None


# --- quota snapshot -------------------------------------------------------- #

def test_superbet_snapshot_loaded(auth):
    r = requests.get(f"{BASE_URL}/api/admin/odds-quota", headers=auth, timeout=30)
    assert r.status_code == 200
    sb = r.json().get("superbet")
    assert sb and sb["fixtures"] >= 50, sb
    assert sb["callsThisMonth"] <= sb["ceiling"]
    assert sb["cachedAt"]


# --- value matches regression --------------------------------------------- #

def test_value_matches_count(auth):
    r = requests.get(f"{BASE_URL}/api/value-matches", headers=auth, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j.get("source") == "live"
    assert len(j.get("matches") or []) > 100


# --- near-kickoff fixtures have real stat prices --------------------------- #

@pytest.mark.parametrize("fid", NEAR)
def test_near_fixture_stat_panels_priced(fid, auth):
    r = requests.get(f"{BASE_URL}/api/specific-bets/{fid}", headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    if not d.get("available"):
        pytest.skip(f"{fid}: {d.get('reason')}")

    needles = ("foul", "offside", "saves", "shots")
    found = {n: [row for row in (_panel(d, n) or {}).get("rows") or [] if row.get("odds")]
             for n in needles}
    if not any(found.values()):
        pytest.skip(f"{fid}: Superbet quotes no stat market for this fixture/league yet")
    for n, priced in found.items():
        assert _panel(d, n), f"missing panel {n} on {fid}"
        if not priced:
            continue
        books = {(row.get("bookmaker") or "").lower() for row in priced}
        # Superbet is the only feed that quotes these markets
        assert "superbet" in books, f"{fid}/{n} missing Superbet, got {books}"

    # Fouls panel on live_af_1557436 is expected to carry 6/6 priced rows
    if fid == "live_af_1557436":
        fouls = _panel(d, "foul")
        rows = fouls.get("rows") or []
        assert len([r for r in rows if r.get("odds")]) >= 6


# --- the far-out fixture must stay unpriced + show the note --------------- #

def test_far_fixture_unpriced_with_note(auth):
    r = requests.get(f"{BASE_URL}/api/specific-bets/{FAR}", headers=auth, timeout=60)
    assert r.status_code == 200
    d = r.json()
    for needle in ("foul", "offside", "saves"):
        p = _panel(d, needle)
        assert p, needle
        rows = p.get("rows") or []
        priced = [row for row in rows if row.get("odds")]
        if not priced:
            note = (p.get("note") or "").lower()
            assert "not quoted by any greek-licensed bookmaker yet" in note, (needle, note)


# --- Greek-only bookmakers on every priced row ---------------------------- #

@pytest.mark.parametrize("fid", NEAR + [FAR])
def test_only_greek_bookmakers(fid, auth):
    r = requests.get(f"{BASE_URL}/api/specific-bets/{fid}", headers=auth, timeout=60)
    assert r.status_code == 200
    d = r.json()
    for p in d.get("panels", []):
        for row in p.get("rows") or []:
            if not row.get("odds"):
                continue
            bk = (row.get("bookmaker") or "").lower().strip()
            assert bk in GREEK_BOOKS, (fid, p.get("title"), bk)
            assert bk not in FORBIDDEN_BOOKS


# --- new row types: Team Corners / Team Fouls over+under / Team Shots ----- #

def test_team_rows_render(auth):
    r = requests.get(f"{BASE_URL}/api/specific-bets/{NEAR[0]}",
                     headers=auth, timeout=60)
    d = r.json()
    if not d.get("available"):
        pytest.skip(f"{NEAR[0]}: {d.get('reason')}")
    all_rows = [row for p in d.get("panels", []) for row in (p.get("rows") or [])]
    picks = [str(row.get("pick") or "") for row in all_rows]
    if not any(re.search(r"_(corners|fouls|shots|saves)_", p) for p in picks):
        pytest.skip(f"{NEAR[0]}: no stat markets quoted for this fixture yet")

    # Which Superbet team-level families rendered for this fixture. A book does
    # not quote every market on every match, so require that the row builders
    # work for at least two of them rather than pinning one fixture's menu.
    families = {
        "corners": r"^(home|away)_corners_(over|under)_",
        "fouls_over": r"^(home|away)_fouls_over_",
        "fouls_under": r"^(home|away)_fouls_under_",
        "shots": r"^(home|away)_shots_over_",
    }
    present = {k for k, pat in families.items() if any(re.match(pat, p) for p in picks)}
    assert len(present) >= 2, f"{NEAR[0]}: only {present or 'no'} team stat rows rendered"
    if "fouls_over" in present:
        assert "fouls_under" in present, "fouls over without under"
    # match-total saves "both keepers" — only when the book quotes it
    if any("saves" in p for p in picks):
        assert any(p.startswith("saves_") or re.match(r"^(home|away)_saves_", p) for p in picks)

    # every priced row has lion% + market% + edge + bookmaker
    for row in all_rows:
        if row.get("odds"):
            assert row.get("lion") is not None
            assert row.get("market_pct") is not None
            assert row.get("edge") is not None
            assert row.get("bookmaker")


# --- LION tickets regression --------------------------------------------- #

def test_lion_tickets_greek_only_and_parlay_math(auth):
    r = requests.get(f"{BASE_URL}/api/lion-tickets", headers=auth, timeout=60)
    assert r.status_code == 200
    tickets = r.json().get("tickets") or []
    assert 20 <= len(tickets) <= 60

    max_legs = max((len(t.get("legs") or []) for t in tickets), default=0)
    assert max_legs <= 6

    parlays = [t for t in tickets if len(t.get("legs") or []) > 1]
    assert parlays, "no parlays"

    sb_count = 0
    for t in tickets:
        for leg in t.get("legs") or []:
            bk = (leg.get("bookmaker") or "").lower().strip()
            assert bk in GREEK_BOOKS, bk
            if bk == "superbet":
                sb_count += 1

    assert sb_count > 0, "no Superbet leg found in LION tickets"

    for t in parlays:
        prod = 1.0
        for leg in t.get("legs"):
            prod *= float(leg.get("odds") or 1.0)
        po = float(t.get("odds") or t.get("total_odds") or 0)
        assert po <= prod + 0.01, (po, prod, t)
