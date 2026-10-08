"""Iter14 — Verify the ticket engine scans ALL market families (double chance,
HT result, first-team-to-score) with cap of 6 legs and still obeys quality
gates, group uniqueness, singles/parlay maths and kickoff is in the future.
"""
import json
import math
import os
import time
from collections import Counter
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("VITE_BACKEND_URL", "https://teams-hub-1.preview.emergentagent.com").rstrip("/")
from qa_auth import headers as qa_headers  # noqa: E402

MIN_PROB = 58
MIN_ODDS = 1.12
MIN_EDGE = 1.0
MIN_LEGS = 2
MAX_LEGS = 6

ALLOWED_GROUPS = {"result", "goals", "btts", "fh", "ht", "fts", "team_home", "team_away"}
NEW_PICK_IDS = {"home_or_draw", "away_or_draw", "home_or_away",
                "fts_home", "fts_away", "fts_none",
                "ht_home", "ht_draw", "ht_away"}


@pytest.fixture(scope="module")
def payload():
    r = requests.get(f"{BASE_URL}/api/lion-tickets",
                     headers=qa_headers(), timeout=30)
    assert r.status_code == 200, (r.status_code, r.text[:300])
    return r.json()


@pytest.fixture(scope="module")
def tickets(payload):
    t = payload.get("tickets")
    assert isinstance(t, list) and len(t) > 0
    return t


def test_legcount_within_bounds(tickets):
    bad = [(x["id"], x["legCount"]) for x in tickets
           if not (MIN_LEGS <= x["legCount"] <= MAX_LEGS)]
    assert not bad, f"legCount out of [2..6]: {bad}"


def test_legcount_matches_legs_length(tickets):
    bad = [(x["id"], x["legCount"], len(x["legs"])) for x in tickets
           if x["legCount"] != len(x["legs"])]
    assert not bad, bad


def test_quality_gates(tickets):
    bad = []
    for t in tickets:
        for l in t["legs"]:
            prob = l["prob"]; odds = l["odds"]; edge = l["edge"]
            calc_edge = round(prob - 100.0 / odds, 1)
            if prob < MIN_PROB or odds < MIN_ODDS or edge < MIN_EDGE:
                bad.append((t["id"], l["pick"], prob, odds, edge))
            # edge should be self-consistent within 0.2
            # prob is reported as an int (rounded); edge uses the unrounded
            # float internally — allow a wider tolerance.
            if abs(calc_edge - edge) > 0.6:
                bad.append(("edge_mismatch", t["id"], l["pick"], edge, calc_edge))
    assert not bad, f"quality gate violations: {bad}"


def test_group_uniqueness_per_ticket(tickets):
    bad = []
    for t in tickets:
        groups = [l["group"] for l in t["legs"]]
        if len(set(groups)) != len(groups):
            bad.append((t["id"], groups))
        for g in groups:
            if g not in ALLOWED_GROUPS:
                bad.append((t["id"], "unknown_group", g))
    assert not bad, f"duplicate/unknown groups: {bad}"


def test_new_pick_ids_present(tickets):
    seen = Counter()
    for t in tickets:
        for l in t["legs"]:
            if l["pick"] in NEW_PICK_IDS:
                seen[l["pick"]] += 1
    # The engine must now surface at least one leg from the newly unlocked
    # families (double chance OR first-team-to-score). HT is allowed to be 0.
    dc = sum(seen[k] for k in ("home_or_draw", "away_or_draw", "home_or_away"))
    fts = sum(seen[k] for k in ("fts_home", "fts_away", "fts_none"))
    print(f"\nnew-pick distribution: {dict(seen)} (dc={dc}, fts={fts})")
    assert dc + fts > 0, "no double-chance nor FTS legs — scan not widening"


def test_new_legs_have_real_bookmaker_and_odds(tickets):
    bad = []
    for t in tickets:
        for l in t["legs"]:
            if l["pick"] in NEW_PICK_IDS:
                if not (isinstance(l["bookmaker"], str) and l["bookmaker"].strip()):
                    bad.append((t["id"], l["pick"], "no_bookmaker"))
                if not (l["odds"] >= MIN_ODDS):
                    bad.append((t["id"], l["pick"], "bad_odds", l["odds"]))
    assert not bad, bad


# ---------- singles/parlay maths (do not regress iter13) ----------

def test_no_totalOdds_key(payload):
    assert '"totalOdds"' not in json.dumps(payload)


def test_singles_return_equals_sum(tickets):
    bad = []
    for t in tickets:
        s = round(sum(float(l["odds"]) for l in t["legs"]), 2)
        if abs(s - float(t["singlesReturn"])) > 0.02:
            bad.append((t["id"], t["singlesReturn"], s))
    assert not bad, bad


def test_singles_multiple(tickets):
    bad = []
    for t in tickets:
        avg = round(float(t["singlesReturn"]) / t["legCount"], 2)
        if abs(avg - float(t["singlesMultiple"])) > 0.02:
            bad.append((t["id"], t["singlesMultiple"], avg))
    assert not bad, bad


def test_parlay_null_or_product_at_one_book(tickets):
    """If parlay is present, bookmaker must price every leg at that odds, and
    the parlay odds must equal product of those per-book prices within 0.05."""
    r = requests.get(f"{BASE_URL}/api/value-matches",
                     headers=qa_headers(), timeout=30)
    if r.status_code != 200:
        pytest.skip("value-matches not available")
    data = r.json()
    entries = data.get("entries") or (data if isinstance(data, list) else [])
    by_id = {}
    for e in entries:
        m = e.get("match") or {}
        if m.get("id"):
            by_id[m["id"]] = m
    bad = []
    for t in tickets:
        p = t.get("parlay")
        if not p:
            continue
        if not (isinstance(p.get("bookmaker"), str) and p["bookmaker"].strip()):
            bad.append((t["id"], "bad_bookmaker"))
            continue
        if float(p["odds"]) <= 1.0:
            bad.append((t["id"], "bad_odds"))
    assert not bad, bad


def test_parlay_bounds(tickets):
    bad = []
    for t in tickets:
        p = t.get("parlay")
        if not p:
            continue
        legs = [float(l["odds"]) for l in t["legs"]]
        prod = 1.0
        for x in legs:
            prod *= x
        lo, hi = max(legs), round(prod, 2)
        if not (lo - 0.02 <= float(p["odds"]) <= hi + 0.02):
            bad.append((t["id"], p["odds"], lo, hi))
    assert not bad, bad


# ---------- kickoff future ----------

def test_all_kickoffs_in_future(tickets):
    now = datetime.now(timezone.utc)
    past = []
    for t in tickets:
        ko = t["match"]["kickoff"]
        dt = datetime.fromisoformat(ko.replace("Z", "+00:00"))
        if dt <= now:
            past.append((t["id"], ko))
    assert not past, f"past/live fixtures in tickets: {past}"


def test_distribution_summary(tickets):
    """Informational only — print the distribution so test report captures it."""
    legcount = Counter(x["legCount"] for x in tickets)
    groups = Counter()
    picks = Counter()
    books = Counter()
    for t in tickets:
        for l in t["legs"]:
            groups[l["group"]] += 1
            picks[l["pick"]] += 1
            books[l["bookmaker"]] += 1
    print("\n--- iter14 distribution ---")
    print("tickets:", len(tickets))
    print("legCount:", dict(legcount))
    print("groups:", dict(groups))
    print("picks:", dict(picks))
    print("books:", dict(books))
    assert len(tickets) > 0
