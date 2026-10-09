"""Specific Bets engine — INDEPENDENT of the existing prediction model.

Everything here is deterministic statistics (Poisson on real API-Football
averages). No LLM decides a number. When the underlying data is not good
enough the market is reported as INSUFFICIENT and simply not shown.
"""
import math
import logging
import re
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


async def _fixture_stats(team_id, last: int = 3) -> Optional[dict]:
    """Per-match averages from the last few finished fixtures.

    One fetch covers corners, fouls, offsides and goalkeeper saves — the same
    API calls, four markets. Small sample, so these are flagged MEDIUM.
    """
    ck = f"sb_fxstats_{team_id}"
    hit = af._c_get(ck)
    if hit is not None:
        return hit
    out = None
    want = {"corner kicks": "corners", "fouls": "fouls", "offsides": "offsides",
            "goalkeeper saves": "saves"}
    try:
        d = await af._get(af.FOOTBALL_BASE, "/fixtures",
                          {"team": team_id, "last": last, "status": "FT"})
        ids = [(f.get("fixture") or {}).get("id") for f in (d.get("response") or [])]
        acc = {v: 0 for v in want.values()}
        acc["corners_against"] = 0
        n = 0
        for fid in [i for i in ids if i][:last]:
            s = await af._get(af.FOOTBALL_BASE, "/fixtures/statistics", {"fixture": fid})
            mine, other = {}, {}
            for row in s.get("response") or []:
                target = mine if str((row.get("team") or {}).get("id")) == str(team_id) else other
                for st in row.get("statistics") or []:
                    k = want.get((st.get("type") or "").lower())
                    if k and st.get("value") is not None:
                        target[k] = st["value"]
            if "corners" in mine and "corners" in other:
                acc["corners_against"] += other["corners"]
                n += 1
                for k in want.values():
                    acc[k] += mine.get(k) or 0
        if n >= 2:
            out = {k: round(v / n, 2) for k, v in acc.items()}
            out["n"] = n
    except Exception as e:
        logger.warning("sb._fixture_stats(%s): %s", team_id, e)
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


def _lines(default, priced: set, pattern: str) -> list:
    """Our model lines plus every line the bookmakers price for this fixture."""
    out = set(default)
    for p in priced:
        m = re.match(pattern, p)
        if m:
            try:
                out.add(float(m.group(1)))
            except ValueError:
                pass
    return sorted(out)


def _row(market, selection, lion, market_pct=None, odds=None, book=None,
         line=None, pick=None, quality=HIGH, note=None, player=None, player_id=None, side=None,
         short=None):
    edge = None if market_pct is None else round(lion - market_pct, 1)
    return {
        "market": market, "selection": selection, "line": line, "pick": pick,
        "lion": lion, "market_pct": market_pct, "odds": odds, "bookmaker": book,
        "edge": edge, "value": bool(edge is not None and edge >= 5),
        "quality": quality, "note": note, "player": player, "player_id": player_id,
        "side": side, "short": short,
    }


def _best(rows: list) -> Optional[dict]:
    """LION's pick is always the selection our model rates highest; a better
    market price only breaks ties between equally likely selections."""
    if not rows:
        return None
    return max(rows, key=lambda r: (r["lion"], r.get("edge") or 0))


