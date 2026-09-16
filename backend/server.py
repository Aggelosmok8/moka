from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
import os
import re
import time as _time
import asyncio
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from pydantic import BaseModel
from typing import Optional
from urllib.parse import unquote
import json

from database import Database, init_db
from football_service_layer import (
    fsl_get_matches, fsl_get_match_detail, fsl_get_teams,
    get_bookmaker_links, fsl_cache_clear, fsl_cache_meta,
    generate_match_insight, _compute_value_score, _mock_matches,
)
from auth import make_auth_router
from billing import make_billing_router, make_webhook_router, cancel_user_subscription
from retention import make_alerts_router, start_digest_scheduler
from analytics import make_analytics_router
from mock_data import LEAGUES
from core import make_access_router, get_cache_service
from src.app import make_value_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

app = FastAPI(title="Moka AI Sports Advisory API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

db = Database()

auth_router = make_auth_router(db)
current_user = auth_router.current_user
current_user_optional = auth_router.current_user_optional
require_admin = auth_router.require_admin
billing_router = make_billing_router(db, current_user, current_user_optional)
webhook_router = make_webhook_router(db)
alerts_router = make_alerts_router(db, current_user, current_user_optional)
analytics_router = make_analytics_router(db, current_user_optional)
access_router = make_access_router(current_user_optional)


@app.get("/ping")
async def ping():
    """Ultra-light keep-alive target for an EXTERNAL uptime pinger (cron-job.org /
    UptimeRobot / Render Cron). Does NO DB / API / prediction work — it only keeps
    a warm Render instance from idling. It cannot wake an already-sleeping free
    instance; that needs an external scheduler hitting this on a ~10-14min cadence."""
    return {"ok": True}


@app.get("/health")
async def health_check():
    """Reliability health check that actually tests dependencies (#9).

    Returns 200 {status:ok} when the database responds, else 503 {status:degraded}.
    """
    ts = datetime.now(timezone.utc).isoformat()
    database = "ok"
    try:
        await db.users.find_one({})  # lightweight DB ping
    except Exception as e:
        logger.error("[%s] health: database check failed: %s", ts, e)
        database = "error"
    cache_entries = 0
    for mod in ("apifootball", "live_values"):
        try:
            import importlib
            cache_entries += len(getattr(importlib.import_module(mod), "_cache", {}) or {})
        except Exception:
            pass
    body = {
        "status": "ok" if database == "ok" else "degraded",
        "database": database,
        "cache_entries": cache_entries,
        "external_apis": "unknown",
    }
    if database != "ok":
        return JSONResponse(status_code=503, content=body)
    return body


@api_router.get("/")
async def root():
    return {"message": "Moka AI Sports Advisory API", "status": "ok"}


@api_router.get("/status")
async def status():
    live = False
    last = None
    try:
        import live_values
        matches = await live_values.build_live_matches()
        live = bool(matches)
        if live:
            last = datetime.now(timezone.utc).isoformat()
    except Exception as e:
        logger.warning("status live check: %s", e)
    return {
        "status": "ok",
        "fsl_cache": fsl_cache_meta(),
        "live": live,
        "api_football_key_configured": live,  # drives the header Live/Mock pill
        "api_football_usage": _af_usage(),
        "cache_meta": {"live_values": last} if last else {},
    }


def _af_usage():
    try:
        import apifootball as af
        return af.usage()
    except Exception:
        return {}


@api_router.get("/debug/apifootball")
async def debug_apifootball(admin=Depends(require_admin)):
    """Read-only diagnostic: confirms whether API-Football works on THIS server
    (used to debug why the deployed backend falls back to mock/sample data).
    Admin-only — it exposes partial key info and provider quota."""
    import apifootball as af
    import httpx
    key = af._key()
    out = {
        "key_present": bool(key),
        "key_tail": key[-4:] if key else None,
        "football_season": af.FOOTBALL_SEASON,
        "usage": af.usage(),
    }
    try:
        async with httpx.AsyncClient(timeout=20, headers={"x-apisports-key": key}) as c:
            r = await c.get(f"{af.FOOTBALL_BASE}/status")
        out["http_status"] = r.status_code
        j = r.json()
        out["errors"] = j.get("errors")
        resp = j.get("response") or {}
        sub = resp.get("subscription") or {}
        req = resp.get("requests") or {}
        out["plan"] = sub.get("plan")
        out["active"] = sub.get("active")
        out["requests_today"] = req.get("current")
        out["limit_day"] = req.get("limit_day")
    except Exception as e:
        out["exception"] = f"{type(e).__name__}: {e}"
    return out


@api_router.get("/leagues")
async def list_leagues():
    import apifootball as af
    return {"leagues": af.leagues_list()}


@api_router.get("/leagues/{slug}")
async def league_detail(slug: str):
    """Standings + upcoming fixtures + recent results for a catalog league."""
    import apifootball as af
    c = af.CATALOG.get(slug)
    if not c:
        raise HTTPException(status_code=404, detail="League not found")
    standings, fixtures = [], {"upcoming": [], "results": []}
    try:
        standings = await af.teams_for_league(slug)
        fixtures = await af.fixtures_for_league(slug)
    except Exception as e:
        logger.warning("league_detail(%s): %s", slug, e)
    return {
        "slug": slug,
        "name": c["name"],
        "sport": c["sport"],
        "standings": standings,
        "upcoming": fixtures.get("upcoming", []),
        "results": fixtures.get("results", []),
    }


@api_router.get("/me/portfolio")
async def get_portfolio(user=Depends(current_user)):
    doc = await db.user_portfolios.find_one({"user_id": user.user_id})
    data = (doc or {}).get("data") or {}
    return {"bets": data.get("bets", []), "tickets": data.get("tickets", [])}


@api_router.put("/me/portfolio")
async def put_portfolio(payload: dict, user=Depends(current_user)):
    data = {"bets": payload.get("bets", []), "tickets": payload.get("tickets", [])}
    now = datetime.now(timezone.utc).isoformat()
    existing = await db.user_portfolios.find_one({"user_id": user.user_id})
    if existing:
        await db.user_portfolios.update_one({"user_id": user.user_id}, {"$set": {"data": data, "updated_at": now}})
    else:
        await db.user_portfolios.insert_one({"user_id": user.user_id, "data": data, "updated_at": now})
    return {"ok": True}


@api_router.get("/privacy/data-export")
async def data_export(user=Depends(current_user)):
    """GDPR right-to-access: return everything stored for the authenticated user."""
    uid = user.user_id
    doc = await db.users.find_one({"user_id": uid}, {"_id": 0}) or {}
    # Never expose session tokens; only a count.
    sessions_count = 0
    async for _ in await db.user_sessions.find({"user_id": uid}):
        sessions_count += 1
    analysis_usage = []
    async for r in await db.analysis_usage.find({"user_id": uid}):
        r.pop("_id", None)
        analysis_usage.append(r)
    alerts = []
    async for r in await db.goal_alert_subs.find({"user_id": uid}):
        r.pop("_id", None)
        alerts.append(r)
    pf = await db.user_portfolios.find_one({"user_id": uid}, {"_id": 0})
    return {
        "user": {
            "user_id": uid, "email": doc.get("email"), "name": doc.get("name"),
            "picture": doc.get("picture"), "plan": doc.get("plan"),
            "created_at": doc.get("created_at"), "last_login_at": doc.get("last_login_at"),
            "trial_start_date": doc.get("trial_start_date"), "trial_end_date": doc.get("trial_end_date"),
        },
        "subscription": {
            "status": doc.get("subscription_status"),
            "pro_until": doc.get("pro_until"),
            "plan": doc.get("plan"),
            "stripe_subscription_id": doc.get("stripe_subscription_id"),
            "cancel_at_period_end": doc.get("subscription_cancel_at_period_end", False),
        },
        "sessions_count": sessions_count,
        "analysis_usage": analysis_usage,
        "goal_alerts": alerts,
        "portfolio": (pf or {}).get("data") or {},
    }


@api_router.post("/auth/delete-account")
async def delete_account(user=Depends(current_user)):
    """GDPR right-to-erasure: cancel any active Stripe subscription, then delete
    the user and all their data. Idempotent-safe."""
    uid = user.user_id
    # 1) Cancel Stripe subscription first (best-effort, never blocks deletion).
    try:
        await cancel_user_subscription(db, uid)
    except Exception as e:
        logger.warning("delete-account: sub cancel failed for %s: %s", uid, e)
    # 2) Erase all user-linked rows.
    await db.user_sessions.delete_many({"user_id": uid})
    await db.analysis_usage.delete_many({"user_id": uid})
    await db.goal_alert_subs.delete_many({"user_id": uid})
    await db.digest_log.delete_many({"user_id": uid})
    await db.user_portfolios.delete_many({"user_id": uid})
    await db.payment_transactions.delete_many({"user_id": uid})
    await db.events.delete_many({"user_id": uid})
    await db.users.delete_many({"user_id": uid})
    logger.info("[%s] account deleted (GDPR): %s", datetime.now(timezone.utc).isoformat(), uid)
    return {"deleted": True}


@api_router.post("/compare/ai")
async def compare_ai(payload: dict):
    """Short AI verdict for a Compare (players or teams) card.

    The numbers come from the frontend (already fetched from our own stats
    endpoints); the model only narrates strengths/weaknesses. Cached by payload
    hash so repeated comparisons cost nothing."""
    import hashlib, json as _json
    import apifootball as af
    kind = "players" if str(payload.get("kind")) == "players" else "teams"
    lang = "el" if str(payload.get("lang", "en")).lower() == "el" else "en"
    a, b = payload.get("a") or {}, payload.get("b") or {}
    if not a or not b:
        raise HTTPException(status_code=400, detail="Both sides are required")
    raw = _json.dumps({"kind": kind, "a": a, "b": b}, sort_keys=True, ensure_ascii=False)
    ck = f"compare_ai_{lang}_{hashlib.sha1(raw.encode()).hexdigest()[:14]}"
    cached = af._c_get(ck)
    if cached is not None:
        return {"text": cached, "cached": True}
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"text": None, "error": "no_key"}
    system = (
        f"You are LION, a football analyst. You receive statistics for TWO {kind} and "
        "write a comparison of 70-110 words in plain English.\n"
        "RULES:\n"
        "- Use ONLY the numbers provided; never invent stats, injuries or transfers.\n"
        "- For EACH side state one or two clear strengths AND one or two weaknesses, "
        "based strictly on the numbers.\n"
        "- Finish with one hedged sentence on who the data favours and in what role/context.\n"
        "- No headers, no bullet points, no jargon. Plain flowing text."
    )
    if lang == "el":
        system += ("\n- Write the ENTIRE text in natural, fluent Greek (Ελληνικά). "
                   "Keep team names, player names and numbers as-is.")
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key)
        resp = await client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-5.6-luna"),
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": f"Data (JSON):\n{raw}"}],
        )
        text = (resp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.warning("compare_ai failed: %s", e)
        return {"text": None, "error": True}
    if text:
        af._c_set(ck, text, ttl=24 * 3600)
    return {"text": text or None, "cached": False}


@api_router.get("/teams")
async def list_teams(league: Optional[str] = None, limit: Optional[int] = None):
    try:
        import apifootball as af
        teams = await af.teams_for_league(league) if league in af.CATALOG else []
        return {"teams": teams[:limit] if limit else teams}
    except Exception as e:
        logger.warning("list_teams: %s", e)
        return {"teams": []}


@api_router.get("/teams/top")
async def top_teams(limit: int = 10):
    try:
        import apifootball as af
        teams = await af.teams_for_league("epl")
        return {"teams": teams[:limit]}
    except Exception as e:
        logger.warning("top_teams: %s", e)
        return {"teams": []}


@api_router.get("/teams/{team_id}")
async def team_detail(team_id: str):
    try:
        import apifootball as af
        # Mock ids are 'm_<slug>_<i>' — resolve the league directly to avoid
        # scanning every league (which would burn live API quota).
        slugs = list(af.CATALOG)
        if team_id.startswith("m_"):
            parts = team_id.split("_")
            if len(parts) >= 3 and parts[1] in af.CATALOG:
                slugs = [parts[1]]
        for slug in slugs:
            for t in await af.teams_for_league(slug):
                if t.get("id") == team_id:
                    return t
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="Team not found")


