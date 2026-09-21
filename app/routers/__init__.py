"""Routers module initialization and exports."""
from app.routers import health, feed, search, stream, details, download

__all__ = [
    "health",
    "feed",
    "search",
    "stream",
    "details",
    "download",
]
