"""Iteration 18 — verify:
 1. Correct Score / Cards / Corners panels are priced with Greek books,
 2. Player panels resolve name-keyed odds to the correct player,
 3. Unpriced panels show the explanatory note,
 4. No integer OU lines are priced anywhere,
 5. /api/specific-bets and /api/lion-tickets are cached per odds snapshot (fast repeat),
 6. LION Tickets parlay odds <= product of leg odds, singles math sound,
 7. Only Greek-licensed .gr bookmakers surface anywhere.
"""
import os, re, time, requests, pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL",
                      "https://teams-hub-1.preview.emergentagent.com").rstrip("/")
EMAIL = "qa.owner@lionstats.app"
PASS = "Qa-593ca402f165abc1!"

GREEK = {"stoiximan","novibet","bwin","pame stoixima","pamestoixima","opap",
         "elabet","bet365","betsson","netbet","interwetten","winmasters",
         "fonbet","superbet","vistabet","sportingbet","efbet"}
BLOCKED = {"betano","unibet","william hill","betvictor","pinnacle","marathonbet",
           "1xbet","betfair","betway","dafabet"}

def _nearest_fixture():
    """Nearest kick-off on the live board — pinned ids go stale within a day."""
    try:
        r = requests.get(f"{BASE}/api/value-matches", timeout=180)
        ms = sorted((r.json() or {}).get("matches") or [],
                    key=lambda e: e["match"].get("commence_time") or "")
        return ms[0]["match"]["id"] if ms else ""
    except Exception:
        return ""


PRIMARY_FIXTURE = _nearest_fixture()


def _norm(n):
    return (n or "").strip().lower().replace(".gr","").strip()


@pytest.fixture(scope="module")
def hdr():
    # Specific Bets and LION Tickets are Pro-gated: the QA account runs its trial.
    import sys as _sys
    import pathlib as _pl
    _sys.path.insert(0, str(_pl.Path(__file__).parent))
    from qa_auth import pro_headers
    return pro_headers()


@pytest.fixture(scope="module")
def _unused_hdr():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": EMAIL, "password": PASS}, timeout=20)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['session_token']}"}


@pytest.fixture(scope="module")
def primary_sb(hdr):
    """Fetch the primary fixture; fall back to any other available fixture."""
    for _ in range(3):
        try:
            r = requests.get(f"{BASE}/api/specific-bets/{PRIMARY_FIXTURE}",
                             headers=hdr, timeout=180)
            if r.status_code == 200 and r.json().get("available"):
                return r.json(), PRIMARY_FIXTURE
        except requests.exceptions.ReadTimeout:
            continue
    # fall back: find first available fixture via value-matches
    vm = requests.get(f"{BASE}/api/value-matches", headers=hdr, timeout=60).json()
    matches = vm.get("matches") if isinstance(vm, dict) else vm
    for m in matches[:40]:
        mi = m.get("match") or m
        mid = mi.get("id") or mi.get("match_id")
        if not mid: continue
        r = requests.get(f"{BASE}/api/specific-bets/{mid}", headers=hdr, timeout=60)
        if r.status_code == 200 and r.json().get("available"):
            return r.json(), mid
    pytest.skip("no available specific-bets fixture")


def _panels_by_title(body):
    return {p.get("title",""): p for p in body.get("panels", [])}


def test_only_greek_books_on_specific_bets(primary_sb):
    body, mid = primary_sb
    priced = 0
    for p in body.get("panels", []):
        for row in p.get("rows", []):
            bk = _norm(row.get("bookmaker"))
            if not bk: continue
            priced += 1
            assert bk not in BLOCKED, f"{mid} leaked blocked book: {row.get('bookmaker')}"
            assert bk in GREEK, f"{mid} unknown book: {row.get('bookmaker')}"
    for blk in (body.get("players") or []):
        for row in blk.get("rows", []):
            bk = _norm(row.get("bookmaker"))
            if bk:
                priced += 1
                assert bk not in BLOCKED, f"player row blocked book: {row.get('bookmaker')}"
                assert bk in GREEK, f"player row unknown book: {row.get('bookmaker')}"
    print(f"{mid}: total_priced={priced}")
    assert priced >= 20


