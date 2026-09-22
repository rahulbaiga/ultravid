"""Category Feed and Trending recommendations router."""
import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

import time
from app.models.feed import SearchResponse
from app.core.cache import get_cached_feed, set_cached_feed, invalidate_feed_cache
from app.services.innertube import get_diverse_category_feed, fast_feed, get_category_reserve, CATEGORY_TAXONOMY

logger = logging.getLogger("ultravid.feed")
router = APIRouter(tags=["Feed"])


@router.get("/feed", response_model=SearchResponse)
async def api_feed(
    page: int = 1,
    limit: int = 12,
    seed: int = 0,
    category: Optional[str] = None,
    refresh: bool = False,
    t: Optional[str] = None,
):
    try:
        limit = max(1, min(25, int(limit or 12)))
        page = max(1, int(page or 1))
        norm_cat = (category or "all").lower().strip()

        # If refresh requested, invalidate in-memory cache and randomize seed
        if refresh:
            invalidate_feed_cache(norm_cat)
            if seed == 0:
                seed = int(time.time() * 1000) % 100000

        # 1. Check in-memory 15-minute TTL cache first (only when not refreshing)
        if not refresh:
            cached = get_cached_feed(norm_cat, page)
            if cached and cached.get("results"):
                return {
                    "query": cached.get("query", f"feed:{norm_cat}"),
                    "results": cached["results"][:limit],
                }

        # 2. Multi-query taxonomy multiplexing with anti-clustering re-ranking
        try:
            items = await asyncio.wait_for(
                get_diverse_category_feed(norm_cat, page=page, limit=limit, seed=seed),
                timeout=15.0,
            )
            if items:
                res_data = {"query": f"feed:{norm_cat}", "results": items[:limit]}
                set_cached_feed(norm_cat, page, res_data)
                return res_data
        except Exception as e:
            logger.warning(f"Diverse feed fetch failed for {norm_cat}: {e}")

        # 3. Fast feed fallback
        try:
            turbo = await asyncio.wait_for(
                fast_feed(page=page, limit=limit, seed=seed, category=norm_cat),
                timeout=5.0,
            )
            if turbo.get("results"):
                res_data = {
                    "query": turbo.get("query", f"feed:{norm_cat}"),
                    "results": turbo["results"][:limit],
                }
                set_cached_feed(norm_cat, page, res_data)
                return res_data
        except Exception:
            pass

        # 4. Fallback to category-isolated reserve cache (0ms latency, guaranteed items with rotation)
        res = get_category_reserve(norm_cat)
        if not res:
            res = get_category_reserve("all")
        if not res:
            from app.services.innertube import _CATEGORY_RESERVES
            for k, v in _CATEGORY_RESERVES.items():
                if v:
                    res.extend(v[:4])

        if res:
            rot = ((page - 1 + int(seed or 0)) * limit) % max(1, len(res))
            rotated = res[rot:] + res[:rot]
            sub_taxonomies = CATEGORY_TAXONOMY.get(norm_cat, [])
            tagged_rotated = []
            for i, itm in enumerate(rotated[:limit]):
                item_copy = dict(itm)
                if sub_taxonomies:
                    item_copy["sub_topic"] = sub_taxonomies[i % len(sub_taxonomies)]["sub"]
                tagged_rotated.append(item_copy)
            res_data = {"query": f"feed:{norm_cat}", "results": tagged_rotated}
            set_cached_feed(norm_cat, page, res_data)
            return res_data

        return {"query": f"feed:{norm_cat}", "results": []}
    except Exception as e:
        logger.error(f"[FeedRouter] Unhandled feed exception for [{category}]: {e}")
        # Bulletproof fallback: Never raise 400/500 to prevent frontend error banners
        try:
            res = get_category_reserve(category or "all") or get_category_reserve("all")
            if res:
                rot = ((page - 1 + int(seed or 0)) * limit) % max(1, len(res))
                rotated = res[rot:] + res[:rot]
                return {"query": f"feed:{category or 'all'}", "results": rotated[:limit]}
        except Exception:
            pass
        return {"query": f"feed:{category or 'all'}", "results": []}


@router.get("/trending", response_model=SearchResponse)
async def api_trending(page: int = 1, limit: int = 12, refresh: bool = False, seed: int = 0):
    return await api_feed(page=page, limit=limit, category="trending", refresh=refresh, seed=seed)
