"""Live-endpoint sanity: /api/value-matches, /api/lion-tickets, /api/specific-bets
must only surface Greek-licensed bookmakers (iteration_17 policy)."""
import os, requests, pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://teams-hub-1.preview.emergentagent.com").rstrip("/")
EMAIL = "qa.owner@lionstats.app"
PASS = "Qa-593ca402f165abc1!"

GREEK = {"stoiximan","novibet","bwin","pame stoixima","pamestoixima","opap",
         "elabet","bet365","betsson","netbet","interwetten","winmasters",
         "fonbet","superbet","vistabet","sportingbet","efbet"}
BLOCKED = {"betano","unibet","william hill","betvictor","pinnacle","marathonbet",
           "1xbet","betfair","betway","dafabet","sbo","coolbet","nordicbet",
           "leovegas","888sport","10bet"}


def _norm(n):
    return (n or "").strip().lower().replace(".gr","").strip()


@pytest.fixture(scope="module")
def tok():
    r = requests.post(f"{BASE}/api/auth/login", json={"email":EMAIL,"password":PASS}, timeout=20)
    r.raise_for_status()
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_value_matches_greek_only(hdr):
    r = requests.get(f"{BASE}/api/value-matches", headers=hdr, timeout=60)
    assert r.status_code == 200
    data = r.json()
    matches = data.get("matches") or data if isinstance(data, list) else data.get("matches", [])
    non_greek = []
    for m in matches[:40]:
        mi = m.get("match") or m
        for o in (mi.get("odds") or []):
            name = _norm(o.get("bookmaker"))
            if name and name in BLOCKED:
                non_greek.append(o.get("bookmaker"))
    assert not non_greek, f"non-Greek books leaked: {set(non_greek)}"


def test_lion_tickets_greek_only(hdr):
    for attempt in range(3):
        r = requests.get(f"{BASE}/api/lion-tickets", headers=hdr, timeout=180)
        if r.status_code == 200:
            break
    assert r.status_code == 200, f"status={r.status_code}"
    data = r.json()
    tickets = data.get("tickets") if isinstance(data, dict) else data
    assert tickets, "no tickets returned"
    print(f"ticket_count={len(tickets)}")
    non_greek_legs, non_greek_parlay = [], []
    for t in tickets:
        for leg in t.get("legs", []):
            bk = _norm(leg.get("bookmaker"))
            if bk and bk in BLOCKED:
                non_greek_legs.append(leg.get("bookmaker"))
            elif bk and bk not in GREEK:
                non_greek_legs.append(f"UNKNOWN:{leg.get('bookmaker')}")
        pb = _norm(t.get("sameBookParlayBookmaker") or t.get("parlayBookmaker") or "")
        if pb and pb in BLOCKED:
            non_greek_parlay.append(t.get("sameBookParlayBookmaker"))
    assert not non_greek_legs, f"non-Greek leg bookmakers: {set(non_greek_legs)}"
    assert not non_greek_parlay, f"non-Greek parlay bookmaker: {set(non_greek_parlay)}"
    assert 10 <= len(tickets) <= 80, f"ticket count out of expected range: {len(tickets)}"


def test_lion_tickets_singles_math(hdr):
    r = requests.get(f"{BASE}/api/lion-tickets", headers=hdr, timeout=120)
    tickets = r.json().get("tickets") or r.json()
    for t in tickets[:10]:
        legs = t.get("legs", [])
        odds = [float(l.get("odds") or l.get("price") or 0) for l in legs]
        odds = [o for o in odds if o > 0]
        if not odds:
            continue
        exp_sum = round(sum(odds), 2)
        exp_avg = round(sum(odds)/len(odds), 2)
        sr = t.get("singlesReturn")
        sm = t.get("singlesMultiple")
        if sr is not None:
            assert abs(float(sr) - exp_sum) < 0.05, f"singlesReturn {sr} vs sum {exp_sum}"
        if sm is not None:
            assert abs(float(sm) - exp_avg) < 0.05, f"singlesMultiple {sm} vs avg {exp_avg}"


def test_specific_bets_greek_only(hdr):
    # scan many value-matches to find at least 2 with available=true
    vm = requests.get(f"{BASE}/api/value-matches", headers=hdr, timeout=60).json()
    matches = vm.get("matches") if isinstance(vm, dict) else vm
    checked, totals = 0, []
    for m in matches[:40]:
        mi = m.get("match") or m
        mid = mi.get("id") or mi.get("match_id")
        if not mid: continue
        r = requests.get(f"{BASE}/api/specific-bets/{mid}", headers=hdr, timeout=60)
        if r.status_code != 200: continue
        body = r.json()
        if not body.get("available"): continue
        panels = body.get("panels", [])
        priced, books = 0, {}
        for p in panels:
            for row in p.get("rows", []):
                bk = _norm(row.get("bookmaker"))
                if not bk: continue
                priced += 1
                books[bk] = books.get(bk, 0) + 1
                assert bk not in BLOCKED, f"{mid} blocked bookmaker: {row.get('bookmaker')}"
                assert bk in GREEK, f"{mid} unknown (not Greek-licensed) bookmaker: {row.get('bookmaker')}"
        print(f"{mid}: priced={priced} books={books}")
        totals.append(priced)
        checked += 1
        if checked >= 2: break
    assert checked > 0, "no specific-bets endpoints had available=true"
    assert max(totals) >= 20, f"coverage very low: {totals}"
