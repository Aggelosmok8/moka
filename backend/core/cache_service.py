"""Centralized in-memory caching layer.

Design goals (all satisfied without Redis / per-user state):
  * Shared cache only      -> entries are keyed by TIER (free/pro), never by user.
  * No per-user polling     -> background workers refresh each tier centrally;
                               requests only ever READ warm cache.
  * Tier refresh cadence    -> FREE every 300s, PRO every 30s (from FeatureGate).
  * Request deduplication   -> SingleFlight coalesces concurrent misses into one
                               upstream computation per key.
  * Cache invalidation      -> invalidate by role, by dataset, or all.
  * Background refresh       -> one asyncio worker per tier, started at app
                               startup, cancelled at shutdown.

Built entirely on the existing abstractions: CacheBackend (cache_layer),
FeatureGate (entitlements), SportsDataProvider (sports_provider).
Swap InMemoryCacheBackend for a Redis backend later with no changes here.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional

from .roles import Role
from .entitlements import FeatureGate
from .cache_layer import CacheBackend, get_cache, ttl_for_role, role_scoped_key
from .sports_provider import SportsDataProvider, get_sports_provider

logger = logging.getLogger(__name__)

# Logical, shared datasets that are cached per tier.
DATASETS = ("leagues", "matches")
TIERS = (Role.FREE, Role.PRO)


class SingleFlight:
    """Coalesce concurrent computations for the same key (request dedup).

    Only one loader runs per key at a time; every other concurrent caller
    awaits that same in-flight result instead of triggering its own upstream
    call.
    """

    def __init__(self) -> None:
        self._inflight: Dict[str, asyncio.Future] = {}
        self._lock = asyncio.Lock()
        self.coalesced = 0  # metric: number of calls served from an in-flight load

    async def do(self, key: str, loader: Callable[[], Awaitable[Any]]) -> Any:
        async with self._lock:
            existing = self._inflight.get(key)
            if existing is not None:
                self.coalesced += 1
            else:
                existing = None
                owner_future = asyncio.get_running_loop().create_future()
                self._inflight[key] = owner_future

        if existing is not None:
            return await existing  # ride along on the in-flight computation

        # We own this computation.
        try:
            result = await loader()
            owner_future.set_result(result)
            return result
        except Exception as exc:  # propagate to ride-along callers too
            owner_future.set_exception(exc)
            raise
        finally:
            async with self._lock:
                self._inflight.pop(key, None)


class CacheService:
    """Shared, tier-scoped, in-memory cache with dedup + background refresh."""

    def __init__(self, backend: CacheBackend, provider: SportsDataProvider) -> None:
        self._cache = backend
        self._provider = provider
        self._sf = SingleFlight()
        self._meta: Dict[str, dict] = {}        # cache_key -> {updated_at, ttl, ...}
        self._workers: List[asyncio.Task] = []
        self._running = False
        # metrics
        self.hits = 0
        self.misses = 0
        self.refreshes = 0

    # ----------------------------------------------------------------- compute
    def _compute(self, role: Role, dataset: str) -> Any:
        """Build a dataset for a tier from the provider, gated by FeatureGate."""
        if dataset == "leagues":
            return [
                {"id": lg.id, "name": lg.name, "sport": lg.sport.value, "pro_only": lg.pro_only}
                for lg in FeatureGate.visible_leagues(role)
            ]
        if dataset == "matches":
            visible = {lg.id for lg in FeatureGate.visible_leagues(role)}
            matches = [m for m in self._provider.list_matches() if m["leagueId"] in visible]
            for m in matches:  # trim statistics to what the tier is entitled to
                m["homeTeam"] = FeatureGate.filter_stats(role, m.get("homeTeam"))
                m["awayTeam"] = FeatureGate.filter_stats(role, m.get("awayTeam"))
            return matches
        raise KeyError(f"Unknown dataset: {dataset}")

    # -------------------------------------------------------------------- read
    async def get_dataset(self, role: Role, dataset: str) -> Any:
        """Read warm cache; on a cold miss, compute via single-flight."""
        key = role_scoped_key(role, dataset)
        cached = self._cache.get(key)
        if cached is not None:
            self.hits += 1
            return cached
        self.misses += 1
        return await self._refresh_dataset(role, dataset)

    async def _refresh_dataset(self, role: Role, dataset: str) -> Any:
        """Recompute + store a dataset (used by both misses and workers).

        Wrapped in single-flight so a worker refresh and a user miss for the
        same key never compute twice.
        """
        key = role_scoped_key(role, dataset)

        async def loader() -> Any:
            value = self._compute(role, dataset)
            ttl = ttl_for_role(role)
            self._cache.set(key, value, ttl)
            self._meta[key] = {
                "role": role.value,
                "dataset": dataset,
                "ttl": ttl,
                "updated_at": time.time(),
            }
            self.refreshes += 1
            return value

        return await self._sf.do(key, loader)

    # -------------------------------------------------------------- invalidate
    def invalidate(self, role: Optional[Role] = None, dataset: Optional[str] = None) -> int:
        """Invalidate by role, by dataset, by both, or everything (defaults)."""
        if role is None and dataset is None:
            count = len(self._meta)
            self._cache.clear()
            self._meta.clear()
            return count

        targets = []
        for key, meta in list(self._meta.items()):
            if role is not None and meta["role"] != role.value:
                continue
            if dataset is not None and meta["dataset"] != dataset:
                continue
            targets.append(key)
        for key in targets:
            self._cache.delete(key)
            self._meta.pop(key, None)
        return len(targets)

    # ------------------------------------------------------ background workers
    async def _worker(self, role: Role) -> None:
        interval = ttl_for_role(role)
        # Warm the cache immediately so the first request is never cold.
        await self._refresh_all(role)
        while self._running:
            try:
                await asyncio.sleep(interval)
                if not self._running:
                    break
                await self._refresh_all(role)
            except asyncio.CancelledError:
                break
            except Exception as exc:  # never let a worker die silently
                logger.warning("cache worker[%s] error: %s", role.value, exc)
        logger.info("cache worker[%s] stopped", role.value)

    async def _refresh_all(self, role: Role) -> None:
        for ds in DATASETS:
            try:
                await self._refresh_dataset(role, ds)
            except Exception as exc:
                logger.warning("refresh %s/%s failed: %s", role.value, ds, exc)

    def start(self) -> None:
        """Start one background refresh worker per tier (idempotent)."""
        if self._running:
            return
        self._running = True
        for role in TIERS:
            self._workers.append(asyncio.create_task(self._worker(role)))
        logger.info("CacheService started %d tier workers", len(self._workers))

    async def stop(self) -> None:
        self._running = False
        for task in self._workers:
            task.cancel()
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()

    # ------------------------------------------------------------------ status
    def status(self) -> dict:
        now = time.time()
        backend_stats = self._cache.stats() if hasattr(self._cache, "stats") else {}
        return {
            "running": self._running,
            "workers": len(self._workers),
            "tier_intervals": {r.value: ttl_for_role(r) for r in TIERS},
            "metrics": {
                "hits": self.hits,
                "misses": self.misses,
                "refreshes": self.refreshes,
                "coalesced": self._sf.coalesced,
            },
            "backend": backend_stats,
            "datasets": {
                key: {
                    "ttl": meta["ttl"],
                    "age_seconds": round(now - meta["updated_at"], 1),
                }
                for key, meta in self._meta.items()
            },
        }


# Single shared instance (the one swap point).
_default_service = CacheService(get_cache(), get_sports_provider())


def get_cache_service() -> CacheService:
    return _default_service