@api_router.get("/teams/{team_id}/players")
async def team_players(team_id: str):
    """Real squad roster from API-Football (season 2024), or mock fallback."""
    try:
        import apifootball as af
        players = await af.players_for_team(team_id)
        source = "mock" if team_id.startswith("m_") else "live"
        return {"team_id": team_id, "source": source, "players": players}
    except Exception as e:
        logger.warning("team_players: %s", e)
    raise HTTPException(status_code=404, detail="Team not found")


@api_router.get("/players/{player_id}")
async def player_detail(player_id: str, season: Optional[int] = None, team: Optional[str] = None):
    """Real per-player stats (lazy). If `team` is passed, only that club's
    stats are returned (national-team caps excluded)."""
    import apifootball as af
    if not player_id.isdigit():
        raise HTTPException(status_code=404, detail="Player stats not available")
    data = await af.player_stats(player_id, season, team)
    if not data:
        raise HTTPException(status_code=404, detail="Player stats not available")
    return data


@api_router.get("/matches/trending")
async def trending_matches():
    try:
        r = await fsl_get_matches()
        return {"matches": r["matches"], "source": r["source"], "meta": {
            "liveCount": r["liveCount"], "totalCount": r["totalCount"],
            "highValue": r["highValue"], "fetchedAt": r["fetchedAt"],
        }}
    except Exception as e:
        logger.warning("trending_matches: %s", e)
        return {"matches": _mock_matches(), "source": "mock", "meta": {}}


