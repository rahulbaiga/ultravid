"""Search and auto-suggest query router."""
import asyncio
import logging
from fastapi import APIRouter, HTTPException, Query

from app.models.feed import SearchResponse
from app.services import extractor
from app.services.innertube import fast_search, fast_suggest

logger = logging.getLogger("ultravid.search")
router = APIRouter(tags=["Search"])


@router.get("/suggest")
async def api_suggest(q: str = Query("", max_length=100)):
    q = q.strip()
    if not q:
        return {"query": "", "suggestions": []}
    try:
        suggs = await fast_suggest(q)
        return {"query": q, "suggestions": suggs}
    except Exception as e:
        logger.warning(f"Suggest error for {q}: {e}")
        return {"query": q, "suggestions": []}


@router.get("/search", response_model=SearchResponse)
async def api_search(
    q: str = Query(..., description="Search query"),
    max_results: int = 15,
    page: int = 1,
):
    try:
        q = q.strip()
        page = max(1, int(page or 1))

        # Smart-redirect if user pastes full media URL into search bar
        if extractor.is_url(q):
            d = await asyncio.to_thread(extractor.extract, q)
            ch = d.get("uploader") or d.get("channel") or "UltraVid"
            return {
                "query": q,
                "results": [
                    {
                        "id": None,
                        "title": d.get("title"),
                        "url": d.get("webpage_url"),
                        "duration": d.get("duration"),
                        "thumbnail": d.get("thumbnail"),
                        "uploader": ch,
                        "channel": ch,
                        "channelTitle": ch,
                        "views": d.get("view_count"),
                        "publishedTime": "Recently",
                        "channelAvatar": None,
                        "isLive": False,
                    }
                ],
            }

        search_query = q
        if page > 1:
            suffixes = ["", " latest", " 2026", " full", " highlights", " top", " videos"]
            search_query = f"{q}{suffixes[(page - 1) % len(suffixes)]}"

        # 1. Turbo InnerTube primary (< 1s)
        try:
            turbo = await asyncio.wait_for(
                fast_search(search_query, max_results=max_results),
                timeout=3.5,
            )
            if turbo.get("results"):
                return {"query": q, "results": turbo["results"][:max_results]}
        except Exception:
            pass

        # 2. Non-blocking fallback in thread pool with timeout
        data = await asyncio.wait_for(
            asyncio.to_thread(extractor.search, search_query, max_results),
            timeout=4.0,
        )
        return data
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Search failed: {e}")
