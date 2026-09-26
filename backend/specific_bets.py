"""Specific Bets engine — INDEPENDENT of the existing prediction model.

Everything here is deterministic statistics (Poisson on real API-Football
averages). No LLM decides a number. When the underlying data is not good
enough the market is reported as INSUFFICIENT and simply not shown.
"""
import math
import logging
from typing import Optional

import apifootball as af

logger = logging.getLogger(__name__)

HIGH, MEDIUM, INSUFFICIENT = "HIGH", "MEDIUM", "INSUFFICIENT"


def _pmf(k: int, lam: float) -> float:
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-lam) * lam ** k / math.factorial(k)


def _p_over(line: float, lam: float) -> float:
    """P(total > line) for a half-integer line."""
    upto = int(math.floor(line))
    return max(0.0, 1.0 - sum(_pmf(k, lam) for k in range(0, upto + 1)))


def _pct(p: float) -> int:
    return int(round(max(0.0, min(1.0, p)) * 100))


def _implied(price: float) -> Optional[int]:
    return _pct(1.0 / price) if price and price > 1.0 else None


async def _fixture(fixture_id: str) -> Optional[dict]:
    ck = f"sb_fx2_{fixture_id}"
    hit = af._c_get(ck)
    if hit is not None:
        return hit
    out = None
    try:
        d = await af._get(af.FOOTBALL_BASE, "/fixtures", {"id": fixture_id})
        r = (d.get("response") or [None])[0]
        if r:
            lg, tm = r.get("league") or {}, r.get("teams") or {}
            out = {
                "league_id": lg.get("id"), "season": lg.get("season"),
                "home_id": (tm.get("home") or {}).get("id"),
                "away_id": (tm.get("away") or {}).get("id"),
                "home": (tm.get("home") or {}).get("name"),
                "away": (tm.get("away") or {}).get("name"),
                "home_logo": (tm.get("home") or {}).get("logo"),
                "away_logo": (tm.get("away") or {}).get("logo"),
            }
    except Exception as e:
        logger.warning("sb._fixture(%s): %s", fixture_id, e)
    af._c_set(ck, out, ttl=6 * 3600)
    return out