@api_router.get("/matches/{match_id}")
async def match_detail(match_id: str):
    try:
        m = await fsl_get_match_detail(match_id)
        if m:
            return m
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="Match not found")


@api_router.get("/matches/{match_id}/odds")
async def match_odds(match_id: str, user=Depends(current_user_optional)):
    try:
        m = await fsl_get_match_detail(match_id)
    except Exception:
        m = None
    is_pro = bool(user and user.is_pro)
    return {
        "match_id":    match_id,
        "league":      (m or {}).get("leagueName", ""),
        "home":        (m or {}).get("home", {}).get("name", ""),
        "away":        (m or {}).get("away", {}).get("name", ""),
        "predicted":   (m or {}).get("predictedStrength"),
        "is_pro":      is_pro,
        "bookmakers":  get_bookmaker_links(match_id),
        "valueSignal": (m or {}).get("valueSignal"),
        "confidence":  (m or {}).get("confidence"),
        "aiSummary":   (m or {}).get("aiSummary"),
        "event_found": True,
        "note":        "Affiliate links only — no real-time odds fetched.",
    }


@api_router.post("/admin/refresh")
async def refresh_cache(scope: str = "all", admin=Depends(require_admin)):
    fsl_cache_clear()
    r = await fsl_get_matches(force_refresh=True)
    return {"scope": scope, "source": r["source"], "matches": r["totalCount"]}


