"""In-memory FEED_CACHE & TTL invalidation engine."""
import time
from typing import Any, Optional, Tuple, Dict

FEED_CACHE: Dict[Tuple[str, int], Tuple[float, Any]] = {}
CACHE_TTL = 900  # 15 minutes


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
