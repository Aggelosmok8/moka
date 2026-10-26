"""LION Tickets — ready-made same-match combos built from data we already hold.

Zero new API calls: the probabilities come from the match model's own expected
goals (Poisson, same maths as Specific Bets) and the prices come from the cached
Greek-book snapshots. A leg must be BOTH likely and fairly priced, legs that
contain each other (Over 0.5 vs Over 1.5) are never stacked, and a ticket needs
at least two legs to be worth showing.
"""
import logging
import math
from datetime import datetime, timezone

import apifootball as af
import live_values
import rapid_books as rb
import sportmonks_odds as sm
import superbet_odds as sb

logger = logging.getLogger(__name__)

MIN_PROB = 58          # % — "most likely scenarios" only
MIN_ODDS = 1.12        # anything shorter adds no return
MIN_EDGE = 1.0         # only legs our model prices better than the book
MIN_LEGS = 2
MAX_LEGS = 6           # more than this and "all of them win" gets unrealistic
CROSS_LEGS = 4         # legs in a cross-match accumulator — kept deliberately short
MAX_MATCHES = 40
CACHE_TTL = 900


def _pmf(k, lam):
    return math.exp(-lam) * lam ** k / math.factorial(k)


def _grid(lh, la, n=9):
    H = [_pmf(i, lh) for i in range(n)]
    A = [_pmf(j, la) for j in range(n)]
    return [[H[i] * A[j] for j in range(n)] for i in range(n)]


def _candidates(m: dict, value: dict) -> list:
    """Every market we can derive for this fixture, with its model probability."""
    pred = value.get("prediction") or {}
    lh, la = pred.get("xg_home"), pred.get("xg_away")
    if not lh or not la:
        return []
    g = _grid(lh, la)
    p_home = sum(g[i][j] for i in range(9) for j in range(9) if i > j)
    p_draw = sum(g[i][i] for i in range(9))
    p_away = sum(g[i][j] for i in range(9) for j in range(9) if i < j)
    home, away = m["home"]["name"], m["away"]["name"]
    out = []

    def add(group, pick, name, prob):
        out.append({"group": group, "pick": pick, "pickName": name,
                    "prob": round(prob * 100)})

    # Match result / double chance
    best = max((p_home, "home", home), (p_draw, "draw", "Draw"), (p_away, "away", away))
    add("result", best[1], best[2] if best[1] != "draw" else "Draw", best[0])
    add("result", "home_or_draw", f"{home} or Draw", p_home + p_draw)
    add("result", "away_or_draw", f"{away} or Draw", p_away + p_draw)
    add("result", "home_or_away", "Home or Away (no draw)", p_home + p_away)
    # Handicaps belong to the SAME group as the result: "home -0.5" IS a home
    # win and "home +0.5" IS a double chance, so they are alternative prices for
    # the same opinion, never a second leg. Half lines only (diff + line > 0).
    for line in (-1.5, -0.5, 0.5, 1.5):
        add("result", f"home_hcp_{line:g}", f"{home} {line:+g}",
            sum(g[i][j] for i in range(9) for j in range(9) if i - j + line > 0))
        add("result", f"away_hcp_{line:g}", f"{away} {line:+g}",
            sum(g[i][j] for i in range(9) for j in range(9) if j - i + line > 0))
    # Goals
    lam_t = lh + la
    for line in (0.5, 1.5, 2.5, 3.5):
        po = 1 - sum(_pmf(k, lam_t) for k in range(int(line) + 1))
        add("goals", f"over_{line}", f"Over {line} goals", po)
        add("goals", f"under_{line}", f"Under {line} goals", 1 - po)
    # First half goals — about 45% of a match's goals land before the break.
    lam_fh = lam_t * 0.45
    for line in (0.5, 1.5):
        po = 1 - sum(_pmf(k, lam_fh) for k in range(int(line) + 1))
        add("fh", f"fh_over_{line}", f"Over {line} goals in 1st half", po)
        add("fh", f"fh_under_{line}", f"Under {line} goals in 1st half", 1 - po)
    # Half-time result — the same Poisson, run over 45 minutes per side.
    gh = _grid(lh * 0.45, la * 0.45, 6)
    ht_h = sum(gh[i][j] for i in range(6) for j in range(6) if i > j)
    ht_d = sum(gh[i][i] for i in range(6))
    ht_a = sum(gh[i][j] for i in range(6) for j in range(6) if i < j)
    add("ht", "ht_home", f"{home} leading at half time", ht_h)
    add("ht", "ht_draw", "Level at half time", ht_d)
    add("ht", "ht_away", f"{away} leading at half time", ht_a)
    # First team to score — two Poisson processes racing, plus the goalless case.
    p_any = 1 - math.exp(-lam_t)
    add("fts", "fts_home", f"{home} to score first", lh / lam_t * p_any)
    add("fts", "fts_away", f"{away} to score first", la / lam_t * p_any)
    add("fts", "fts_none", "No goals in the match", 1 - p_any)
    # Both teams to score
    btts = (1 - _pmf(0, lh)) * (1 - _pmf(0, la))
    add("btts", "btts_yes", "Both teams to score", btts)
    add("btts", "btts_no", "Not both teams to score", 1 - btts)
    # Team goals
    for side, lam, nm in (("home", lh, home), ("away", la, la and away)):
        add(f"team_{side}", f"{side}_over_0.5", f"{nm} to score", 1 - _pmf(0, lam))
    return out


