"""Handicap mapping: the sign convention is the whole game here.

A handicap pick settles as `diff + line > 0`, so attributing the line to the
wrong side silently flips every result. These cases are taken from the real
Pame Stoixima and Elabet payloads.
"""
import sys

sys.path.insert(0, "/app/backend")
import rapid_books as rb  # noqa: E402

HOME, AWAY = "FC Rapperswil-Jona", "Stade Lausanne Ouchy"


def pid(mkt, sel, line=None, home=HOME, away=AWAY):
    return rb._pick_id(mkt, sel, line, home, away)


def test_pame_half_lines_keep_each_side_own_line():
    # Pame sends each outcome's own signed line in prices[0].handicapLow.
    assert pid("Asian Handicap 0.5", HOME, "+0.5") == "home_hcp_0.5"
    assert pid("Asian Handicap 0.5", AWAY, "-0.5") == "away_hcp_-0.5"
    assert pid("Asian Handicap -1.5", HOME, "-1.5") == "home_hcp_-1.5"
    assert pid("Asian Handicap -1.5", AWAY, "+1.5") == "away_hcp_1.5"


def test_quarter_and_whole_lines_are_rejected():
    # A quarter line splits the stake and a whole line can push: we cannot
    # settle either, so they must never produce a pick.
    assert pid("Asian Handicap 0.75", HOME, "+0.5") is None   # name says 0.75
    assert pid("Asian Handicap -0.25", HOME, "+0.0") is None
    assert pid("Asian Handicap -1.0", HOME, "-1.0") is None
    assert pid("Asian Handicap 0.0", HOME, "+0.0") is None


def test_elabet_reads_the_line_from_the_selection_name():
    h, a = "Hungary (W)", "Netherlands (W)"
    assert pid("Handicap", "Hungary (W) (+2.5)", None, h, a) == "home_hcp_2.5"
    assert pid("Handicap", "Netherlands (W) (-2.5)", None, h, a) == "away_hcp_-2.5"


def test_unknown_team_name_is_not_guessed():
    assert pid("Asian Handicap 0.5", "Some Other Club", "+0.5") is None


def test_punctuated_team_names_still_match():
    # The normaliser strips everything but letters/digits, so hyphens and
    # "(W)" suffixes must not break matching.
    assert pid("Double Chance", "FC Rapperswil-Jona or Draw") == "home_or_draw"
    assert pid("Handicap", "Hungary (W) (+1.5)", None, "Hungary (W)", "Poland") == "home_hcp_1.5"