@api_router.get("/fsl/status")
async def fsl_status():
    return {"cache": fsl_cache_meta(), "status": "ok"}


@api_router.post("/fsl/refresh")
async def fsl_refresh(admin=Depends(require_admin)):
    fsl_cache_clear()
    r = await fsl_get_matches(force_refresh=True)
    return {"cleared": True, "source": r["source"], "matches": r["totalCount"]}


@api_router.get("/fsl/insights/{match_id}")
async def fsl_insights(match_id: str, user=Depends(current_user_optional)):
    try:
        m = await fsl_get_match_detail(match_id)
        if not m:
            raise HTTPException(status_code=404, detail="Match not found")
        is_pro = bool(user and user.is_pro)
        insight = generate_match_insight(m)
        value   = _compute_value_score(m.get("homeTeam", {}), m.get("awayTeam", {}))
        base = {**insight, **value, "bookmakers": get_bookmaker_links(match_id)}
        if not is_pro:
            base["aiBullets"] = base["aiBullets"][:2]
            base["xgHome"] = None
            base["xgAway"] = None
        return base
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("fsl_insights: %s", e)
        return {"aiSummary": "Data temporarily unavailable.", "aiBullets": [], "bookmakers": get_bookmaker_links(match_id)}


class TeamScout(BaseModel):
    strengths: list[str] = []
    weaknesses: list[str] = []


class StructuredAnalysis(BaseModel):
    insight: str = ""
    home: TeamScout = TeamScout()
    away: TeamScout = TeamScout()
    attacking: str = ""
    defensive: str = ""
    prediction: str = ""


class AnalysisResponse(BaseModel):
    analysis: str
    structured: Optional[StructuredAnalysis] = None
    cached: bool