def _calibrate(pred: dict) -> Optional[tuple]:
    """Find the (lam_home, lam_away) whose Poisson grid reproduces the match
    model's own 1X2 (+ over 2.5) probabilities, so both pages always agree.

    Pure arithmetic on numbers we already have — no extra API call.
    """
    try:
        ph, pd, pa = [float(pred[k]) / 100.0 for k in ("home", "draw", "away")]
    except (KeyError, TypeError, ValueError):
        return None
    tot = ph + pd + pa
    if tot <= 0:
        return None
    ph, pd, pa = ph / tot, pd / tot, pa / tot
    o25 = pred.get("over25")
    o25 = float(o25) / 100.0 if o25 not in (None, "") else None

    def err(lh, la):
        H = [_pmf(k, lh) for k in range(9)]
        A = [_pmf(k, la) for k in range(9)]
        h = sum(H[i] * A[j] for i in range(9) for j in range(9) if i > j)
        d = sum(H[i] * A[i] for i in range(9))
        a = sum(H[i] * A[j] for i in range(9) for j in range(9) if i < j)
        e = (h - ph) ** 2 + (d - pd) ** 2 + (a - pa) ** 2
        if o25 is not None:
            over = 1.0 - sum(_pmf(k, lh + la) for k in range(3))
            e += 0.7 * (over - o25) ** 2
        return e

    best, step, lo, hi = None, 0.1, 0.2, 3.6
    for _ in range(2):  # coarse pass, then a fine pass around the winner
        lh = lo
        while lh <= hi + 1e-9:
            la = lo
            while la <= hi + 1e-9:
                e = err(lh, la)
                if best is None or e < best[0]:
                    best = (e, lh, la)
                la = round(la + step, 3)
            lh = round(lh + step, 3)
        lo, hi, step = max(0.15, best[1] - 0.1), best[1] + 0.1, 0.02
        lo2, hi2 = max(0.15, best[2] - 0.1), best[2] + 0.1
        # second pass searches a tight box around both winners
        lo, hi = min(lo, lo2), max(hi, hi2)
    return (best[1], best[2]) if best else None


async def _nation_topup(st, team_id, name):
    """A qualifying group gives 3-10 games. Use the opponent- and recency-
    weighted record of the national team's last 12 matches instead (cached)."""
    if not team_id or (st and (st.get("played") or 0) >= 8):
        return st
    try:
        f = await af.nation_form(team_id, name)
    except Exception as e:
        logger.warning("sb nation form %s: %s", name, e)
        return st
    if not f:
        return st
    out = dict(st or {})
    out.update({"played": f["played"], "gf_total": f["gf"], "ga_total": f["ga"]})
    return out


