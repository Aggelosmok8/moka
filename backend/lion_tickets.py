"""LION Tickets — ready-made same-match combos built from data we already hold.

Zero new API calls: the probabilities come from the match model's own expected
goals (Poisson, same maths as Specific Bets) and the prices come from the cached
Greek-book snapshots. A leg must be BOTH likely and fairly priced, legs that
contain each other (Over 0.5 vs Over 1.5) are never stacked, and a ticket needs
at least two legs to be worth showing.
"""
import logging
import math

import live_values
import rapid_books as rb

logger = logging.getLogger(__name__)

MIN_PROB = 58          # % — "most likely scenarios" only
MIN_ODDS = 1.12        # anything shorter adds no return
MIN_EDGE = 1.0         # only legs our model prices better than the book
MIN_LEGS = 2
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
    # Goals
    lam_t = lh + la
    for line in (0.5, 1.5, 2.5, 3.5):
        po = 1 - sum(_pmf(k, lam_t) for k in range(int(line) + 1))
        add("goals", f"over_{line}", f"Over {line} goals", po)
        add("goals", f"under_{line}", f"Under {line} goals", 1 - po)
    # Both teams to score
    btts = (1 - _pmf(0, lh)) * (1 - _pmf(0, la))
    add("btts", "btts_yes", "Both teams to score", btts)
    add("btts", "btts_no", "Not both teams to score", 1 - btts)
    # Team goals
    for side, lam, nm in (("home", lh, home), ("away", la, la and away)):
        add(f"team_{side}", f"{side}_over_0.5", f"{nm} to score", 1 - _pmf(0, lam))
    return out


# One leg per group keeps a ticket from stacking markets that contain each other.
_GROUP_ORDER = ("result", "goals", "btts", "team_home", "team_away")


def _best_1x2(odds_list: list) -> dict:
    """Best published price per outcome, in pick_prices shape."""
    out = {}
    for e in odds_list or []:
        for sel, price in (e.get("odds") or {}).items():
            if sel not in ("home", "draw", "away"):
                continue
            try:
                p = float(price)
            except (TypeError, ValueError):
                continue
            cur = out.get(sel)
            if p > 1.0 and (cur is None or p > cur["odds"]):
                out[sel] = {"odds": p, "bookmaker": e.get("bookmaker") or ""}
    return out


def _build_ticket(m: dict, value: dict, prices: dict) -> dict:
    prices = {**_best_1x2(m.get("odds")), **prices}
    cands = []
    for c in _candidates(m, value):
        px = prices.get(c["pick"])
        if not px:
            continue
        odds = float(px["odds"])
        if c["prob"] < MIN_PROB or odds < MIN_ODDS:
            continue
        implied = 100.0 / odds
        edge = round(c["prob"] - implied, 1)
        if edge < MIN_EDGE:          # a ticket is only worth showing when every
            continue                 # leg beats the book's own price
        c.update({"odds": round(odds, 2), "bookmaker": px["bookmaker"],
                  "marketPct": round(implied), "edge": edge})
        cands.append(c)
    legs = []
    for grp in _GROUP_ORDER:
        pool = [c for c in cands if c["group"] == grp]
        if pool:
            # Inside a group: the best edge, then the longer price.
            legs.append(max(pool, key=lambda c: (c["edge"], c["odds"])))
    if len(legs) < MIN_LEGS:
        return None
    total = 1.0
    prob = 1.0
    for leg in legs:
        total *= leg["odds"]
        prob *= leg["prob"] / 100.0
    return {
        "id": f"lt_{m['id']}",
        "match": {"id": m["id"], "home": m["home"]["name"], "away": m["away"]["name"],
                  "homeLogo": (m.get("home") or {}).get("logo") or m.get("home_logo"),
                  "awayLogo": (m.get("away") or {}).get("logo") or m.get("away_logo"),
                  "league": m.get("leagueName"), "kickoff": m.get("commence_time")},
        "legs": legs,
        "legCount": len(legs),
        "totalOdds": round(total, 2),
        "combinedProb": round(prob * 100),
        "anchor": max(legs, key=lambda x: x["prob"]),
    }


async def build_tickets() -> list:
    cached = live_values._cache_get("lion_tickets")
    if cached is not None:
        return cached
    try:
        from src.services.value_engine import rank_value_matches
        entries = rank_value_matches(await live_values.build_live_matches())
    except Exception as e:
        logger.warning("lion_tickets: %s", e)
        return []
    out = []
    for e in entries[:MAX_MATCHES]:
        m, v = e.get("match") or {}, e.get("value") or {}
        if not m.get("id") or (m.get("status") or "") != "upcoming":
            continue
        try:
            prices = await rb.pick_prices(m["home"]["name"], m["away"]["name"])
        except Exception:
            prices = {}
        if not prices:
            continue
        t = _build_ticket(m, v, prices)
        if t:
            out.append(t)
    # Nearest kick-off first; between two the same day, the richer ticket wins.
    out.sort(key=lambda t: ((t["match"]["kickoff"] or "")[:10], -t["legCount"], -t["totalOdds"]))
    live_values._cache_set("lion_tickets", out, CACHE_TTL)
    return out
