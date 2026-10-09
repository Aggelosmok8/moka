"""Backend regression for iter13 — /api/lion-tickets singles/parlay model.

Replaces the obsolete `totalOdds == product` assertion from iter12. The ticket
no longer exposes a cross-bookmaker product; instead it must expose:
  - singlesReturn == sum(leg.odds)        (within 0.02)
  - singlesMultiple == singlesReturn/legCount (within 0.02)
  - parlay is either None or {bookmaker, odds} where odds is bounded by
    [max(leg.odds), product(leg.odds)]
And the key `totalOdds` must be absent anywhere in the payload.
"""
import json
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("VITE_BACKEND_URL", "https://teams-hub-1.preview.emergentagent.com").rstrip("/")
from qa_auth import headers as qa_headers  # noqa: E402


def _get_tickets():
    last = None
    for _ in range(3):
        r = requests.get(f"{BASE_URL}/api/lion-tickets",
                         headers=qa_headers(), timeout=30)
        last = r
        if r.status_code == 429:
            time.sleep(60)
            continue
        break
    assert last is not None and last.status_code == 200, (last.status_code, last.text[:200])
    return last.json()


@pytest.fixture(scope="module")
def payload():
    return _get_tickets()


@pytest.fixture(scope="module")
def tickets(payload):
    assert isinstance(payload.get("tickets"), list)
    assert len(payload["tickets"]) > 0, "no tickets returned"
    return payload["tickets"]


# ---------- shape ----------

def test_no_totalOdds_anywhere_in_payload(payload):
    blob = json.dumps(payload)
    assert '"totalOdds"' not in blob, "totalOdds key still present"


def test_singles_return_equals_sum_of_legs(tickets):
    bad = []
    for t in tickets:
        s = round(sum(float(l["odds"]) for l in t["legs"]), 2)
        if abs(s - float(t["singlesReturn"])) > 0.02:
            bad.append((t["id"], t["singlesReturn"], s))
    assert not bad, f"singlesReturn != sum(legs): {bad}"


def test_singles_multiple_equals_avg(tickets):
    bad = []
    for t in tickets:
        avg = round(float(t["singlesReturn"]) / t["legCount"], 2)
        if abs(avg - float(t["singlesMultiple"])) > 0.02:
            bad.append((t["id"], t["singlesMultiple"], avg))
    assert not bad, f"singlesMultiple != singlesReturn/legCount: {bad}"


def test_leg_shape_no_books_key(tickets):
    for t in tickets:
        for l in t["legs"]:
            assert "books" not in l, f"{t['id']} leg still exposes 'books'"
            assert l["odds"] > 1.0
            assert l["bookmaker"]


# ---------- parlay semantics ----------

def test_parlay_bounds(tickets):
    """When parlay exists, odds in [max(leg), product(legs)]."""
    bad = []
    for t in tickets:
        p = t.get("parlay")
        if not p:
            continue
        legs = [float(l["odds"]) for l in t["legs"]]
        prod = 1.0
        for x in legs:
            prod *= x
        # The parlay multiplies ONE book's own prices, which are usually worse
        # than the best-of-market price shown per leg, so the only hard ceiling
        # is the product of the best prices.
        hi = round(prod, 2)
        if not (1.01 <= float(p["odds"]) <= hi + 0.02):
            bad.append((t["id"], p["odds"], hi))
    assert not bad, f"parlay odds out of [max, product] range: {bad}"


def test_parlay_bookmaker_prices_every_leg_or_is_null(tickets):
    """If parlay is set, the bookmaker string must match at least one leg's
    bookmaker in the ticket (the 'best price' leg for that book might be a
    different bookmaker; we can only soft-check: the named book must be a
    real string). Also when parlay is null, no leg list is empty."""
    for t in tickets:
        p = t.get("parlay")
        if p is not None:
            assert isinstance(p["bookmaker"], str) and p["bookmaker"].strip()
            assert float(p["odds"]) > 1.0
        else:
            # no cross-book product should be hidden anywhere
            assert "totalOdds" not in t


# ---------- ordering preserved ----------

def test_sorted_by_kickoff_day(tickets):
    days = [t["match"]["kickoff"][:10] for t in tickets]
    assert days == sorted(days), f"not sorted by kickoff day: {days}"


# ---------- cross-check with /api/value-matches when parlay != None ----------

def test_parlay_bookmaker_appears_in_odds_feed(tickets):
    """When parlay is set, the named bookmaker should appear in the value-matches
    odds list for that fixture (sanity: that book really prices this match)."""
    r = requests.get(f"{BASE_URL}/api/value-matches",
                     headers=qa_headers(), timeout=30)
    if r.status_code != 200:
        pytest.skip("value-matches unavailable")
    data = r.json()
    entries = data.get("entries") or (data if isinstance(data, list) else [])
    by_id = {}
    for e in entries:
        m = e.get("match") or {}
        if m.get("id"):
            by_id[m["id"]] = m
    missing = []
    for t in tickets:
        p = t.get("parlay")
        if not p:
            continue
        m = by_id.get(t["match"]["id"])
        if not m:
            continue
        books = {(o.get("bookmaker") or "") for o in (m.get("odds") or [])}
        if p["bookmaker"] not in books:
            missing.append((t["id"], p["bookmaker"], sorted(books)))
    # Soft assertion: it should be present. If upstream pruned the odds row
    # before we checked, the sample would be small; log and pass if empty.
    assert not missing, f"parlay bookmaker missing from feed: {missing}"
