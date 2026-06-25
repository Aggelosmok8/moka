"""Cache abstraction layer.

`CacheBackend` is the interface; `InMemoryCacheBackend` is the stdlib default.
Swap in Redis/Memcached later behind the same interface with zero call-site
changes. TTL is role-aware: FREE caches for 5 min, PRO refreshes faster.
"""
from __future__ import annotations

import threading
import time
from abc import ABC, abstractmethod
from typing import Any, Optional

from .roles import Role
from .entitlements import FeatureGate


class CacheBackend(ABC):
    @abstractmethod
    def get(self, key: str) -> Optional[Any]: ...

    @abstractmethod
    def set(self, key: str, value: Any, ttl_seconds: int) -> None: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def clear(self) -> None: ...


class InMemoryCacheBackend(CacheBackend):
    """Process-local TTL cache. Thread-safe, stdlib only."""

    def __init__(self) -> None:
        self._store: dict = {}
        self._lock = threading.RLock()

    def get(self, key):
        with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            expires_at, value = item
            if expires_at < time.monotonic():
                self._store.pop(key, None)
                return None
            return value

    def set(self, key, value, ttl_seconds):
        with self._lock:
            self._store[key] = (time.monotonic() + max(0, ttl_seconds), value)

    def delete(self, key):
        with self._lock:
            self._store.pop(key, None)

    def clear(self):
        with self._lock:
            self._store.clear()

    def stats(self) -> dict:
        with self._lock:
            now = time.monotonic()
            live = sum(1 for exp, _ in self._store.values() if exp >= now)
            return {"entries": len(self._store), "live": live}


_default_backend = InMemoryCacheBackend()


def get_cache() -> CacheBackend:
    """Return the active cache backend (single swap point)."""
    return _default_backend


def ttl_for_role(role: Role) -> int:
    """Role-aware TTL — FREE 300s, PRO 60s."""
    return FeatureGate.refresh_seconds(role)


def role_scoped_key(role: Role, key: str) -> str:
    """Namespace cache keys by role so FREE/PRO payloads never collide."""
    return f"{role.value}:{key}"
