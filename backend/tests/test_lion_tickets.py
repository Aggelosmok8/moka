"""Backend regression — /api/lion-tickets correctness after kickoff-filter fix."""
import os
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("VITE_BACKEND_URL", "https://teams-hub-1.preview.emergentagent.com").rstrip("/")
TOKEN = "test-pro-monthly-token"


@pytest.fixture(scope="module")
def tickets():
    r = requests.get(f"{BASE_URL}/api/lion-tickets",
                     headers={"Authorization": f"Bearer {TOKEN}"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    return data["tickets"]


def test_payload_shape(tickets):
    assert isinstance(tickets, list)
    assert len(tickets) > 0, "no tickets returned"


def test_every_kickoff_in_future(tickets):
    now = datetime.now(timezone.utc)
    bad = []
    for t in tickets:
        ko = t["match"]["kickoff"]
        dt = datetime.fromisoformat(ko.replace("Z", "+00:00"))
        if dt <= now:
            bad.append((t["id"], ko))
    assert not bad, f"tickets with past/live kickoff: {bad}"


def test_min_two_legs(tickets):
    for t in tickets:
        assert t["legCount"] >= 2, f"{t['id']} has {t['legCount']} legs"
        assert len(t["legs"]) == t["legCount"]


def test_total_odds_matches_product(tickets):
    for t in tickets:
        prod = 1.0
        for l in t["legs"]:
            prod *= float(l["odds"])
        assert abs(round(prod, 2) - float(t["totalOdds"])) <= 0.02, (
            f"{t['id']} totalOdds={t['totalOdds']} vs product={round(prod, 2)}")


def test_ordered_by_nearest_kickoff(tickets):
    days = [t["match"]["kickoff"][:10] for t in tickets]
    assert days == sorted(days), f"not sorted by kickoff day: {days}"


def test_match_not_live(tickets):
    """Cross-check with /api/value-matches: no ticket for a currently-live match."""
    r = requests.get(f"{BASE_URL}/api/value-matches",
                     headers={"Authorization": f"Bearer {TOKEN}"}, timeout=30)
    if r.status_code != 200:
        pytest.skip("value-matches unavailable")
    entries = r.json().get("entries") or r.json() if isinstance(r.json(), list) else r.json().get("entries", [])
    live_ids = {e["match"]["id"] for e in entries
                if (e.get("match") or {}).get("status") == "live"}
    offenders = [t["id"] for t in tickets if t["match"]["id"] in live_ids]
    assert not offenders, f"tickets for live matches: {offenders}"
