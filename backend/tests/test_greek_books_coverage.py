import sys
sys.path.insert(0, "/app/backend")

import apifootball as af
import rapid_books as rb


def test_comma_decimal_totals_are_priced():
    # bwin writes "Over 1,5" — the comma used to drop every bwin goals line.
    assert rb._pick_id("Total Goals", "Over 1,5") == "over_1.5"
    assert rb._pick_id("Total Goals", "Under 2,5") == "under_2.5"


def test_gg_ng_maps_to_btts():
    assert rb._pick_id("GG/NG", "GG") == "btts_yes"
    assert rb._pick_id("GG/NG", "NG") == "btts_no"


def test_novibet_cards_market_is_wired():
    assert "SOCCER_POINT_CARDS_UNDER_OVER" in rb._NOVI_MKT
    assert rb._pick_id(rb._NOVI_MKT["SOCCER_POINT_CARDS_UNDER_OVER"], "Over 3.5") == "cards_over_3.5"


def test_stoiximan_parses_markets_listed_before_the_1x2_one():
    payload = {"updated_at": "now", "data": {"data": {"blocks": [{"events": [{
        "participants": [{"name": "RC Lens"}, {"name": "Sporting CP"}],
        "markets": [
            {"type": "HCTG", "name": "Over/Under Total Goals", "handicap": 2.5,
             "selections": [{"name": "Over 2.5", "price": 1.57},
                            {"name": "Under 2.5", "price": 2.4}]},
            {"type": "MR12", "name": "Match Result", "handicap": 0.0,
             "selections": [{"name": "1", "price": 2.63}, {"name": "X", "price": 3.98},
                            {"name": "2", "price": 2.71}]},
        ]}]}]}}}
    idx, pidx = {}, {}
    rb._p_stoiximan(payload, "Stoiximan", idx, pidx)
    assert idx["rclens|sportingcp"][0]["odds"] == {"home": 2.63, "draw": 3.98, "away": 2.71}
    assert pidx["rclens|sportingcp"]["over_2.5"]["odds"] == 1.57


def test_only_greek_licensed_bookmakers_are_surfaced():
    for ok in ("Stoiximan", "Novibet", "bwin", "Bet365", "NetBet", "Interwetten",
               "Winmasters", "Pame Stoixima", "Elabet", "Superbet"):
        assert af._bookmaker_approved(ok), ok
    # Not licensed in Greece -> a Greek user only gets a geo-block page.
    for blocked in ("Betano", "Unibet", "William Hill", "BetVictor", "Pinnacle",
                    "Marathonbet", "1xBet", "Betfair", "Betway", "Dafabet", "SBO"):
        assert not af._bookmaker_approved(blocked), blocked
