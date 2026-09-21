"""Core configuration, settings, and cache utilities."""
from app.core.config import (
    APP_TITLE,
    APP_VERSION,
    DEFAULT_FEED_LIMIT,
    CACHE_TTL_SECONDS,
    STREAM_TIMEOUT,
    BASE_DIR,
    STATIC_DIR,
    DOWNLOAD_DIR,
)
from app.core.cache import get_cached_feed, set_cached_feed, clear_expired_cache, FEED_CACHE, CACHE_TTL

__all__ = [
    "APP_TITLE",
    "APP_VERSION",
    "DEFAULT_FEED_LIMIT",
    "CACHE_TTL_SECONDS",
    "STREAM_TIMEOUT",
    "BASE_DIR",
    "STATIC_DIR",
    "DOWNLOAD_DIR",
    "get_cached_feed",
    "set_cached_feed",
    "clear_expired_cache",
    "FEED_CACHE",
    "CACHE_TTL",
]
