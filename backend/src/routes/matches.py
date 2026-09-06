"""GET /api/matches and GET /api/matches/{id}."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from ..data.mock_matches import MATCH_INDEX, MOCK_MATCHES
from ..services.value_engine import evaluate_match, public_match
from ..services.probability_engine import full_prediction, possible_outcome

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["matches"])


def _clampf(v, lo, hi):
    return max(lo, min(hi, v))


@router.get("/matches")
async def list_matches():
    items = []
    for m in MOCK_MATCHES:
        pm = public_match(m)
        pm["value"] = evaluate_match(m)
        items.append(pm)
    return {"count": len(items), "matches": items}


@router.get("/matches/trending")
async def trending_matches():
    """Live/trending feed for the global search palette.

    Declared before /matches/{match_id} so the literal 'trending' path is not
    captured as a match_id (this router is mounted before the FSL api_router).
    """
    from football_service_layer import fsl_get_matches, _mock_matches
    try:
        r = await fsl_get_matches()
        return {"matches": r["matches"], "source": r["source"], "meta": {
            "liveCount": r["liveCount"], "totalCount": r["totalCount"],
            "highValue": r["highValue"], "fetchedAt": r["fetchedAt"],
        }}
    except Exception:
        return {"matches": _mock_matches(), "source": "mock", "meta": {}}


@router.get("/live")
async def live_ticker():
    """All in-play fixtures (score + minute) across every league — 1 cached call."""
    import apifootball
    return {"matches": await apifootball.live_fixtures()}


@router.get("/results")
async def match_results(ids: str = ""):
    """Final results for a comma-separated list of live match ids (batched+cached)."""
    id_list = [x for x in ids.split(",") if x]
    if not id_list:
        return {"results": {}}
    import apifootball
    return {"results": await apifootball.fixture_results(id_list)}


@router.get("/teams/{team_id}/stats")
async def team_stats(team_id: str, league: str = ""):
    """Clean sheets + home/away goal splits for one team (lazy + cached 24h).

    Used by the Team Compare panel. `league` is the catalog slug (e.g. 'epl')."""
    import apifootball as af
    c = af.CATALOG.get(league) or {}
    lid = c.get("league_id")
    if not lid:
        return {"stats": None}
    return {"stats": await af.team_statistics(team_id, lid)}


async def _build_live_match(match_id: str):
    """Build a match object on-demand for an in-play fixture (any league).

    Pay-per-view: reuses the cached live list (no extra call) and only pulls
    team statistics (cached 24h) + live game stats (cached 60s) for THIS match."""
    if not match_id.startswith("live_af_"):
        return None
    import apifootball as af
    live = await af.live_fixtures()
    item = next((x for x in live if x.get("id") == match_id), None)
    if not item:
        return None
    fid = match_id.split("live_af_")[-1]
    lid = item.get("leagueId")
    hid, aid = item.get("homeId"), item.get("awayId")
    hstat = await af.team_statistics(hid, lid) if (hid and lid) else None
    astat = await af.team_statistics(aid, lid) if (aid and lid) else None
    stats = await af.live_fixture_stats(fid)

    def _mk(name, st):
        return {
            "name": name,
            "goalsScored": (st or {}).get("gf_total"),
            "goalsConceded": (st or {}).get("ga_total"),
            "form": None,
            "possession": None,
        }

    hs, as_ = item.get("homeScore"), item.get("awayScore")
    return {
        "id": match_id,
        "leagueId": str(lid) if lid is not None else "live",
        "leagueName": item.get("league"),
        "sport": "football",
        "status": "live",
        "commence_time": None,
        "score": f"{hs if hs is not None else 0}-{as_ if as_ is not None else 0}",
        "home": _mk(item.get("home"), hstat),
        "away": _mk(item.get("away"), astat),
        "home_id": hid,
        "away_id": aid,
        "odds": [],
        "live": {
            "minute": item.get("minute"),
            "homeScore": hs,
            "awayScore": as_,
            "status": item.get("status"),
            "homeLogo": item.get("homeLogo"),
            "awayLogo": item.get("awayLogo"),
            "stats": stats,
        },
        "dataSource": "apifootball-live",
    }


async def _resolve_match(match_id: str):
    m = MATCH_INDEX.get(match_id)
    if not m:
        # live matches are not in the mock index
        try:
            import live_values
            live = await live_values.build_live_matches()
            m = next((x for x in live if x.get("id") == match_id), None)
        except Exception:
            m = None
    if not m:
        # in-play fixture from any league — resolve on demand
        try:
            m = await _build_live_match(match_id)
        except Exception as e:
            logger.warning("build_live_match(%s): %s", match_id, e)
            m = None
    return m


def _prediction_only_value(m: dict):
    """Value block for a live match with no pre-match odds: Moka prediction only
    (no pick / EV / odds — those do not apply in-play)."""
    pred = full_prediction(m["home"], m["away"])
    probs = {"home": pred["home"], "draw": pred["draw"], "away": pred["away"]}
    return {
        "match_id": m["id"],
        "pick": None, "pick_name": None, "best_odds": None, "bookmaker": None,
        "model_prob": None, "market_prob": None, "edge": None, "ev_score": None,
        "value_level": "LIVE", "confidence": None, "value_score": None,
        "probabilities": {k: round(v * 100) for k, v in probs.items()},
        "prediction": {
            "home": round(pred["home"] * 100), "draw": round(pred["draw"] * 100), "away": round(pred["away"] * 100),
            "over25": round(pred["over25"] * 100), "under25": round(pred["under25"] * 100),
            "btts_yes": round(pred["btts_yes"] * 100), "btts_no": round(pred["btts_no"] * 100),
            "xg_home": pred["xg_home"], "xg_away": pred["xg_away"], "xg_total": pred["xg_total"],
        },
        "possible_outcome": possible_outcome(probs),
        "live_only": True,
    }


async def _refine_prediction(m: dict, value: dict):
    """Refine the deterministic prediction with REAL home/away goal splits and
    head-to-head, applied only on the single-match view (lazy + cached 24h)."""
    hid, aid = m.get("home_id"), m.get("away_id")
    if not (str(m.get("id", "")).startswith("live_af_") and hid and aid):
        return
    import apifootball as af
    c = af.CATALOG.get(m.get("leagueId")) or {}
    lid = c.get("league_id")
    home_mult = away_mult = 1.0
    signals = {}
    if lid:
        hstat = await af.team_statistics(hid, lid)
        astat = await af.team_statistics(aid, lid)
        if hstat and hstat.get("gf_home"):
            base_h = m["home"].get("goalsScored") or 1.2
            home_mult *= _clampf(hstat["gf_home"] / max(0.3, base_h), 0.85, 1.18)
            signals["home_home_gf"] = hstat["gf_home"]
            signals["home_clean_sheets"] = hstat.get("clean_sheets")
        if astat and astat.get("gf_away"):
            base_a = m["away"].get("goalsScored") or 1.1
            away_mult *= _clampf(astat["gf_away"] / max(0.3, base_a), 0.85, 1.18)
            signals["away_away_gf"] = astat["gf_away"]
            signals["away_clean_sheets"] = astat.get("clean_sheets")
    h2h = await af.head_to_head(hid, aid)
    if h2h and h2h.get("count"):
        edge = (h2h["home_wins"] - h2h["away_wins"]) / h2h["count"]
        home_mult *= 1 + edge * 0.08
        away_mult *= 1 - edge * 0.08
        signals["h2h"] = {"home": h2h["home_wins"], "draw": h2h["draws"], "away": h2h["away_wins"]}
    if not signals:
        return
    pred = full_prediction(m["home"], m["away"], {"home_mult": home_mult, "away_mult": away_mult})
    probs = {"home": pred["home"], "draw": pred["draw"], "away": pred["away"]}
    value["prediction"] = {
        "home": round(pred["home"] * 100), "draw": round(pred["draw"] * 100), "away": round(pred["away"] * 100),
        "over25": round(pred["over25"] * 100), "under25": round(pred["under25"] * 100),
        "btts_yes": round(pred["btts_yes"] * 100), "btts_no": round(pred["btts_no"] * 100),
        "xg_home": pred["xg_home"], "xg_away": pred["xg_away"], "xg_total": pred["xg_total"],
    }
    value["probabilities"] = {k: round(v * 100) for k, v in probs.items()}
    value["possible_outcome"] = possible_outcome(probs)
    value["signals"] = signals


@router.get("/matches/{match_id}")
async def get_match(match_id: str):
    m = await _resolve_match(match_id)
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    value = evaluate_match(m) or _prediction_only_value(m)
    try:
        await _refine_prediction(m, value)
    except Exception as e:
        logger.warning("refine_prediction(%s): %s", match_id, e)
    pm = public_match(m)
    pm["value"] = value
    return pm


@router.get("/matches/{match_id}/ai-analysis")
async def get_match_ai_analysis(match_id: str):
    """Natural-language Moka analysis (GPT-5.6 Luna), cached per match+data."""
    m = await _resolve_match(match_id)
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    value = evaluate_match(m) or _prediction_only_value(m)
    pm = public_match(m)
    import ai_analysis
    return await ai_analysis.match_analysis(pm, value)
