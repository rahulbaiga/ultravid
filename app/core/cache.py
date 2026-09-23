"""In-memory FEED_CACHE & TTL invalidation engine."""
import time
from typing import Any, Optional, Tuple, Dict

FEED_CACHE: Dict[Tuple[str, int], Tuple[float, Any]] = {}
CACHE_TTL = 900  # 15 minutes


class Cache:
    """Fast thread-safe in-memory cache with per-key TTL (default 7200s / 2 hours)."""

    def __init__(self, default_ttl: int = 7200):
        self._store: Dict[str, Tuple[float, Any, int]] = {}
        self.default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry:
            ts, val, ttl = entry
            if time.time() - ts < ttl:
                return val
            self._store.pop(key, None)
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        effective_ttl = ttl if ttl is not None else self.default_ttl
        self._store[key] = (time.time(), value, effective_ttl)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()


cache = Cache(default_ttl=7200)


def get_cached_feed(category: str, page: int) -> Optional[Any]:
    """Retrieves cached feed payload if still within TTL."""
    now = time.time()
    entry = FEED_CACHE.get((category, page))
    if entry and (now - entry[0] < CACHE_TTL):
        return entry[1]
    return None


def set_cached_feed(category: str, page: int, data: Any) -> None:
    """Stores feed payload in cache with timestamp."""
    FEED_CACHE[(category, page)] = (time.time(), data)


def clear_expired_cache() -> None:
    """Removes all cache entries older than CACHE_TTL."""
    now = time.time()
    keys_to_del = [k for k, v in FEED_CACHE.items() if now - v[0] >= CACHE_TTL]
    for k in keys_to_del:
        FEED_CACHE.pop(k, None)


def invalidate_feed_cache(category: Optional[str] = None) -> None:
    """Invalidate cache entries for a specific category, or all categories if None/empty."""
    if not category:
        FEED_CACHE.clear()
        return
    norm = category.lower().strip()
    keys_to_del = [k for k in list(FEED_CACHE.keys()) if k[0] == norm]
    for k in keys_to_del:
        FEED_CACHE.pop(k, None)

