from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from pydantic import BaseModel
from typing import Optional
import json

from database import Database, init_db
from football_service_layer import (
    fsl_get_matches, fsl_get_match_detail, fsl_get_teams,
    get_bookmaker_links, fsl_cache_clear, fsl_cache_meta,
    generate_match_insight, _compute_value_score, _mock_matches,
)
from auth import make_auth_router
from billing import make_billing_router, make_webhook_router
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
billing_router = make_billing_router(db, current_user, current_user_optional)
webhook_router = make_webhook_router(db)
alerts_router = make_alerts_router(db, current_user, current_user_optional)
analytics_router = make_analytics_router(db, current_user_optional)
access_router = make_access_router(current_user_optional)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "moka-backend"}


@api_router.get("/")
async def root():
    return {"message": "Moka AI Sports Advisory API", "status": "ok"}


@api_router.get("/status")
async def status():
    return {"status": "ok", "fsl_cache": fsl_cache_meta()}


@api_router.get("/leagues")
async def list_leagues():
    return {"leagues": LEAGUES}


@api_router.get("/teams")
async def list_teams(league: Optional[str] = None, limit: Optional[int] = None):
    try:
        teams = await fsl_get_teams(league)
        return {"teams": teams[:limit] if limit else teams}
    except Exception as e:
        logger.warning("list_teams: %s", e)
        return {"teams": []}


@api_router.get("/teams/top")
async def top_teams(limit: int = 10):
    try:
        teams = await fsl_get_teams()
        return {"teams": teams[:limit]}
    except Exception as e:
        logger.warning("top_teams: %s", e)
        return {"teams": []}


@api_router.get("/teams/{team_id}")
async def team_detail(team_id: str):
    try:
        for t in await fsl_get_teams():
            if t.get("id") == team_id:
                return t
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="Team not found")


_POS = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "ST", "LW", "GK", "CB", "CM", "SUB", "SUB"]
_NAT = ["England", "Spain", "France", "Brazil", "Germany", "Italy", "Portugal", "Argentina", "Netherlands", "Belgium"]


@api_router.get("/teams/{team_id}/players")
async def team_players(team_id: str):
    """Squad roster for a team. NOTE: returns a structured sample roster
    (source="sample") because the live stats provider (API-Football) key is
    currently suspended. Wire the key to return real player data here."""
    team = None
    try:
        for t in await fsl_get_teams():
            if t.get("id") == team_id:
                team = t
                break
    except Exception:
        pass
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    import hashlib
    base = int(hashlib.md5(team_id.encode()).hexdigest(), 16)
    short = team.get("short", "PL")
    players = []
    for i, pos in enumerate(_POS):
        h = (base >> (i % 12)) % 1000 + i * 7
        apps = 8 + h % 22
        attacking = pos in ("ST", "RW", "LW", "CAM")
        players.append({
            "id": f"{team_id}_p{i + 1}",
            "name": f"{short} Player {i + 1}",
            "number": i + 1,
            "position": pos,
            "age": 19 + h % 17,
            "nationality": _NAT[h % len(_NAT)],
            "appearances": apps,
            "minutes": apps * (40 + h % 50),
            "goals": (h % 12) if attacking else h % 3,
            "assists": h % 7,
            "shots": h % 45,
            "passes": 200 + h % 1400,
            "tackles": h % 70,
            "yellow": h % 6,
            "red": 1 if h % 23 == 0 else 0,
            "rating": round(6.2 + (h % 18) / 10, 1),
            "injured": h % 17 == 0,
            "photo": None,
        })
    return {"team_id": team_id, "team": team.get("name"), "source": "sample", "players": players}


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
async def refresh_cache(scope: str = "all"):
    fsl_cache_clear()
    r = await fsl_get_matches(force_refresh=True)
    return {"scope": scope, "source": r["source"], "matches": r["totalCount"]}


@api_router.get("/fsl/status")
async def fsl_status():
    return {"cache": fsl_cache_meta(), "status": "ok"}


@api_router.post("/fsl/refresh")
async def fsl_refresh():
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
    import re
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
    logger.info("Moka Advisory API started")


@app.on_event("shutdown")
async def on_shutdown():
    await get_cache_service().stop()
