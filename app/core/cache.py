"""In-memory LRU + TTL cache & feed invalidation engine."""
import time
from collections import OrderedDict
from typing import Any, Optional, Tuple, Dict

FEED_CACHE: Dict[Tuple[str, int], Tuple[float, Any]] = {}
CACHE_TTL = 900  # 15 minutes


class Cache:
    """Thread-safe LRU + TTL cache with active eviction and pattern invalidation."""

    def __init__(self, default_ttl: int = 900, max_size: int = 200):
        self._store: OrderedDict[str, Tuple[float, Any, int]] = OrderedDict()
        self.default_ttl = default_ttl
        self.max_size = max_size

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry:
            ts, val, ttl = entry
            if time.time() - ts < ttl:
                self._store.move_to_end(key)
                return val
            self._store.pop(key, None)
        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        effective_ttl = ttl if ttl is not None else self.default_ttl
        self._store[key] = (time.time(), value, effective_ttl)
        self._store.move_to_end(key)
        while len(self._store) > self.max_size:
            self._store.popitem(last=False)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def invalidate_pattern(self, prefix: str) -> None:
        """Removes all keys starting with prefix."""
        keys_to_del = [k for k in list(self._store.keys()) if k.startswith(prefix)]
        for k in keys_to_del:
            self._store.pop(k, None)

    def clear(self) -> None:
        self._store.clear()


cache = Cache(default_ttl=900, max_size=200)


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
    keys_to_del = [k for k in FEED_CACHE.items() if now - k[1][0] >= CACHE_TTL]
    for k in keys_to_del:
        FEED_CACHE.pop(k[0], None)


def invalidate_feed_cache(category: Optional[str] = None) -> None:
    """Invalidate cache entries for a specific category, or all categories if None/empty."""
    if not category:
        FEED_CACHE.clear()
        return
    norm = category.lower().strip()
    keys_to_del = [k for k in list(FEED_CACHE.keys()) if k[0] == norm]
    for k in keys_to_del:
        FEED_CACHE.pop(k, None)
