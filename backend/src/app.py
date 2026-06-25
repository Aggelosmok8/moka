"""Aggregates the value-engine routers into a single mountable router."""
from __future__ import annotations

from fastapi import APIRouter

from .routes.matches import router as matches_router
from .routes.value_matches import router as value_router


def make_value_router() -> APIRouter:
    root = APIRouter()
    root.include_router(value_router)   # /api/value-matches
    root.include_router(matches_router)  # /api/matches, /api/matches/{id}
    return root