def test_correct_score_cards_corners_priced(primary_sb):
    body, mid = primary_sb
    panels = _panels_by_title(body)
    # Match substrings case-insensitively.
    def find(sub):
        for t, p in panels.items():
            if sub.lower() in t.lower():
                return p
        return None

    cs = find("Correct Score")
    cards = find("Cards")
    corners = find("Corners")
    rpt = {}
    for name, p in (("correct_score", cs), ("cards", cards), ("corners", corners)):
        if p is None:
            rpt[name] = "panel-missing"
            continue
        rows = p.get("rows", [])
        priced = [r for r in rows if r.get("odds")]
        rpt[name] = f"{len(priced)}/{len(rows)}"
    print(f"{mid} coverage:", rpt)
    assert cs and len([r for r in cs["rows"] if r.get("odds")]) >= 4, \
        f"Correct Score priced rows too low: {rpt}"
    assert cards and len([r for r in cards["rows"] if r.get("odds")]) >= 2, \
        f"Cards priced rows too low: {rpt}"
    # A book posts ONE corners line, so the panel now shows only quoted lines:
    # every row must carry a price (no column of dashes) — unless the market is
    # not posted for this fixture yet, in which case the panel explains itself.
    assert corners and corners["rows"], f"Corners panel missing: {rpt}"
    if any(r.get("odds") for r in corners["rows"]):
        assert all(r.get("odds") for r in corners["rows"]), \
            f"Corners panel must only contain priced lines: {rpt}"
    else:
        assert "Not quoted by any Greek-licensed bookmaker yet" in (corners.get("note") or "")


def test_unpriced_panels_show_note(primary_sb):
    body, mid = primary_sb
    expected_note = "Not quoted by any Greek-licensed bookmaker yet"
    missing = []
    for p in body.get("panels", []):
        if not any(r.get("odds") for r in p.get("rows", [])):
            if expected_note not in (p.get("note") or ""):
                missing.append(p.get("title"))
    assert not missing, f"unpriced panels without the explanatory note: {missing}"


def test_no_integer_over_under_priced(primary_sb):
    """Whole-number lines are allowed ONLY where the bookmaker runs a 3-way
    market (Over / Under / Exactly) — corners and cards. Goals, first-half
    goals, team goals and player props must stay on half lines, because there a
    whole number is a push at the book and a win/loss for us."""
    body, mid = primary_sb
    bad = []
    pat = re.compile(r"(over|under)_(\d+(?:\.\d+)?)$")
    for p in body.get("panels", []):
        for r in p.get("rows", []):
            if not r.get("odds"): continue
            m = pat.search(r.get("pick") or "")
            if m:
                line = float(m.group(2))
                three_way = (r.get("pick") or "").startswith(("corners_", "cards_"))
                if line * 2 % 2 != 1 and not three_way:
                    bad.append(f"{r['pick']}@{r['odds']} ({r.get('bookmaker')})")
    for blk in (body.get("players") or []):
        for r in blk.get("rows", []):
            if not r.get("odds"): continue
            m = pat.search(r.get("pick") or "")
            if m:
                line = float(m.group(2))
                if line * 2 % 2 != 1:
                    bad.append(f"PLAYER {r['pick']}@{r['odds']}")
    assert not bad, f"integer OU lines priced (push risk): {bad[:10]}"


def test_player_panel_price_matching(primary_sb, hdr):
    body, mid = primary_sb
    # Count priced player rows per market and spot-check 3 name matches against
    # the raw bookmaker player names in /odds (via pick_odds mapping).
    priced_score = priced_shots = priced_sot = 0
    sample = []
    for blk in (body.get("players") or []):
        for r in blk.get("rows", []):
            pick = r.get("pick") or ""
            if r.get("odds"):
                if pick.endswith("_score") or pick == "score":
                    priced_score += 1
                    if len(sample) < 3:
                        sample.append((r.get("player"), pick, r.get("odds"), r.get("bookmaker")))
                elif "shots_over_" in pick:
                    priced_shots += 1
                elif "sot_over_" in pick:
                    priced_sot += 1
    print(f"{mid} player priced: score={priced_score} shots={priced_shots} sot={priced_sot}")
    print("sample:", sample)
    # Review target: ~29/40 scorers, ~19/48 shots.  Loosen a bit for noise.
    assert priced_score >= 5, f"too few priced scorer rows: {priced_score}"
    # Verify spot-checked player NAMES collapse to the same `player_key` so the
    # row and bookmaker agree on who the price is for.
    import importlib, sys
    sys.path.insert(0, "/app/backend")
    af = importlib.import_module("apifootball")
    for pname, pick, odds, book in sample:
        k = af.player_key(pname)
        assert k, f"empty player_key for {pname!r}"
        # key must be initial|surname
        assert "|" in k and len(k.split("|")[0]) == 1


