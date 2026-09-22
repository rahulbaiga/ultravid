"""InnerTube recommendation and diverse feed multiplexing engine.
Provides multi-query taxonomy multiplexing, round-robin interleaving, and anti-clustering re-ranking.
"""
import asyncio
import logging
import random
import time
from typing import Dict, Any, List, Optional

logger = logging.getLogger("ultravid.innertube")

from app.innertube import (
    fast_feed,
    get_feed,
    fast_feed_sync,
    get_feed_sync,
    fast_search,
    fast_search_sync,
    fast_player,
    fast_player_sync,
    fast_suggest,
    extract_video_id,
    get_category_reserve,
    _CATEGORY_RESERVES,
    _FEED_RESERVE,
    aclose,
    sclose,
)
from app.services.taxonomy import (
    CATEGORY_TAXONOMY,
    CATEGORY_QUERIES,
    TOPIC_CATEGORIES,
    PAGE_MODIFIERS,
    get_page_modified_query,
)
from app.services.recommender import anti_cluster_rerank


async def search_innertube(query: str, limit: int = 10, page: int = 1) -> List[Dict[str, Any]]:
    """Queries InnerTube search with query vector."""
    try:
        res = await fast_search(query, max_results=limit)
        return (res.get("results", []) if isinstance(res, dict) else []) or []
    except Exception:
        return []


async def standard_feed_fetch(category: str, page: int = 1, limit: int = 12, seed: int = 0) -> List[Dict[str, Any]]:
    """Standard fallback feed fetch for un-taxonomized categories like 'all'."""
    try:
        resp = await fast_feed(page=page, limit=limit, seed=seed, category=category)
        return (resp.get("results", []) if isinstance(resp, dict) else []) or []
    except Exception:
        return []


async def get_diverse_category_feed(category: str, page: int = 1, limit: int = 12, seed: int = 0) -> List[Dict[str, Any]]:
    """Asynchronously multiplexes across category sub-taxonomies with round-robin interleaving and anti-clustering re-ranking."""
    norm_cat = (category or "all").lower().strip()

    sub_taxonomies = CATEGORY_TAXONOMY.get(norm_cat)
    if not sub_taxonomies:
        # Dynamic fallback taxonomy for any untracked / custom chip
        sub_taxonomies = [
            {"sub": "primary", "query": f"{norm_cat} best highlights popular"},
            {"sub": "trending", "query": f"{norm_cat} trending 2026 viral"},
            {"sub": "latest", "query": f"{norm_cat} latest new releases"},
            {"sub": "curated", "query": f"{norm_cat} top rated documentary features"},
        ]

    # Rotate sub-topics according to page offset and seed to guarantee variety across pages and refreshes
    num_subtopics = len(sub_taxonomies)
    subtopics_per_page = min(4, num_subtopics)
    offset = (((page - 1) * 2) + (int(seed or 0) % num_subtopics)) % num_subtopics
    selected_subs = [sub_taxonomies[(offset + i) % num_subtopics] for i in range(subtopics_per_page)]

    # Asynchronously fetch candidates across all selected sub-topics in parallel
    fetch_tasks = []
    items_per_sub = max(3, (limit // subtopics_per_page) + 2)

    for sub_def in selected_subs:
        mod_query = get_page_modified_query(sub_def["query"], page, seed=seed)
        fetch_tasks.append(search_innertube(mod_query, limit=items_per_sub, page=page))

    raw_sub_results = await asyncio.gather(*fetch_tasks, return_exceptions=True)

    candidates = []
    seen_in_batch = set()

    # Tag each item with its sub-topic domain and deduplicate
    for i, res in enumerate(raw_sub_results):
        items_list = res if isinstance(res, list) else (res.get("results", []) if isinstance(res, dict) else [])
        sub_tag = selected_subs[i]["sub"]
        for it in items_list:
            vid_id = it.get("id")
            if vid_id and vid_id in seen_in_batch:
                continue
            if vid_id:
                seen_in_batch.add(vid_id)
            it_copy = dict(it)
            it_copy["sub_topic"] = sub_tag
            candidates.append(it_copy)

    if candidates:
        res_list = _CATEGORY_RESERVES[norm_cat]
        for itm in candidates:
            if itm not in res_list:
                res_list.append(itm)

    # Fallback to category-isolated reserves if online candidates are insufficient
    if len(candidates) < limit:
        reserve = get_category_reserve(norm_cat)
        if not reserve and norm_cat in ("all", "trending"):
            reserve = get_category_reserve("all") or get_category_reserve("trending")
        if not reserve:
            for k, v in _CATEGORY_RESERVES.items():
                if v:
                    reserve.extend(v[:4])
        if reserve:
            rot = (((page - 1) * limit) + (int(seed or 0) % max(1, len(reserve)))) % max(1, len(reserve))
            rotated_reserve = reserve[rot:] + reserve[:rot]
            for idx, res_item in enumerate(rotated_reserve):
                vid_id = res_item.get("id")
                if vid_id and vid_id not in seen_in_batch:
                    seen_in_batch.add(vid_id)
                    item_copy = dict(res_item)
                    item_copy["sub_topic"] = selected_subs[idx % len(selected_subs)]["sub"]
                    candidates.append(item_copy)
                if len(candidates) >= limit * 2:
                    break

    # Interleave candidates in a round-robin zip across sub-topic buckets
    bucket_map = {}
    for item in candidates:
        bucket_map.setdefault(item.get("sub_topic", "general"), []).append(item)

    interleaved = []
    max_len = max((len(b) for b in bucket_map.values()), default=0)
    for step in range(max_len):
        for sub_def in selected_subs:
            b = bucket_map.get(sub_def["sub"], [])
            if step < len(b):
                interleaved.append(b[step])

    # Apply strict Anti-Clustering Re-ranking (Max consecutive <= 2)
    diversified = anti_cluster_rerank(interleaved, max_consecutive=2)
    return diversified[:limit]


__all__ = [
    "CATEGORY_TAXONOMY",
    "PAGE_MODIFIERS",
    "get_page_modified_query",
    "CATEGORY_QUERIES",
    "TOPIC_CATEGORIES",
    "anti_cluster_rerank",
    "search_innertube",
    "standard_feed_fetch",
    "get_diverse_category_feed",
    "fast_feed",
    "get_feed",
    "fast_feed_sync",
    "get_feed_sync",
    "fast_search",
    "fast_search_sync",
    "fast_player",
    "fast_player_sync",
    "fast_suggest",
    "extract_video_id",
    "get_category_reserve",
    "_CATEGORY_RESERVES",
    "_FEED_RESERVE",
    "aclose",
    "sclose",
]
