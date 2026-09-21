"""Video extraction, yt-dlp stream extraction, format parsing, and 403 bypass service."""
import asyncio
from typing import Dict, Any, List, Optional
from app import extractor
from app.innertube import extract_video_id, fast_player, fast_player_sync


def is_youtube_url(s: str) -> bool:
    return extractor.is_youtube_url(s)


def is_url(s: str) -> bool:
    return extractor.is_url(s)


def extract(url_or_kw: str) -> Dict[str, Any]:
    return extractor.extract(url_or_kw)


def search(query: str, max_results: int = 15) -> Dict[str, Any]:
    return extractor.search(query, max_results)


async def get_stream_info(video_id_or_url: str) -> Dict[str, Any]:
    """Resolves stream metadata, progressive formats, and playable stream URLs."""
    s = (video_id_or_url or "").strip()
    if not is_url(s):
        # Raw video ID passed
        vid = extract_video_id(s) or s
        try:
            turbo = await fast_player(vid)
            if turbo and turbo.get("default_play_url"):
                return turbo
        except Exception:
            pass
        s = f"https://www.youtube.com/watch?v={vid}"

    # YouTube turbo fast-path
    vid = extract_video_id(s)
    if vid and is_youtube_url(s):
        try:
            turbo = await fast_player(vid)
            if turbo and turbo.get("default_play_url"):
                return turbo
        except Exception:
            pass

    # Threaded extraction fallback
    data = await asyncio.to_thread(extractor.extract, s)
    return data


async def extract_direct_streams(video_id_or_url: str) -> Dict[str, Any]:
    """Extracts direct stream URLs with fallback bypass."""
    return await get_stream_info(video_id_or_url)
