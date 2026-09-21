"""Configuration settings and environment constants for UltraVid."""
import os

APP_TITLE = "UltraVid"
APP_VERSION = "4.0.0"
DEFAULT_FEED_LIMIT = 12
CACHE_TTL_SECONDS = 900  # 15 minutes
STREAM_TIMEOUT = 18.0

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(DOWNLOAD_DIR, exist_ok=True)
