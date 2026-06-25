from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import db
from routes import auth_routes, subscription_routes, sports_routes, chart_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="StatLine API")

health_router = APIRouter(prefix="/api")


@health_router.get("/")
async def root():
    return {"message": "StatLine API", "status": "ok"}


app.include_router(health_router)
app.include_router(auth_routes.router)
app.include_router(subscription_routes.router)
app.include_router(sports_routes.router)
app.include_router(chart_routes.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.tracked_matches.create_index([("user_id", 1), ("match_id", 1)])
    logger.info("StatLine API started")


@app.on_event("shutdown")
async def shutdown():
    from db import client
    client.close()