# One leg per group keeps a ticket from stacking markets that contain each other.
_GROUP_ORDER = ("result", "goals", "btts", "fh", "ht", "fts", "team_home", "team_away")


def _best_1x2(odds_list: list) -> dict:
    """Published price per outcome, per bookmaker, in pick_prices shape."""
    out = {}
    for e in odds_list or []:
        book = e.get("bookmaker") or ""
        for sel, price in (e.get("odds") or {}).items():
            if sel not in ("home", "draw", "away"):
                continue
            try:
                p = float(price)
            except (TypeError, ValueError):
                continue
            if p <= 1.0:
                continue
            cur = out.setdefault(sel, {"odds": 0.0, "bookmaker": "", "books": {}})
            if p > cur["books"].get(book, 0):
                cur["books"][book] = p
            if p > cur["odds"]:
                cur.update(odds=p, bookmaker=book)
    return out


def _build_ticket(m: dict, value: dict, prices: dict) -> dict:
    prices = {**_best_1x2(m.get("odds")), **prices}
    cands = []
    for c in _candidates(m, value):
        px = prices.get(c["pick"])
        if not px:
            continue
        odds = round(float(px["odds"]), 2)
        if c["prob"] < MIN_PROB or odds < MIN_ODDS:
            continue
        # Derived from the SAME rounded odds we publish, so edge always equals
        # prob - 100/odds for whoever re-checks it.
        implied = 100.0 / odds
        edge = round(c["prob"] - implied, 1)
        if edge < MIN_EDGE:          # a ticket is only worth showing when every
            continue                 # leg beats the book's own price
        c.update({"odds": odds, "bookmaker": px["bookmaker"],
                  "marketPct": round(implied), "edge": edge,
                  "books": px.get("books") or {px["bookmaker"]: odds}})
        cands.append(c)
    legs = []
    for grp in _GROUP_ORDER:
        pool = [c for c in cands if c["group"] == grp]
        if pool:
            # Inside a group: the best edge, then the longer price.
            legs.append(max(pool, key=lambda c: (c["edge"], c["odds"])))
    if len(legs) < MIN_LEGS:
        return None
    # More than the cap? Keep the strongest legs, then put them back in market
    # order so the ticket always reads result -> goals -> btts -> halves.
    if len(legs) > MAX_LEGS:
        keep = sorted(legs, key=lambda c: (c["edge"], c["prob"]), reverse=True)[:MAX_LEGS]
        legs = [l for l in legs if l in keep]
    prob = 1.0
    for leg in legs:
        prob *= leg["prob"] / 100.0
    # Played as SINGLES (each leg at the book with the best price): you stake one
    # unit per pick, so the return is the SUM of the prices, not their product.
    singles_sum = round(sum(l["odds"] for l in legs), 2)
    singles_mult = round(singles_sum / len(legs), 2)
    # A parlay only exists inside ONE bookmaker: find the book that prices every
    # leg and gives the best combined price.
    parlay = None
    books = set.intersection(*[set((l.get("books") or {}).keys()) for l in legs]) if legs else set()
    for book in books:
        p = 1.0
        for l in legs:
            # Round exactly like the prices we publish, so the parlay can never
            # read higher than the legs on screen multiplied out.
            p *= round(float(l["books"][book]), 2)
        if parlay is None or p > parlay["odds"]:
            parlay = {"bookmaker": book, "odds": round(p, 2)}
    for l in legs:
        l["books"] = l.get("books") or {}
    return {
        "id": f"lt_{m['id']}",
        "match": {"id": m["id"], "home": m["home"]["name"], "away": m["away"]["name"],
                  "homeLogo": (m.get("home") or {}).get("logo") or m.get("home_logo"),
                  "awayLogo": (m.get("away") or {}).get("logo") or m.get("away_logo"),
                  "league": m.get("leagueName"), "kickoff": m.get("commence_time")},
        "legs": legs,
        "legCount": len(legs),
        "singlesReturn": singles_sum,        # units back for 1 unit per pick
        "singlesMultiple": singles_mult,     # = average price across the legs
        "parlay": parlay,                    # same-bookmaker combo, or None
        "combinedProb": round(prob * 100),
        "anchor": max(legs, key=lambda x: x["prob"]),
    }


