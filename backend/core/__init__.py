"""core — FREE/PRO access-control architecture (stdlib only, no external deps).

Layers (each independently swappable behind its interface):
  roles            -> user role model (FREE / PRO) + UserContext
  entitlements     -> feature gating system (FeatureGate, plan matrix, league catalog)
  cache_layer      -> cache abstraction (CacheBackend + in-memory impl, role-aware TTL)
  sports_provider  -> API service abstraction (SportsDataProvider + placeholder impl)
  subscriptions    -> subscription abstraction (SubscriptionProvider + placeholder impl)
  ai_summary       -> FREE placeholder service
  predictions      -> PRO placeholder service
  router           -> FastAPI router wiring the layers together

Nothing here imports Stripe / OpenAI / a database. Those plug in later behind
the abstract base classes without changing call sites.
"""
from .roles import Role, UserContext, role_from_user, context_from_user
from .entitlements import (
    Feature, Sport, League, FeatureGate, FeatureNotAvailable,
    LEAGUE_CATALOG, LEAGUE_MAP, PLAN_MATRIX,
)
from .cache_layer import CacheBackend, InMemoryCacheBackend, get_cache, ttl_for_role
from .cache_service import CacheService, SingleFlight, get_cache_service
from .sports_provider import SportsDataProvider, PlaceholderSportsProvider, get_sports_provider
from .subscriptions import (
    Subscription, SubscriptionProvider, PlaceholderSubscriptionProvider, get_subscription_provider,
)
from .ai_summary import AISummaryService, PlaceholderAISummaryService, get_ai_summary_service
from .predictions import PredictionsService, PlaceholderPredictionsService, get_predictions_service
from .router import make_access_router

__all__ = [
    "Role", "UserContext", "role_from_user", "context_from_user",
    "Feature", "Sport", "League", "FeatureGate", "FeatureNotAvailable",
    "LEAGUE_CATALOG", "LEAGUE_MAP", "PLAN_MATRIX",
    "CacheBackend", "InMemoryCacheBackend", "get_cache", "ttl_for_role",
    "CacheService", "SingleFlight", "get_cache_service",
    "SportsDataProvider", "PlaceholderSportsProvider", "get_sports_provider",
    "Subscription", "SubscriptionProvider", "PlaceholderSubscriptionProvider", "get_subscription_provider",
    "AISummaryService", "PlaceholderAISummaryService", "get_ai_summary_service",
    "PredictionsService", "PlaceholderPredictionsService", "get_predictions_service",
    "make_access_router",
]
