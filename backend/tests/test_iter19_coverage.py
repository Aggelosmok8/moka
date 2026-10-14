"""Iteration 19 — Corners/Cards fully priced, 4 unpriced panels show note,
value-matches populated, LION tickets priced & Greek-only, snapshot restart safe."""
import json, time
import pytest
import requests

BASE_URL = "https://teams-hub-1.preview.emergentagent.com"
TIMEOUT = 180

FIXTURES = ["live_af_1575188", "live_af_1563200", "live_af_1593333"]

GREEK_HOSTS = ("bet365.gr", "bwin.gr", "novibet.gr", "elabet.gr",
               "pamestoixima.gr", "stoiximan.gr", "winmasters.gr",
               "interwetten.gr", "sportingbet.gr", "fonbet.gr",
               "goalbet.gr", "betshop.gr", "netbet.gr", "vistabet.gr",
               "n1bet.gr", "winbet.gr", "betarades.gr")

UNPRICED_PANELS = {"Score At Any Time", "Fouls", "Offsides", "Goalkeeper Saves"}
NOTE_SUFFIX = "No bookmaker prices this market for this fixture"


@pytest.fixture(scope="session")
def api():
    return requests.Session()


# ---------- value-matches ----------
def test_value_matches_populated(api):
    r = api.get(f"{BASE_URL}/api/value-matches", timeout=60)
    assert r.status_code == 200, r.text[:400]
    d = r.json()
    assert d.get("source") == "live", d.get("source")
    assert len(d.get("matches", [])) > 100, f"only {len(d.get('matches', []))} matches"


def test_value_matches_second_call_fast(api):
    t0 = time.time()
    r = api.get(f"{BASE_URL}/api/value-matches", timeout=60)
    assert r.status_code == 200 and r.json().get("source") == "live"
    assert (time.time() - t0) < 30


# ---------- helper ----------
_cache = {}


def _get_specific(api, fid):
    if fid not in _cache:
        r = api.get(f"{BASE_URL}/api/specific-bets/{fid}", timeout=TIMEOUT)
        assert r.status_code == 200, f"{fid}: HTTP {r.status_code} {r.text[:300]}"
        _cache[fid] = r.json()
    return _cache[fid]


def _panel(data, substr):
    for p in data.get("panels", []):
        if substr.lower() in (p.get("title") or "").lower():
            return p
    return None


# ---------- Corners / Cards fully priced ----------
@pytest.mark.parametrize("fid", FIXTURES)
def test_corners_all_priced(api, fid):
    p = _panel(_get_specific(api, fid), "Corners")
    if not p:
        pytest.skip(f"{fid}: no Corners panel")
    rows = p.get("rows", [])
    assert rows, f"{fid}: Corners has no rows"
    unpriced = [r for r in rows if not r.get("odds") or not r.get("bookmaker")]
    assert not unpriced, (
        f"{fid} Corners {len(rows)-len(unpriced)}/{len(rows)} priced; unpriced sample: "
        + json.dumps([{k: r.get(k) for k in ('selection','odds','bookmaker')} for r in unpriced[:3]])
    )


@pytest.mark.parametrize("fid", FIXTURES)
def test_cards_all_priced(api, fid):
    p = _panel(_get_specific(api, fid), "Cards")
    if not p:
        pytest.skip(f"{fid}: no Cards panel")
    rows = p.get("rows", [])
    assert rows, f"{fid}: Cards has no rows"
    unpriced = [r for r in rows if not r.get("odds") or not r.get("bookmaker")]
    assert not unpriced, (
        f"{fid} Cards {len(rows)-len(unpriced)}/{len(rows)} priced; unpriced sample: "
        + json.dumps([{k: r.get(k) for k in ('selection','odds','bookmaker')} for r in unpriced[:3]])
    )