async def _stats(team_id, league_id, season) -> Optional[dict]:
    """Richer /teams/statistics view than the existing wrapper (own cache)."""
    ck = f"sb_ts_{team_id}_{league_id}_{season}"
    hit = af._c_get(ck)
    if hit is not None:
        return hit

    def f(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    out = None
    try:
        d = await af._get(af.FOOTBALL_BASE, "/teams/statistics",
                          {"team": team_id, "league": league_id, "season": season})
        r = d.get("response") or {}
        fx = ((r.get("fixtures") or {}).get("played") or {})
        goals = r.get("goals") or {}
        gf, ga = (goals.get("for") or {}), (goals.get("against") or {})
        mins = (gf.get("minute") or {})
        first = sum((mins.get(b) or {}).get("total") or 0 for b in ("0-15", "16-30", "31-45"))
        whole = sum((mins.get(b) or {}).get("total") or 0 for b in mins)
        cards = r.get("cards") or {}
        yel = sum((v or {}).get("total") or 0 for v in (cards.get("yellow") or {}).values())
        red = sum((v or {}).get("total") or 0 for v in (cards.get("red") or {}).values())
        played = fx.get("total") or 0
        out = {
            "played": played, "played_home": fx.get("home") or 0, "played_away": fx.get("away") or 0,
            "gf_home": f((gf.get("average") or {}).get("home")), "gf_away": f((gf.get("average") or {}).get("away")),
            "gf_total": f((gf.get("average") or {}).get("total")),
            "ga_home": f((ga.get("average") or {}).get("home")), "ga_away": f((ga.get("average") or {}).get("away")),
            "ga_total": f((ga.get("average") or {}).get("total")),
            "cards_per_game": round((yel + red) / played, 2) if played else None,
            "fh_share": round(first / whole, 3) if whole else None,
        }
    except Exception as e:
        logger.warning("sb._stats(%s): %s", team_id, e)
    af._c_set(ck, out, ttl=24 * 3600)
    return out


async def _corners(team_id, last: int = 3) -> Optional[dict]:
    """Corner averages from the last few finished fixtures (small sample -> MEDIUM)."""
    ck = f"sb_corners_{team_id}"
    hit = af._c_get(ck)
    if hit is not None:
        return hit
    out = None
    try:
        d = await af._get(af.FOOTBALL_BASE, "/fixtures",
                          {"team": team_id, "last": last, "status": "FT"})
        ids = [(f.get("fixture") or {}).get("id") for f in (d.get("response") or [])]
        got, conceded, n = 0, 0, 0
        for fid in [i for i in ids if i][:last]:
            s = await af._get(af.FOOTBALL_BASE, "/fixtures/statistics", {"fixture": fid})
            rows = s.get("response") or []
            mine = other = None
            for row in rows:
                val = None
                for st in row.get("statistics") or []:
                    if (st.get("type") or "").lower() == "corner kicks":
                        val = st.get("value")
                if val is None:
                    continue
                if str((row.get("team") or {}).get("id")) == str(team_id):
                    mine = val
                else:
                    other = val
            if mine is not None and other is not None:
                got += mine
                conceded += other
                n += 1
        if n >= 2:
            out = {"for": round(got / n, 2), "against": round(conceded / n, 2), "n": n}
    except Exception as e:
        logger.warning("sb._corners(%s): %s", team_id, e)
    af._c_set(ck, out, ttl=24 * 3600)
    return out


async def _squad(team_id, season) -> list:
    """Season player statistics for a squad (2 pages max) — own cache."""
    ck = f"sb_squad_{team_id}_{season}"
    hit = af._c_get(ck)
    if hit is not None:
        return hit
    players = []
    try:
        for page in (1, 2):
            d = await af._get(af.FOOTBALL_BASE, "/players",
                              {"team": team_id, "season": season, "page": page})
            resp = d.get("response") or []
            for row in resp:
                p = row.get("player") or {}
                mins = goals = assists = shots = sot = yel = apps = 0
                for s in row.get("statistics") or []:
                    if str(((s.get("team") or {}).get("id"))) != str(team_id):
                        continue
                    g = s.get("games") or {}
                    mins += g.get("minutes") or 0
                    apps += g.get("appearences") or 0
                    go = s.get("goals") or {}
                    goals += go.get("total") or 0
                    assists += go.get("assists") or 0
                    sh = s.get("shots") or {}
                    shots += sh.get("total") or 0
                    sot += sh.get("on") or 0
                    cd = s.get("cards") or {}
                    yel += cd.get("yellow") or 0
                if mins <= 0:
                    continue
                players.append({
                    "id": str(p.get("id")), "name": p.get("name"), "photo": p.get("photo"),
                    "position": (row.get("statistics") or [{}])[0].get("games", {}).get("position"),
                    "minutes": mins, "apps": apps, "goals": goals, "assists": assists,
                    "shots": shots, "sot": sot, "yellow": yel,
                })
            paging = (d.get("paging") or {})
            if page >= (paging.get("total") or 1):
                break
    except Exception as e:
        logger.warning("sb._squad(%s): %s", team_id, e)
    af._c_set(ck, players, ttl=24 * 3600)
    return players


def _row(market, selection, lion, market_pct=None, odds=None, book=None,
         line=None, pick=None, quality=HIGH, note=None, player=None, player_id=None):
    edge = None if market_pct is None else round(lion - market_pct, 1)
    return {
        "market": market, "selection": selection, "line": line, "pick": pick,
        "lion": lion, "market_pct": market_pct, "odds": odds, "bookmaker": book,
        "edge": edge, "value": bool(edge is not None and edge >= 5),
        "quality": quality, "note": note, "player": player, "player_id": player_id,
    }


def _best(rows: list) -> Optional[dict]:
    """Top opportunity: biggest positive edge, else the strongest *meaningful*
    probability — a 99% "Over 0.5" is not an opportunity, so near-certain and
    long-shot selections are excluded when no market price exists."""
    priced = [r for r in rows if r.get("edge") is not None]
    if priced:
        return max(priced, key=lambda r: (r["edge"], r["lion"]))
    band = [r for r in rows if 45 <= r["lion"] <= 82]
    pool = band or rows
    return max(pool, key=lambda r: r["lion"]) if pool else None


async def build(fixture_id: str, h2h_odds: Optional[dict] = None) -> dict:
    """Full Specific Bets payload for one fixture."""
    fx = await _fixture(fixture_id)
    if not fx or not fx.get("home_id"):
        return {"available": False, "reason": "Fixture data unavailable"}
    hs = await _stats(fx["home_id"], fx["league_id"], fx["season"])
    as_ = await _stats(fx["away_id"], fx["league_id"], fx["season"])
    if not hs or not as_ or not (hs.get("played") or 0) or not (as_.get("played") or 0):
        return {"available": False, "reason": "Not enough league data for this fixture yet"}

    league_avg = 1.35  # sane fallback when a split is missing
    h_att = hs.get("gf_home") or hs.get("gf_total") or league_avg
    h_def = hs.get("ga_home") or hs.get("ga_total") or league_avg
    a_att = as_.get("gf_away") or as_.get("gf_total") or league_avg
    a_def = as_.get("ga_away") or as_.get("ga_total") or league_avg
    # Attack vs opponent defence, averaged — the classic transparent approach.
    lam_h = max(0.15, (h_att + a_def) / 2)
    lam_a = max(0.15, (a_att + h_def) / 2)
    lam_t = lam_h + lam_a
    sample = min(hs["played"], as_["played"])
    q_goals = HIGH if sample >= 8 else (MEDIUM if sample >= 4 else INSUFFICIENT)
    if q_goals == INSUFFICIENT:
        return {"available": False, "reason": "Only a few league matches played so far"}

    # Score matrix for outcome-derived markets (0..8 goals is plenty).
    grid = [[_pmf(i, lam_h) * _pmf(j, lam_a) for j in range(9)] for i in range(9)]
    p_home = sum(grid[i][j] for i in range(9) for j in range(9) if i > j)
    p_draw = sum(grid[i][i] for i in range(9))
    p_away = sum(grid[i][j] for i in range(9) for j in range(9) if i < j)

    core, game = [], []

    # --- Goals over/under -----------------------------------------------------
    o = (h2h_odds or {})
    for line in (0.5, 1.5, 2.5, 3.5):
        po = _p_over(line, lam_t)
        mk_o = _implied(o.get(f"over{str(line).replace('.', '')}"))
        mk_u = _implied(o.get(f"under{str(line).replace('.', '')}"))
        core.append(_row("Goals", f"Over {line}", _pct(po), mk_o,
                         o.get(f"over{str(line).replace('.', '')}"), o.get("book"),
                         line=line, pick=f"over_{line}", quality=q_goals))
        core.append(_row("Goals", f"Under {line}", _pct(1 - po), mk_u,
                         o.get(f"under{str(line).replace('.', '')}"), o.get("book"),
                         line=line, pick=f"under_{line}", quality=q_goals))

    # --- BTTS -----------------------------------------------------------------
    p_btts = 1 - (_pmf(0, lam_h) + _pmf(0, lam_a) - _pmf(0, lam_h) * _pmf(0, lam_a))
    core.append(_row("Both Teams To Score", "Yes", _pct(p_btts), pick="btts_yes", quality=q_goals))
    core.append(_row("Both Teams To Score", "No", _pct(1 - p_btts), pick="btts_no", quality=q_goals))

    # --- Team goals -----------------------------------------------------------
    for side, lam, name in (("home", lam_h, fx["home"]), ("away", lam_a, fx["away"])):
        for line in (0.5, 1.5):
            core.append(_row("Team Goals", f"{name} Over {line}", _pct(_p_over(line, lam)),
                             line=line, pick=f"{side}_over_{line}", quality=q_goals))

    # --- Double chance (isolated inside this module) ---------------------------
    imp = None
    if o.get("home") and o.get("draw") and o.get("away"):
        raw = [1 / o["home"], 1 / o["draw"], 1 / o["away"]]
        tot = sum(raw)
        imp = [r / tot for r in raw]  # de-vigged 1X2 -> combine for DC
    core.append(_row("Double Chance", f"{fx['home']} or Draw", _pct(p_home + p_draw),
                     _pct(imp[0] + imp[1]) if imp else None, pick="home_or_draw", quality=q_goals))
    core.append(_row("Double Chance", f"{fx['away']} or Draw", _pct(p_away + p_draw),
                     _pct(imp[2] + imp[1]) if imp else None, pick="away_or_draw", quality=q_goals))
    core.append(_row("Double Chance", "Home or Away (no draw)", _pct(p_home + p_away),
                     _pct(imp[0] + imp[2]) if imp else None, pick="home_or_away", quality=q_goals))

    # --- Handicap -------------------------------------------------------------
    p_h1 = sum(grid[i][j] for i in range(9) for j in range(9) if i - j >= 2)
    p_a1 = sum(grid[i][j] for i in range(9) for j in range(9) if j - i >= 2)
    core.append(_row("Handicap", f"{fx['home']} -1", _pct(p_h1), line=-1, pick="home_hcp_-1", quality=q_goals))
    core.append(_row("Handicap", f"{fx['away']} -1", _pct(p_a1), line=-1, pick="away_hcp_-1", quality=q_goals))

    # --- Cards ----------------------------------------------------------------
    if hs.get("cards_per_game") and as_.get("cards_per_game"):
        lam_c = hs["cards_per_game"] + as_["cards_per_game"]
        for line in (3.5, 4.5, 5.5):
            game.append(_row("Cards", f"Over {line} cards", _pct(_p_over(line, lam_c)),
                             line=line, pick=f"cards_over_{line}", quality=q_goals,
                             note=f"Expected {round(lam_c, 1)} cards"))
            game.append(_row("Cards", f"Under {line} cards", _pct(1 - _p_over(line, lam_c)),
                             line=line, pick=f"cards_under_{line}", quality=q_goals))

    # --- Corners --------------------------------------------------------------
    hc, ac = await _corners(fx["home_id"]), await _corners(fx["away_id"])
    if hc and ac:
        lam_corn = (hc["for"] + ac["against"]) / 2 + (ac["for"] + hc["against"]) / 2
        for line in (8.5, 9.5, 10.5):
            game.append(_row("Corners", f"Over {line} corners", _pct(_p_over(line, lam_corn)),
                             line=line, pick=f"corners_over_{line}", quality=MEDIUM,
                             note=f"Expected {round(lam_corn, 1)} · {hc['n'] + ac['n']} matches sampled"))
            game.append(_row("Corners", f"Under {line} corners", _pct(1 - _p_over(line, lam_corn)),
                             line=line, pick=f"corners_under_{line}", quality=MEDIUM))

    # --- First half -----------------------------------------------------------
    shares = [s for s in (hs.get("fh_share"), as_.get("fh_share")) if s]
    if shares:
        share = sum(shares) / len(shares)
        lam_fh = lam_t * share
        lam_fh_h, lam_fh_a = lam_h * share, lam_a * share
        for line in (0.5, 1.5):
            game.append(_row("First Half", f"Over {line} goals (1st half)", _pct(_p_over(line, lam_fh)),
                             line=line, pick=f"fh_over_{line}", quality=MEDIUM,
                             note=f"{_pct(share)}% of goals come before HT"))
            game.append(_row("First Half", f"Under {line} goals (1st half)", _pct(1 - _p_over(line, lam_fh)),
                             line=line, pick=f"fh_under_{line}", quality=MEDIUM))
        p_fh_btts = 1 - (_pmf(0, lam_fh_h) + _pmf(0, lam_fh_a) - _pmf(0, lam_fh_h) * _pmf(0, lam_fh_a))
        game.append(_row("First Half", "Both teams to score (1st half)", _pct(p_fh_btts),
                         pick="fh_btts_yes", quality=MEDIUM))

    # --- Players intelligence -------------------------------------------------
    async def team_players(team_id, lam_team, stats, side):
        squad = await _squad(team_id, fx["season"])
        scale = (lam_team / stats["gf_total"]) if stats.get("gf_total") else 1.0
        scale = max(0.5, min(1.8, scale))
        rows = []
        for p in squad:
            mins, apps = p["minutes"], max(1, p["apps"])
            if mins < 180:
                continue
            q = HIGH if mins >= 450 and apps >= 6 else MEDIUM
            exp_min = min(90.0, mins / apps)
            per = lambda v: (v / mins) * exp_min  # noqa: E731 - per-90 scaled to expected minutes
            lam_g = per(p["goals"]) * scale
            lam_sh, lam_sot = per(p["shots"]), per(p["sot"])
            lam_as = per(p["assists"]) * scale
            lam_yc = per(p["yellow"])
            base = dict(player=p["name"], player_id=p["id"], quality=q)
            if lam_g > 0:
                rows.append(_row("Player Goals", "To score anytime", _pct(1 - math.exp(-lam_g)),
                                 pick=f"p{p['id']}_score", **base))
            if lam_sh > 0:
                for line in (0.5, 1.5, 2.5):
                    if _p_over(line, lam_sh) >= 0.15:
                        rows.append(_row("Player Shots", f"Over {line} shots", _pct(_p_over(line, lam_sh)),
                                         line=line, pick=f"p{p['id']}_shots_over_{line}", **base))
            if lam_sot > 0:
                for line in (0.5, 1.5):
                    if _p_over(line, lam_sot) >= 0.15:
                        rows.append(_row("Player Shots on Target", f"Over {line} on target",
                                         _pct(_p_over(line, lam_sot)), line=line,
                                         pick=f"p{p['id']}_sot_over_{line}", **base))
            if lam_as > 0:
                rows.append(_row("Player Assists", "To assist", _pct(1 - math.exp(-lam_as)),
                                 pick=f"p{p['id']}_assist", **base))
            if lam_yc > 0:
                rows.append(_row("Player Cards", "To be carded", _pct(1 - math.exp(-lam_yc)),
                                 pick=f"p{p['id']}_card", **base))
        rows.sort(key=lambda r: -r["lion"])
        # Highlighted picks avoid near-certainties (Over 0.5 shots) and long shots.
        top = [r for r in rows if 45 <= r["lion"] <= 82][:4]
        return {"team": fx["home"] if side == "home" else fx["away"], "side": side,
                "rows": rows, "top": top or rows[:3]}

    players = []
    for side, tid, lam_team, st in (("home", fx["home_id"], lam_h, hs), ("away", fx["away_id"], lam_a, as_)):
        try:
            block = await team_players(tid, lam_team, st, side)
            if block["rows"]:
                players.append(block)
        except Exception as e:
            logger.warning("sb players %s: %s", tid, e)

    return {
        "available": True,
        "fixture_id": str(fixture_id),
        "home": fx["home"], "away": fx["away"],
        "home_logo": fx.get("home_logo"), "away_logo": fx.get("away_logo"),
        "model": {"xg_home": round(lam_h, 2), "xg_away": round(lam_a, 2),
                  "xg_total": round(lam_t, 2), "sample_matches": sample},
        "quality": q_goals,
        "categories": [
            {"key": "core", "title": "Core Markets", "rows": core, "top": _best(core)},
            {"key": "game", "title": "Game Markets", "rows": game, "top": _best(game)},
        ],
        "players": players,
        "market_odds_available": bool(imp),
    }