async def build(fixture_id: str, h2h_odds: Optional[dict] = None,
                model_pick: Optional[str] = None,
                model_pred: Optional[dict] = None,
                pick_odds: Optional[dict] = None) -> dict:
    """Full Specific Bets payload for one fixture."""
    fx = await _fixture(fixture_id)
    if not fx or not fx.get("home_id"):
        return {"available": False, "reason": "Fixture data unavailable"}
    hs = await _stats(fx["home_id"], fx["league_id"], fx["season"])
    as_ = await _stats(fx["away_id"], fx["league_id"], fx["season"])
    national = fx.get("league_id") in af.NATION_LEAGUE_IDS
    neutral = fx.get("league_id") in af.NEUTRAL_LEAGUE_IDS
    if national:
        hs = await _nation_topup(hs, fx["home_id"], fx["home"])
        as_ = await _nation_topup(as_, fx["away_id"], fx["away"])
    if not hs or not as_ or not (hs.get("played") or 0) or not (as_.get("played") or 0):
        return {"available": False, "reason": "Not enough league data for this fixture yet"}

    league_avg = 1.35  # sane fallback when a split is missing
    if national:
        # National teams: small samples, so prefer the overall averages. Finals
        # tournaments are on neutral ground; qualifiers and the Nations League
        # are real home-and-away, so use the team's own split once it has
        # enough home/away games, otherwise a modest home tilt.
        h_att = hs.get("gf_total") or league_avg
        h_def = hs.get("ga_total") or league_avg
        a_att = as_.get("gf_total") or league_avg
        a_def = as_.get("ga_total") or league_avg
        if not neutral:
            if (hs.get("played_home") or 0) >= 3 and hs.get("gf_home"):
                h_att, h_def = hs["gf_home"], hs.get("ga_home") or h_def
            else:
                h_att *= 1.08
            if (as_.get("played_away") or 0) >= 3 and as_.get("gf_away"):
                a_att, a_def = as_["gf_away"], as_.get("ga_away") or a_def
            else:
                a_att *= 0.94
    else:
        h_att = hs.get("gf_home") or hs.get("gf_total") or league_avg
        h_def = hs.get("ga_home") or hs.get("ga_total") or league_avg
        a_att = as_.get("gf_away") or as_.get("gf_total") or league_avg
        a_def = as_.get("ga_away") or as_.get("ga_total") or league_avg
    # Attack vs opponent defence, averaged — the classic transparent approach.
    lam_h = max(0.15, (h_att + a_def) / 2)
    lam_a = max(0.15, (a_att + h_def) / 2)
    basis = "team averages"
    # Anchor on the match model's own probabilities when we have them: one match,
    # one view of the game, so a "1-0" can never sit under an "away win".
    fit = _calibrate(model_pred or {})
    if fit:
        lam_h, lam_a = fit
        basis = "calibrated to LION's match model"
    lam_t = lam_h + lam_a
    sample = min(hs["played"], as_["played"])
    q_goals = HIGH if sample >= 8 else (MEDIUM if sample >= 4 else INSUFFICIENT)
    if national and q_goals == HIGH:
        # Squads and coaches change between windows — never claim HIGH here.
        q_goals = MEDIUM
    if q_goals == INSUFFICIENT:
        return {"available": False, "reason": "Only a few league matches played so far"}

    # Score matrix for outcome-derived markets (0..8 goals is plenty).
    grid = [[_pmf(i, lam_h) * _pmf(j, lam_a) for j in range(9)] for i in range(9)]
    p_home = sum(grid[i][j] for i in range(9) for j in range(9) if i > j)
    p_draw = sum(grid[i][i] for i in range(9))
    p_away = sum(grid[i][j] for i in range(9) for j in range(9) if i < j)

    core, game = [], []
    panels = []

    def panel(key, title, icon, rows, split=False, note=None, top_from=None):
        if rows:
            panels.append({"key": key, "title": title, "icon": icon, "rows": rows,
                           "top": _best(top_from if top_from else rows),
                           "split": split, "note": note})

    # --- Goals over/under -----------------------------------------------------
    o = (h2h_odds or {})
    # Model lines, plus any line the books actually price for THIS fixture: if a
    # bookmaker quotes Over 5.5, hiding our own number for it serves nobody.
    priced = {k for k, v in (pick_odds or {}).items() if v and v.get("odds")}
    goals_rows = []
    for line in _lines((0.5, 1.5, 2.5, 3.5), priced, r"^over_([\d.]+)$"):
        po = _p_over(line, lam_t)
        goals_rows.append(_row("Goals", f"Over {line}", _pct(po), pick=f"over_{line}",
                               line=line, quality=q_goals))
        goals_rows.append(_row("Goals", f"Under {line}", _pct(1 - po), pick=f"under_{line}",
                               line=line, quality=q_goals))
    core += goals_rows
    panel("goals", "Goals Over / Under", "goals", goals_rows,
          note=f"Expected {round(lam_t, 2)} goals")

    # --- BTTS -----------------------------------------------------------------
    p_btts = 1 - (_pmf(0, lam_h) + _pmf(0, lam_a) - _pmf(0, lam_h) * _pmf(0, lam_a))
    btts = [_row("Both Teams To Score", "Yes", _pct(p_btts), pick="btts_yes", quality=q_goals),
            _row("Both Teams To Score", "No", _pct(1 - p_btts), pick="btts_no", quality=q_goals)]
    core += btts
    panel("btts", "Both Teams To Score", "btts", btts)

    # --- Team goals -----------------------------------------------------------
    tg = []
    for side, lam, name in (("home", lam_h, fx["home"]), ("away", lam_a, fx["away"])):
        for line in _lines((0.5, 1.5, 2.5), priced, rf"^{side}_over_([\d.]+)$"):
            tg.append(_row("Team Goals", f"Over {line} goals", _pct(_p_over(line, lam)),
                           line=line, pick=f"{side}_over_{line}", quality=q_goals, side=side))
    core += tg
    panel("team_goals", "Team Goals", "team_goals", tg, split=True)

    # --- Double chance (isolated inside this module) ---------------------------
    imp = None
    if o.get("home") and o.get("draw") and o.get("away"):
        raw = [1 / o["home"], 1 / o["draw"], 1 / o["away"]]
        tot = sum(raw)
        imp = [r / tot for r in raw]  # de-vigged 1X2 -> combine for DC
    dc = [
        _row("Double Chance", f"{fx['home']} or Draw", _pct(p_home + p_draw),
             _pct(imp[0] + imp[1]) if imp else None, pick="home_or_draw", quality=q_goals),
        _row("Double Chance", f"{fx['away']} or Draw", _pct(p_away + p_draw),
             _pct(imp[2] + imp[1]) if imp else None, pick="away_or_draw", quality=q_goals),
        _row("Double Chance", "Home or Away (no draw)", _pct(p_home + p_away),
             _pct(imp[0] + imp[2]) if imp else None, pick="home_or_away", quality=q_goals),
    ]
    core += dc
    panel("double_chance", "Double Chance", "double_chance", dc)

    # --- Handicap -------------------------------------------------------------
    # Half lines only (a side covers when diff + line > 0), which is exactly how
    # the slip settles them — no pushes to explain.
    hcp = []
    for line in _lines((-1.5, -0.5, 0.5, 1.5), priced, r"^home_hcp_(-?[\d.]+)$"):
        p_cov = sum(grid[i][j] for i in range(9) for j in range(9) if i - j + line > 0)
        hcp.append(_row("Handicap", f"{fx['home']} {line:+g}", _pct(p_cov), line=line,
                        pick=f"home_hcp_{line:g}", quality=q_goals, side="home",
                        short=f"{line:+g}"))
    for line in _lines((-1.5, -0.5, 0.5, 1.5), priced, r"^away_hcp_(-?[\d.]+)$"):
        p_cov = sum(grid[i][j] for i in range(9) for j in range(9) if j - i + line > 0)
        hcp.append(_row("Handicap", f"{fx['away']} {line:+g}", _pct(p_cov), line=line,
                        pick=f"away_hcp_{line:g}", quality=q_goals, side="away",
                        short=f"{line:+g}"))
    core += hcp
    panel("handicap", "Handicap", "handicap", hcp, split=True)

    # --- Correct score (final) ------------------------------------------------
    # The highlighted scoreline must agree with the result the SAME model rates
    # highest, so the page never suggests 0-1 while it is calling a home win.
    lead = max((p_home, "home"), (p_draw, "draw"), (p_away, "away"))[1]
    # If the match page already shows a LION match pick, follow it so the two
    # pages never contradict each other.
    if model_pick in ("home", "draw", "away"):
        lead = model_pick
    fits = {"home": lambda i, j: i > j, "draw": lambda i, j: i == j, "away": lambda i, j: i < j}[lead]
    lead_label = {"home": fx["home"], "draw": "a draw", "away": fx["away"]}[lead]
    cs = []
    flat = sorted(((grid[i][j], i, j) for i in range(6) for j in range(6)), reverse=True)[:8]
    for p, i, j in flat:
        cs.append(_row("Correct Score", f"{i} - {j}", _pct(p), pick=f"cs_{i}_{j}", quality=q_goals))
    panel("correct_score", "Correct Score (final)", "correct_score", cs,
          note=f"Most likely final scorelines · consistent with LION's call: {lead_label}",
          top_from=[r for r in cs if fits(*(int(x) for x in r["pick"].split("_")[1:]))])

    # --- Score at any time ----------------------------------------------------
    # A scoreline x-y is reached at some point iff both teams get at least that
    # many goals, so P = P(H>=x) * P(A>=y).
    anyt = []
    for i, j in ((1, 0), (0, 1), (1, 1), (2, 0), (0, 2), (2, 1), (1, 2), (2, 2)):
        ph = 1 - sum(_pmf(k, lam_h) for k in range(i)) if i else 1.0
        pa = 1 - sum(_pmf(k, lam_a) for k in range(j)) if j else 1.0
        anyt.append(_row("Score At Any Time", f"{i} - {j} at some point", _pct(ph * pa),
                         pick=f"anyt_{i}_{j}", quality=MEDIUM))
    panel("score_anytime", "Score At Any Time", "score_anytime", anyt,
          note="This exact scoreline appears at some moment in the match")

    # --- Cards ----------------------------------------------------------------
    if hs.get("cards_per_game") and as_.get("cards_per_game"):
        lam_c = hs["cards_per_game"] + as_["cards_per_game"]
        cards = []
        for line in (3.5, 4.5, 5.5):
            cards.append(_row("Cards", f"Over {line} cards", _pct(_p_over(line, lam_c)),
                              line=line, pick=f"cards_over_{line}", quality=q_goals))
            cards.append(_row("Cards", f"Under {line} cards", _pct(1 - _p_over(line, lam_c)),
                              line=line, pick=f"cards_under_{line}", quality=q_goals))
        game += cards
        panel("cards", "Cards", "cards", cards, note=f"Expected {round(lam_c, 1)} cards")

    # --- Corners / fouls / offsides / saves (same fixture-stats fetch) ---------
    hc, ac = await _fixture_stats(fx["home_id"]), await _fixture_stats(fx["away_id"])
    if hc and ac:
        sample_note = f"{hc['n'] + ac['n']} recent matches sampled"
        lam_corn = (hc["corners"] + ac["corners_against"]) / 2 + (ac["corners"] + hc["corners_against"]) / 2
        corners = []
        for line in _lines((8.5, 9.5, 10.5, 11.5), priced, r"^corners_over_([\d.]+)$"):
            corners.append(_row("Corners", f"Over {line} corners", _pct(_p_over(line, lam_corn)),
                                line=line, pick=f"corners_over_{line}", quality=MEDIUM))
            corners.append(_row("Corners", f"Under {line} corners", _pct(1 - _p_over(line, lam_corn)),
                                line=line, pick=f"corners_under_{line}", quality=MEDIUM))
        game += corners
        panel("corners", "Corners", "corners", corners,
              note=f"Expected {round(lam_corn, 1)} · {sample_note}")

        lam_f = hc["fouls"] + ac["fouls"]
        fouls = []
        for line in (19.5, 21.5, 23.5):
            fouls.append(_row("Fouls", f"Over {line} total fouls", _pct(_p_over(line, lam_f)),
                              line=line, pick=f"fouls_over_{line}", quality=MEDIUM))
            fouls.append(_row("Fouls", f"Under {line} total fouls", _pct(1 - _p_over(line, lam_f)),
                              line=line, pick=f"fouls_under_{line}", quality=MEDIUM))
        for side, st, name in (("home", hc, fx["home"]), ("away", ac, fx["away"])):
            for line in (9.5, 11.5):
                fouls.append(_row("Team Fouls", f"{name} over {line} fouls", _pct(_p_over(line, st["fouls"])),
                                  line=line, pick=f"{side}_fouls_over_{line}", quality=MEDIUM, side=side))
        game += fouls
        panel("fouls", "Fouls", "fouls", fouls,
              note=f"Expected {round(lam_f, 1)} total · {sample_note}")

        lam_off = hc["offsides"] + ac["offsides"]
        if lam_off > 0:
            offs = []
            for line in (1.5, 2.5, 3.5):
                offs.append(_row("Offsides", f"Over {line} offsides", _pct(_p_over(line, lam_off)),
                                 line=line, pick=f"offsides_over_{line}", quality=MEDIUM))
                offs.append(_row("Offsides", f"Under {line} offsides", _pct(1 - _p_over(line, lam_off)),
                                 line=line, pick=f"offsides_under_{line}", quality=MEDIUM))
            game += offs
            panel("offsides", "Offsides", "offsides", offs,
                  note=f"Expected {round(lam_off, 1)} · {sample_note}")

        saves = []
        for side, st, name in (("home", hc, fx["home"]), ("away", ac, fx["away"])):
            if (st.get("saves") or 0) <= 0:
                continue
            for line in (1.5, 2.5, 3.5, 4.5):
                saves.append(_row("Goalkeeper Saves", f"Over {line} saves", _pct(_p_over(line, st["saves"])),
                                  line=line, pick=f"{side}_saves_over_{line}", quality=MEDIUM, side=side))
        game += saves
        panel("saves", "Goalkeeper Saves", "saves", saves, split=True, note=sample_note)

    # --- First half -----------------------------------------------------------
    shares = [s for s in (hs.get("fh_share"), as_.get("fh_share")) if s]
    if shares:
        share = sum(shares) / len(shares)
        lam_fh = lam_t * share
        lam_fh_h, lam_fh_a = lam_h * share, lam_a * share
        fh = []
        for line in _lines((0.5, 1.5), priced, r"^fh_over_([\d.]+)$"):
            fh.append(_row("First Half", f"Over {line} goals (1st half)", _pct(_p_over(line, lam_fh)),
                           line=line, pick=f"fh_over_{line}", quality=MEDIUM))
            fh.append(_row("First Half", f"Under {line} goals (1st half)", _pct(1 - _p_over(line, lam_fh)),
                           line=line, pick=f"fh_under_{line}", quality=MEDIUM))
        p_fh_btts = 1 - (_pmf(0, lam_fh_h) + _pmf(0, lam_fh_a) - _pmf(0, lam_fh_h) * _pmf(0, lam_fh_a))
        fh.append(_row("First Half", "Both teams to score (1st half)", _pct(p_fh_btts),
                       pick="fh_btts_yes", quality=MEDIUM))
        game += fh
        panel("first_half", "First Half", "first_half", fh,
              note=f"{_pct(share)}% of goals come before half time")

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
        return {"team": fx["home"] if side == "home" else fx["away"], "side": side,
                "rows": rows, "top": rows[:4]}

    players = []
    for side, tid, lam_team, st in () if national else (("home", fx["home_id"], lam_h, hs), ("away", fx["away_id"], lam_a, as_)):
        try:
            block = await team_players(tid, lam_team, st, side)
            if block["rows"]:
                players.append(block)
        except Exception as e:
            logger.warning("sb players %s: %s", tid, e)

    # --- Real bookmaker prices per selection ---------------------------------
    # Priced from the SAME cached Greek-book snapshots used for 1X2 (no extra
    # call). Opposite lines are de-vigged against each other so MARKET % is the
    # bookmaker's true view; a lone price falls back to raw implied odds.
    po = {k: v for k, v in (pick_odds or {}).items() if v and v.get("odds")}
    if po:
        def _opp(pk):
            if pk.startswith("btts_"):
                return "btts_no" if pk.endswith("_yes") else "btts_yes"
            for a, b in (("over_", "under_"), ("under_", "over_")):
                i = pk.find(a)
                if i >= 0:
                    return pk[:i] + b + pk[i + len(a):]
            return None

        def _apply(rows):
            for r in rows:
                hit = po.get(r.get("pick"))
                if not hit:
                    continue
                r["odds"], r["bookmaker"] = hit["odds"], hit["bookmaker"]
                own = 1.0 / hit["odds"]
                opp = po.get(_opp(r["pick"]) or "")
                tot = own + (1.0 / opp["odds"]) if opp else 0
                r["market_pct"] = _pct(own / tot) if tot > 1 else _pct(own)
                r["edge"] = round(r["lion"] - r["market_pct"], 1)
                r["value"] = bool(r["edge"] >= 5)
        # panel/category "top" entries are references to these same row dicts,
        # so mutating the rows prices the highlighted pick too.
        for _p in panels:
            _apply(_p["rows"])
        _apply(core)
        _apply(game)
        for blk in players:
            _apply(blk["rows"])

    return {
        "available": True,
        "fixture_id": str(fixture_id),
        "home": fx["home"], "away": fx["away"],
        "home_logo": fx.get("home_logo"), "away_logo": fx.get("away_logo"),
        "model": {"xg_home": round(lam_h, 2), "xg_away": round(lam_a, 2),
                  "xg_total": round(lam_t, 2), "sample_matches": sample, "basis": basis},
        "quality": q_goals,
        "national": national,
        "panels": panels,
        "categories": [
            {"key": "core", "title": "Core Markets", "rows": core, "top": _best(core)},
            {"key": "game", "title": "Game Markets", "rows": game, "top": _best(game)},
        ],
        "players": players,
        "market_odds_available": bool(imp or po),
    }