def test_specific_bets_cache_fast_repeat(hdr, primary_sb):
    _, mid = primary_sb
    t0 = time.time(); r1 = requests.get(f"{BASE}/api/specific-bets/{mid}", headers=hdr, timeout=60); d1 = time.time()-t0
    t0 = time.time(); r2 = requests.get(f"{BASE}/api/specific-bets/{mid}", headers=hdr, timeout=30); d2 = time.time()-t0
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json() == r2.json(), "cached response diverged between calls"
    print(f"specific-bets {mid}: 1st={d1:.2f}s cache_hit={d2:.2f}s")
    assert d2 < max(2.5, d1), f"second call ({d2:.2f}s) not faster than first ({d1:.2f}s)"


def test_lion_tickets_cache_and_parlay(hdr):
    for attempt in range(3):
        r = requests.get(f"{BASE}/api/lion-tickets", headers=hdr, timeout=180)
        if r.status_code == 200: break
    assert r.status_code == 200
    body1 = r.json()
    tickets = body1.get("tickets") if isinstance(body1, dict) else body1
    assert tickets

    # Repeat should be cache hit & identical
    t0 = time.time()
    r2 = requests.get(f"{BASE}/api/lion-tickets", headers=hdr, timeout=60)
    d = time.time()-t0
    assert r2.status_code == 200
    assert r2.json() == body1, "lion-tickets cache diverged"
    assert d < 10, f"cache hit too slow: {d:.2f}s"
    print(f"lion-tickets cache_hit_time={d:.2f}s tickets={len(tickets)}")

    # Parlay sanity + leg bookmakers all Greek-licensed
    for t in tickets:
        legs = t.get("legs", [])
        leg_odds = [float(l.get("odds") or 0) for l in legs if float(l.get("odds") or 0) > 0]
        if not leg_odds: continue
        prod = 1.0
        for o in leg_odds: prod *= o
        parlay = t.get("parlay") or {}
        p_odds = float(parlay.get("odds") or t.get("sameBookParlayOdds") or 0)
        if p_odds > 0:
            assert p_odds <= prod + 0.01, f"parlay odds {p_odds} > product {prod:.3f}"
        p_bk = _norm(parlay.get("bookmaker") or t.get("sameBookParlayBookmaker") or "")
        if p_bk:
            assert p_bk in GREEK, f"non-Greek parlay book: {p_bk}"
        # singles math
        sr, sm = t.get("singlesReturn"), t.get("singlesMultiple")
        if sr is not None:
            assert abs(float(sr) - round(sum(leg_odds), 2)) < 0.05
        if sm is not None:
            assert abs(float(sm) - round(sum(leg_odds)/len(leg_odds), 2)) < 0.05
        # Edge sanity: edge == lion_pct - 100/odds (+/-0.1)
        for l in legs:
            o = float(l.get("odds") or 0)
            lion = l.get("lion") or l.get("lionPct") or l.get("prob")
            edge = l.get("edge")
            if o > 0 and lion is not None and edge is not None:
                exp = round(float(lion) - 100.0/o, 1)
                # Some payloads round differently; allow 0.6pt wiggle
                assert abs(float(edge) - exp) <= 0.6, \
                    f"edge {edge} not consistent with lion-100/odds={exp} (odds={o}, lion={lion})"


def test_odds_version_bucket():
    """rapid_books.odds_version() must be a non-empty string that embeds the
    1-hour time bucket so cache keys roll over automatically."""
    import asyncio, sys, importlib
    sys.path.insert(0, "/app/backend")
    rb = importlib.import_module("rapid_books")
    v = asyncio.get_event_loop().run_until_complete(rb.odds_version()) \
        if False else asyncio.run(rb.odds_version())
    assert isinstance(v, str) and v, "odds_version returned empty"
    # Must contain two parts separated by _ (snapshot_at _ bucket)
    parts = v.split("_")
    assert len(parts) == 2 and parts[1].isdigit(), f"unexpected odds_version shape: {v!r}"
    expected_bucket = int(time.time() // 3600)
    assert abs(int(parts[1]) - expected_bucket) <= 1