def _fallback_structured(match: dict) -> StructuredAnalysis:
    h = match.get("homeTeam", {})
    a = match.get("awayTeam", {})
    h_name = h.get("name") or match.get("home", {}).get("name", "Home")
    a_name = a.get("name") or match.get("away", {}).get("name", "Away")
    h_form = h.get("form", [])
    a_form = a.get("form", [])
    pred   = match.get("predictedStrength", {"home": 45, "draw": 25, "away": 30})
    favorite = h_name if h_form.count("W") >= a_form.count("W") else a_name
    return StructuredAnalysis(
        insight=f"{h_name} predicted {pred.get('home',45)}% vs {pred.get('away',30)}% away.",
        home=TeamScout(
            strengths=[
                f"Scoring {h.get('goalsPerGame',1.2):.2f} goals per game",
                f"Form: {''.join(h_form[-5:]) or 'N/A'}",
            ],
            weaknesses=[f"Conceding {h.get('concededPerGame',1.1):.2f} per game"],
        ),
        away=TeamScout(
            strengths=[
                f"Scoring {a.get('goalsPerGame',1.0):.2f} goals per game",
                f"Form: {''.join(a_form[-5:]) or 'N/A'}",
            ],
            weaknesses=[f"Conceding {a.get('concededPerGame',1.2):.2f} per game"],
        ),
        attacking=f"{h_name} avg {h.get('goalsPerGame',1.2):.2f} GPG. {a_name} avg {a.get('goalsPerGame',1.0):.2f} GPG.",
        defensive=f"BTTS: {h.get('btts',45)}% (home) vs {a.get('btts',45)}% (away).",
        prediction=f"Edge to {favorite} based on form.",
    )


def _parse_structured(raw: str) -> Optional[StructuredAnalysis]:
    if not raw:
        return None
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    candidate = m.group(1) if m else None
    if not candidate:
        m2 = re.search(r"\{.*\}", raw, re.DOTALL)
        candidate = m2.group(0) if m2 else None
    if not candidate:
        return None
    try:
        return StructuredAnalysis(**json.loads(candidate))
    except Exception:
        return None


def _structured_to_text(s: StructuredAnalysis, hn: str, an: str) -> str:
    return " ".join(filter(None, [
        s.insight,
        f"{hn} strengths: {'; '.join(s.home.strengths)}." if s.home.strengths else "",
        f"{hn} weaknesses: {'; '.join(s.home.weaknesses)}." if s.home.weaknesses else "",
        f"{an} strengths: {'; '.join(s.away.strengths)}." if s.away.strengths else "",
        f"{an} weaknesses: {'; '.join(s.away.weaknesses)}." if s.away.weaknesses else "",
        s.attacking, s.defensive, s.prediction,
    ]))


@api_router.post("/matches/{match_id}/analysis", response_model=AnalysisResponse)
async def generate_analysis(match_id: str, regenerate: bool = False, user=Depends(current_user_optional)):
    if regenerate and not (user and user.is_pro):
        raise HTTPException(status_code=402, detail="Pro required for regenerate")

    match = await fsl_get_match_detail(match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    is_pro = bool(user and user.is_pro)
    cached_doc = await db.match_analyses.find_one({"match_id": match_id})
    if not regenerate and cached_doc and cached_doc.get("structured"):
        try:
            sd = cached_doc["structured"]
            if isinstance(sd, str):
                sd = json.loads(sd)
            return AnalysisResponse(analysis=cached_doc["analysis"], structured=StructuredAnalysis(**sd), cached=True)
        except Exception:
            pass

    if not is_pro:
        if not user:
            raise HTTPException(status_code=401, detail="Sign in to generate AI analysis")
        today = datetime.now(timezone.utc).date().isoformat()
        existing = await db.analysis_usage.find_one({"user_id": user.user_id, "match_id": match_id, "day": today})
        if existing and existing.get("count", 0) >= 1:
            raise HTTPException(status_code=429, detail="Free tier: 1 analysis per fixture per day. Upgrade to Pro.")

    structured = None
    if EMERGENT_LLM_KEY:
        try:
            import httpx
            h = match.get("homeTeam", {})
            a = match.get("awayTeam", {})
            h_name = h.get("name") or match.get("home", {}).get("name", "Home")
            a_name = a.get("name") or match.get("away", {}).get("name", "Away")
            prompt = (
                f'Analyze {h_name} vs {a_name} ({match.get("leagueName","")}).\n'
                f'{h_name}: form {"".join(h.get("form",[]))}, GPG {h.get("goalsPerGame",1.2):.2f}.\n'
                f'{a_name}: form {"".join(a.get("form",[]))}, GPG {a.get("goalsPerGame",1.0):.2f}.\n'
                'Return ONLY JSON: {"insight":"...","home":{"strengths":["..."],"weaknesses":["..."]},'
                '"away":{"strengths":["..."],"weaknesses":["..."]},"attacking":"...","defensive":"...","prediction":"..."}'
            )
            async with httpx.AsyncClient(timeout=60.0) as c:
                r = await c.post("https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": EMERGENT_LLM_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": "claude-sonnet-4-5-20250929", "max_tokens": 1024,
                          "system": "Football analyst. Output strict JSON only.",
                          "messages": [{"role": "user", "content": prompt}]})
                r.raise_for_status()
                structured = _parse_structured(r.json()["content"][0]["text"])
        except Exception as exc:
            logger.warning("LLM failed, using heuristic: %s", exc)

    if structured is None:
        structured = _fallback_structured(match)

    h_name = match.get("homeTeam", {}).get("name") or match.get("home", {}).get("name", "Home")
    a_name = match.get("awayTeam", {}).get("name") or match.get("away", {}).get("name", "Away")
    analysis_text = _structured_to_text(structured, h_name, a_name)
    now = datetime.now(timezone.utc).isoformat()

    await db.match_analyses.update_one({"match_id": match_id},
        {"$set": {"match_id": match_id, "analysis": analysis_text,
                  "structured": json.dumps(structured.model_dump()), "updated_at": now}}, upsert=True)

    if user and not is_pro:
        today = datetime.now(timezone.utc).date().isoformat()
        await db.analysis_usage.update_one(
            {"user_id": user.user_id, "match_id": match_id, "day": today},
            {"$inc": {"count": 1}, "$setOnInsert": {"created_at": now}}, upsert=True)

    return AnalysisResponse(analysis=analysis_text, structured=structured, cached=False)