def _cross_tickets(tickets: list, want: int = 3) -> list:
    """Accumulators ACROSS matches: the most likely pick from each of several
    different fixtures, four legs a ticket (e.g. AEK-Olympiacos 1 + United GG +
    Panathinaikos under 4.5 corners + ...). Short on purpose: four near-certain
    legs is a believable ticket, ten is a lottery."""
    pool = []
    for t in tickets:
        legs = [dict(l) for l in (t.get("legs") or []) if l.get("prob")]
        if not legs:
            continue
        best = max(legs, key=lambda x: (x["prob"], x["edge"]))
        best["matchId"] = t["match"]["id"]
        best["home"] = t["match"]["home"]
        best["away"] = t["match"]["away"]
        best["league"] = t["match"]["league"]
        best["kickoff"] = t["match"]["kickoff"]
        best["matchLabel"] = f'{t["match"]["home"]} - {t["match"]["away"]}'
        pool.append(best)
    # Most probable first: the point of this ticket is "very likely, big combined
    # price", not "longest odds".
    pool.sort(key=lambda x: (x["prob"], x["edge"]), reverse=True)
    out = []
    for n in range(want):
        chunk = pool[n * CROSS_LEGS:(n + 1) * CROSS_LEGS]
        if len(chunk) < CROSS_LEGS:
            break
        prob = 1.0
        for l in chunk:
            prob *= l["prob"] / 100.0
        parlay = None
        books = set.intersection(*[set((l.get("books") or {}).keys()) for l in chunk])
        for book in books:
            p = 1.0
            for l in chunk:
                p *= round(float(l["books"][book]), 2)
            if parlay is None or p > parlay["odds"]:
                parlay = {"bookmaker": book, "odds": round(p, 2)}
        out.append({
            "id": f"ltx_{n}_" + "_".join(l["matchId"].split("_")[-1] for l in chunk),
            "kind": "cross",
            "match": {"id": None, "home": f"{len(chunk)} matches", "away": "",
                      "league": "Accumulator", "kickoff": min(l["kickoff"] or "" for l in chunk)},
            "matches": [{"id": l["matchId"], "label": l["matchLabel"], "league": l["league"]} for l in chunk],
            "legs": chunk,
            "legCount": len(chunk),
            "singlesReturn": round(sum(l["odds"] for l in chunk), 2),
            "singlesMultiple": round(sum(l["odds"] for l in chunk) / len(chunk), 2),
            "parlay": parlay,   # same-bookmaker combo across the matches, or None
            "combinedProb": round(prob * 100),
            "anchor": max(chunk, key=lambda x: x["prob"]),
        })
    return out


async def build_tickets() -> list:
    # Cache keyed on the odds snapshot: the instant new prices land, every
    # ticket is rebuilt and re-valued (a leg whose price dropped loses its edge
    # and falls out) instead of being served off stale odds.
    ck = f"lion_tickets_{await rb.odds_version()}"
    cached = live_values._cache_get(ck)
    if cached is not None:
        return cached
    try:
        from src.services.value_engine import rank_value_matches
        entries = rank_value_matches(await live_values.build_live_matches())
    except Exception as e:
        logger.warning("lion_tickets: %s", e)
        return []
    out = []
    now = datetime.now(timezone.utc).isoformat()
    af_budget = 25          # one call per fixture: spend it on the best-valued ones
    for e in entries[:MAX_MATCHES]:
        m, v = e.get("match") or {}, e.get("value") or {}
        if not m.get("id") or (m.get("status") or "") != "upcoming":
            continue
        # Kicked off (or past)? The ticket is gone, even if the feed lags behind.
        if (m.get("commence_time") or "") <= now:
            continue
        try:
            prices = await rb.pick_prices(m["home"]["name"], m["away"]["name"])
            # Superbet's snapshot is already in memory (streamed in the
            # background), so this costs nothing per fixture.
            rb.merge_prices(prices, await sb.pick_prices(m["home"]["name"], m["away"]["name"]))
            # API-Football prices this fixture across every market of every
            # licensed book, but it costs one call per fixture, so the budget
            # goes to the best-valued matches (entries are value-sorted).
            if af_budget > 0:
                af_budget -= 1
                prices = rb.merge_prices(prices, await af.pick_odds_for_fixture(m["id"]))
                prices = rb.merge_prices(prices, await sm.pick_odds(
                    m["home"]["name"], m["away"]["name"], m.get("commence_time") or ""))
        except Exception:
            prices = {}
        if not prices:
            continue
        t = _build_ticket(m, v, prices)
        if t:
            out.append(t)
    # Nearest kick-off first; between two the same day, the richer ticket wins.
    out.sort(key=lambda t: ((t["match"]["kickoff"] or "")[:10], -t["legCount"], -t["singlesReturn"]))
    # Cross-match accumulators go on top, then the per-match tickets.
    out = _cross_tickets(out) + out
    for t in out:
        for l in t["legs"]:
            l.pop("books", None)
    live_values._cache_set(ck, out, CACHE_TTL)
    return out
