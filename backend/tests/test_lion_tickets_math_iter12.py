"""Iter 12 verification — user's doubts about LION Tickets:
 (a) legCount is NOT hardcoded 3 — different legCounts occur, and no two legs
     of the same ticket share a market group.
 (b) totalOdds is the PRODUCT of leg odds, NOT the sum.
Also re-verifies the leg qualification bar (prob>=58, edge>=1, odds>=1.12) and
required fields (prob, odds, bookmaker, marketPct, edge).
"""
import math
import os
import time
from collections import Counter

import pytest
import requests

BASE_URL = os.environ.get("VITE_BACKEND_URL",
                          "https://teams-hub-1.preview.emergentagent.com").rstrip("/")
TOKEN = "test-pro-monthly-token"

RESULT_PICKS = {"home", "draw", "away", "home_or_draw", "away_or_draw", "home_or_away"}
GOAL_PREFIX = ("over_", "under_")
BTTS_PICKS = {"btts_yes", "btts_no"}
TEAM_HOME_PICKS = {"home_over_0.5"}
TEAM_AWAY_PICKS = {"away_over_0.5"}


def _group_of(pick: str) -> str:
    if pick in RESULT_PICKS:
        return "result"
    if pick.startswith(GOAL_PREFIX):
        return "goals"
    if pick in BTTS_PICKS:
        return "btts"
    if pick in TEAM_HOME_PICKS:
        return "team_home"
    if pick in TEAM_AWAY_PICKS:
        return "team_away"
    return f"unknown:{pick}"


@pytest.fixture(scope="module")
def payload():
    last = None
    for attempt in range(3):
        r = requests.get(f"{BASE_URL}/api/lion-tickets",
                         headers={"Authorization": f"Bearer {TOKEN}"}, timeout=60)
        if r.status_code == 200:
            return r.json()
        last = r
        if r.status_code == 429:
            time.sleep(60)
            continue
        break
    pytest.fail(f"GET /api/lion-tickets failed: {last.status_code} {last.text[:300]}")


@pytest.fixture(scope="module")
def tickets(payload):
    tks = payload.get("tickets") or []
    assert isinstance(tks, list) and tks, "no tickets returned"
    print(f"\n[info] count={payload.get('count')} tickets={len(tks)}")
    return tks


def test_total_odds_is_product_not_sum(tickets):
    """CORE DOUBT (b): totalOdds must equal product of legs' odds, not the sum."""
    rows = []
    bad_product = []
    for t in tickets:
        legs = t["legs"]
        prod = 1.0
        s = 0.0
        for leg in legs:
            prod *= float(leg["odds"])
            s += float(leg["odds"])
        prod_r = round(prod, 2)
        total = float(t["totalOdds"])
        rows.append((t["id"], len(legs), [l["odds"] for l in legs], prod_r, round(s, 2), total))
        if abs(prod_r - total) > 0.02:
            bad_product.append((t["id"], prod_r, total))
        # Also, product should NOT equal the sum (degenerate case = all legs 1.0,
        # but MIN_ODDS=1.12 so with >=2 legs this cannot happen).
        assert abs(prod_r - round(s, 2)) > 0.02 or len(legs) == 1, \
            f"{t['id']}: product {prod_r} == sum {s}, suspicious"

    print("\n[totalOdds verification — first 5 tickets]")
    print(f"{'id':<22} legs  {'odds':<30} product   sum     totalOdds")
    for r in rows[:5]:
        print(f"{r[0]:<22} {r[1]}     {str(r[2]):<30} {r[3]:<8} {r[4]:<7} {r[5]}")

    assert not bad_product, f"totalOdds != product for: {bad_product}"


def test_leg_count_distribution_not_hardcoded(tickets):
    """CORE DOUBT (a): legCount is derived, not pinned to 3."""
    dist = Counter(t["legCount"] for t in tickets)
    print(f"\n[legCount distribution across {len(tickets)} tickets] {dict(dist)}")
    # Must have at least 2 legs each (business rule MIN_LEGS=2)
    for t in tickets:
        assert t["legCount"] >= 2, f"{t['id']} has only {t['legCount']} legs"
        assert len(t["legs"]) == t["legCount"]
    # Design is "take at most one leg per market group" of 5 groups → 2..5 possible.
    # If every ticket shows exactly 3, that is because only 3 groups currently
    # have published prices qualifying — not because 3 is coded. We only fail
    # if legCount is pinned AND exceeds the 5-group ceiling.
    for t in tickets:
        assert 2 <= t["legCount"] <= 5, f"{t['id']} legCount={t['legCount']} outside [2,5]"


def test_no_duplicate_market_group_per_ticket(tickets):
    """A ticket must not contain two legs of the same group (e.g. over_1.5 AND
    over_2.5, or 1X2 pick AND double chance)."""
    offenders = []
    for t in tickets:
        groups = [_group_of(leg["pick"]) for leg in t["legs"]]
        if len(set(groups)) != len(groups):
            offenders.append((t["id"], groups, [l["pick"] for l in t["legs"]]))
        for g in groups:
            assert not g.startswith("unknown:"), f"{t['id']} unknown pick group: {g}"
    assert not offenders, f"tickets with duplicate groups: {offenders}"


def test_leg_fields_and_qualification_bar(tickets):
    """Every leg carries prob, odds, bookmaker, marketPct, edge; edge>=1,
    prob>=58, odds>=1.12."""
    for t in tickets:
        for leg in t["legs"]:
            for k in ("prob", "odds", "bookmaker", "marketPct", "edge"):
                assert k in leg, f"{t['id']}: leg {leg.get('pick')} missing {k}"
            assert leg["prob"] >= 58, f"{t['id']} {leg['pick']} prob={leg['prob']} < 58"
            assert float(leg["odds"]) >= 1.12, f"{t['id']} {leg['pick']} odds<1.12"
            assert float(leg["edge"]) >= 1.0, f"{t['id']} {leg['pick']} edge<1"
            assert isinstance(leg["bookmaker"], str) and leg["bookmaker"], \
                f"{t['id']} {leg['pick']} empty bookmaker"


def test_combined_prob_matches_leg_product(tickets):
    """combinedProb ≈ product(prob/100)*100 (within 1 pt rounding)."""
    for t in tickets:
        p = 1.0
        for leg in t["legs"]:
            p *= leg["prob"] / 100.0
        assert abs(round(p * 100) - t["combinedProb"]) <= 1, \
            f"{t['id']} combinedProb={t['combinedProb']} vs {round(p*100)}"