app.include_router(make_value_router())  # Value Betting Intelligence Engine (canonical matches + value)
app.include_router(api_router)
app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(webhook_router)
app.include_router(alerts_router)
app.include_router(analytics_router)
app.include_router(access_router)

# ── Security middleware: rate limiting + input sanitization ───────────────────
# In-memory sliding-window limiter (no Redis): max 60 requests / minute / IP.
_RL_WINDOW = 60
_RL_MAX = 60
_rl_hits: dict = defaultdict(list)
# Exempt uptime checks and the Stripe webhook (signed, may burst) from limiting.
_RL_EXEMPT = ("/health", "/ping", "/api/webhook/stripe")

# Reject requests whose params carry classic SQL-injection tokens. The DB layer
# already uses parameterized queries, so this is defense-in-depth, kept narrow to
# avoid false positives on legitimate text (team names, Greek characters, etc.).
_SQLI_RE = re.compile(
    r"(?i)(\bunion\s+select\b|\bdrop\s+table\b|\binsert\s+into\b|\bdelete\s+from\b"
    r"|\bupdate\s+.+\bset\b|--|/\*|\*/|\bor\s+1\s*=\s*1\b|'\s*or\s*'1'\s*=\s*'1)"
)
_MAX_BODY = 256 * 1024  # 256KB — generous for our JSON payloads; blocks oversized


def _client_ip(request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or any(path.startswith(p) for p in _RL_EXEMPT):
        return await call_next(request)
    ip = _client_ip(request)
    now = _time.time()
    cutoff = now - _RL_WINDOW
    hits = _rl_hits[ip]
    while hits and hits[0] < cutoff:
        hits.pop(0)
    if len(hits) >= _RL_MAX:
        return JSONResponse(status_code=429, content={"detail": "Too many requests"})
    hits.append(now)
    return await call_next(request)


@app.middleware("http")
async def sanitize_middleware(request, call_next):
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > _MAX_BODY:
        return JSONResponse(status_code=413, content={"detail": "Payload too large"})
    qs = request.url.query or ""
    if qs and _SQLI_RE.search(unquote(qs)):
        return JSONResponse(status_code=400, content={"detail": "Invalid request parameters"})
    return await call_next(request)


# ── CORS: wildcard origin, no credentials ─────────────────────────────────────
# Auth uses Bearer tokens (Authorization header), NOT cookies.
# This allows ANY Vercel preview URL without needing to update CORS_ORIGINS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await init_db()
    get_cache_service().start()  # launch shared, tier-based background refresh workers
    # Pre-warm live value cache (non-blocking) so the first visitor after a cold
    # start / Render spin-up doesn't wait on the Odds API + SportMonks build.
    async def _prewarm():
        try:
            import live_values
            await live_values.build_live_matches()
            logger.info("Live value cache pre-warmed")
        except Exception as e:
            logger.warning("live prewarm failed: %s", e)
    asyncio.create_task(_prewarm())
    logger.info("Moka Advisory API started")


@app.on_event("shutdown")
async def on_shutdown():
    await get_cache_service().stop()