# ---------- Correct Score / Handicap / Goals / Team Goals / DC / First Half priced ----------
@pytest.mark.parametrize("fid", FIXTURES)
@pytest.mark.parametrize("panel_name", [
    "Correct Score", "Handicap", "Goals Over", "Team Goals", "Double Chance", "First Half"
])
def test_core_markets_priced(api, fid, panel_name):
    p = _panel(_get_specific(api, fid), panel_name)
    if not p:
        pytest.skip(f"{fid}: no {panel_name} panel")
    rows = p.get("rows", [])
    priced = [r for r in rows if r.get("odds")]
    # At least half priced (Correct Score should be ~8/8; others typically mostly priced)
    assert len(priced) >= max(1, len(rows) // 2), f"{fid} {panel_name}: only {len(priced)}/{len(rows)} priced"


# ---------- Unpriced panels (4) show note + probabilities ----------
@pytest.mark.parametrize("fid", FIXTURES)
def test_unpriced_panels_show_note(api, fid):
    data = _get_specific(api, fid)
    panels = {p["title"]: p for p in data.get("panels", [])}
    found = [t for t in UNPRICED_PANELS if any(t.lower() in k.lower() for k in panels)]
    assert found, f"{fid}: none of the 4 unpriced panels rendered"
    for name in found:
        p = next(v for k, v in panels.items() if name.lower() in k.lower())
        rows = p.get("rows", [])
        assert rows, f"{fid} {name}: no rows"
        # No row should carry odds for these panels
        with_odds = [r for r in rows if r.get("odds")]
        assert not with_odds, f"{fid} {name}: unexpectedly priced {len(with_odds)}/{len(rows)}"
        # Every row must have a probability (lion/market_pct)
        missing = [r for r in rows if r.get("lion") is None and r.get("market_pct") is None]
        assert not missing, f"{fid} {name}: {len(missing)} rows missing probability"
        note = p.get("note") or ""
        assert NOTE_SUFFIX in note, f"{fid} {name}: expected explanatory note; got {note!r}"


# ---------- Player panels still priced ----------
@pytest.mark.parametrize("fid", FIXTURES)
def test_players_priced(api, fid):
    data = _get_specific(api, fid)
    players = data.get("players") or []
    if not players:
        pytest.skip(f"{fid}: no player panels")
    priced_rows = 0
    total_rows = 0
    for pl in players:
        rows = pl.get("rows", []) if isinstance(pl, dict) else []
        for r in rows:
            total_rows += 1
            if r.get("odds") and r.get("bookmaker"):
                priced_rows += 1
    assert total_rows > 0, f"{fid}: player rows empty"
    assert priced_rows > 0, f"{fid}: no priced player rows"
    print(f"{fid} players: {priced_rows}/{total_rows} priced")


# ---------- LION tickets ----------
def test_lion_tickets_populated_greek_and_parlay_sane(api):
    r = api.get(f"{BASE_URL}/api/lion-tickets", timeout=TIMEOUT)
    assert r.status_code == 200, f"HTTP {r.status_code} {r.text[:300]}"
    d = r.json()
    tickets = d.get("tickets") or []
    assert len(tickets) >= 20, f"only {len(tickets)} tickets"
    parlays_seen = 0
    bk_names = set()
    for t in tickets:
        legs = t.get("legs") or []
        assert 1 <= len(legs) <= 6, f"legs out of range: {len(legs)}"
        for leg in legs:
            bk = (leg.get("bookmaker") or "").strip()
            assert bk, "leg missing bookmaker"
            bk_names.add(bk.lower())
            link = (leg.get("link") or leg.get("deeplink") or leg.get("url") or "").lower()
            if link:
                assert ".gr" in link and any(h in link for h in GREEK_HOSTS), f"non-greek link: {link}"
        parlay = t.get("parlay") or {}
        p_odds = parlay.get("odds")
        if p_odds:
            parlays_seen += 1
            prod = 1.0
            for leg in legs:
                lo = leg.get("odds") or leg.get("price")
                if lo:
                    prod *= float(lo)
            assert float(p_odds) <= prod + 0.01, (
                f"parlay odds {p_odds} > prod {prod:.4f}"
            )
    print(f"tickets={len(tickets)} parlays={parlays_seen} books={sorted(bk_names)}")
    assert parlays_seen >= len(tickets) // 2, f"only {parlays_seen}/{len(tickets)} parlays"
