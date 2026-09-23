"""InnerTube turbo engine - persistent HTTP/2, ANDROID compact search, TTL cache."""
import re
import time
from collections import OrderedDict, defaultdict
from typing import Dict, Any, List, Optional
import httpx

SEARCH_URL = "https://www.youtube.com/youtubei/v1/search?prettyPrint=false"
PLAYER_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"

ANDROID_SEARCH_VERSION = "19.05.36"
ANDROID_PLAYER_VERSION = "20.10.38"
UA_ANDROID_SEARCH = "com.google.android.youtube/19.05.36 (Linux; U; Android 14) gzip"
UA_ANDROID_PLAYER = "com.google.android.youtube/20.10.38 (Linux; U; Android 13) gzip"
UA_WEB = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

HEADERS_ANDROID_SEARCH = {"User-Agent": UA_ANDROID_SEARCH, "Content-Type": "application/json"}
HEADERS_ANDROID_PLAYER = {"User-Agent": UA_ANDROID_PLAYER, "Content-Type": "application/json"}
HEADERS_WEB = {"User-Agent": UA_WEB, "Content-Type": "application/json", "Origin": "https://www.youtube.com", "Referer": "https://www.youtube.com/"}

# Persistent HTTP/2 connection pooling - singletons reused across all requests
_LIMITS = httpx.Limits(max_keepalive_connections=20, max_connections=50)
_ACLIENT: httpx.AsyncClient | None = None
_SCLIENT: httpx.Client | None = None

def _aconfig_client() -> httpx.AsyncClient:
    global _ACLIENT
    if _ACLIENT is None or _ACLIENT.is_closed:
        try:
            _ACLIENT = httpx.AsyncClient(http2=True, timeout=5.0, limits=_LIMITS, headers=HEADERS_ANDROID_SEARCH)
        except Exception:
            _ACLIENT = httpx.AsyncClient(http2=False, timeout=5.0, limits=_LIMITS, headers=HEADERS_ANDROID_SEARCH)
    return _ACLIENT

def _sconfig_client() -> httpx.Client:
    global _SCLIENT
    if _SCLIENT is None or _SCLIENT.is_closed:
        try:
            _SCLIENT = httpx.Client(http2=True, timeout=5.0, limits=_LIMITS, headers=HEADERS_ANDROID_SEARCH)
        except Exception:
            _SCLIENT = httpx.Client(http2=False, timeout=5.0, limits=_LIMITS, headers=HEADERS_ANDROID_SEARCH)
    return _SCLIENT

async def aclose():
    global _ACLIENT
    if _ACLIENT is not None and not _ACLIENT.is_closed:
        await _ACLIENT.aclose()

def sclose():
    global _SCLIENT
    if _SCLIENT is not None and not _SCLIENT.is_closed:
        _SCLIENT.close()

# Instant in-memory TTL cache: repeat query < 5ms
_CACHE: OrderedDict[str, tuple[float, dict]] = OrderedDict()
_CACHE_TTL = 300
_CACHE_MAX = 100

def _cache_get(key: str):
    it = _CACHE.get(key)
    if not it:
        return None
    ts, val = it
    if time.time() - ts > _CACHE_TTL:
        _CACHE.pop(key, None)
        return None
    _CACHE.move_to_end(key)
    return val

def _cache_put(key: str, val: dict):
    _CACHE[key] = (time.time(), val)
    _CACHE.move_to_end(key)
    while len(_CACHE) > _CACHE_MAX:
        _CACHE.popitem(last=False)

def _android_search_context(gl="IN", hl="en"):
    return {"client": {"hl": hl, "gl": gl, "clientName": "ANDROID", "clientVersion": ANDROID_SEARCH_VERSION, "androidSdkVersion": 34, "osName": "Android", "osVersion": "14", "platform": "MOBILE"}, "request": {"internalExperimentFlags": [], "useSsl": True}, "user": {"lockedSafetyMode": False}}

def _tv_search_context(gl="IN", hl="en"):
    return {"client": {"hl": hl, "gl": gl, "clientName": "TVHTML5", "clientVersion": "7.20241201.00.00", "platform": "TV"}, "request": {"internalExperimentFlags": [], "useSsl": True}, "user": {"lockedSafetyMode": False}}

def _web_search_context(gl="IN", hl="en"):
    return {"client": {"hl": hl, "gl": gl, "clientName": "WEB", "clientVersion": "2.20260805.01.00", "originalUrl": "https://www.youtube.com", "platform": "DESKTOP", "utcOffsetMinutes": 0}, "request": {"internalExperimentFlags": [], "useSsl": True}, "user": {"lockedSafetyMode": False}}

def _android_player_context(gl="IN", hl="en"):
    return {"client": {"hl": hl, "gl": gl, "clientName": "ANDROID", "clientVersion": ANDROID_PLAYER_VERSION, "androidSdkVersion": 33, "osName": "Android", "osVersion": "13", "platform": "MOBILE"}, "request": {"internalExperimentFlags": [], "useSsl": True}, "user": {"lockedSafetyMode": False}}

def _thumb(thumbs):
    if not thumbs:
        return None
    try:
        best = max(thumbs, key=lambda t: (t.get("width") or 0))
        return best.get("url")
    except Exception:
        try:
            return thumbs[-1].get("url")
        except Exception:
            return None

def _text(d):
    if d is None:
        return None
    if isinstance(d, str):
        return d
    if isinstance(d, dict):
        if "simpleText" in d:
            return d["simpleText"]
        runs = d.get("runs")
        if runs:
            return "".join(r.get("text", "") for r in runs)
    return None

def _parse_search_json(data: Dict[str, Any], max_results: int) -> List[Dict[str, Any]]:
    """Fast parse: only 5 fields per item, early exit."""
    out: List[Dict[str, Any]] = []
    try:
        sec_list = data.get("contents", {}).get("twoColumnSearchResultsRenderer", {}).get("primaryContents", {}).get("sectionListRenderer", {}).get("contents", [])
    except Exception:
        return out
    for sec in sec_list:
        if not isinstance(sec, dict):
            continue
        items = (sec.get("itemSectionRenderer") or {}).get("contents", [])
        for it in items:
            if len(out) >= max_results:
                return out
            if not isinstance(it, dict):
                continue
            vr = it.get("videoRenderer")
            if not vr:
                continue
            vid = vr.get("videoId")
            if not vid:
                continue
            t = _text(vr.get("title"))
            if not t:
                continue
            th = vr.get("thumbnail", {}).get("thumbnails", [])
            ch = _text(vr.get("ownerText")) or _text(vr.get("shortBylineText")) or "UltraVid"
            if ch:
                ch = ch.split("\n")[0].split("\r")[0].strip()
                if " • " in ch:
                    ch = ch.split(" • ")[0].strip()
                ch = ch.rstrip("`").strip() or "UltraVid"

            views = _text(vr.get("shortViewCountText")) or _text(vr.get("viewCountText")) or "100K+ views"
            pub = _text(vr.get("publishedTimeText")) or "Recently"
            dur = _text(vr.get("lengthText"))

            is_live = False
            badges = vr.get("badges") or []
            for b in badges:
                mr = b.get("metadataBadgeRenderer", {})
                if mr.get("style") == "BADGE_STYLE_TYPE_LIVE_NOW" or "LIVE" in (_text(mr.get("label")) or "").upper():
                    is_live = True
                    break
            if not dur and is_live:
                dur = "LIVE"

            ch_thumbs = vr.get("channelThumbnailSupportedRenderers", {}).get("channelThumbnailWithLinkRenderer", {}).get("thumbnail", {}).get("thumbnails", [])
            avatar = _thumb(ch_thumbs) if ch_thumbs else None

            out.append({
                "id": vid,
                "title": t,
                "url": f"https://www.youtube.com/watch?v={vid}",
                "thumbnail": _thumb(th) or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                "duration": dur,
                "channel": ch,
                "uploader": ch,
                "channelTitle": ch,
                "views": views,
                "publishedTime": pub,
                "channelAvatar": avatar,
                "isLive": is_live,
            })
    return out

async def fast_search(query: str, max_results: int = 15, gl: str = "IN", hl: str = "en") -> Dict[str, Any]:
    ck = f"s:{query.lower().strip()}:{max_results}:{gl}"
    hit = _cache_get(ck)
    if hit is not None:
        return hit
    t0 = time.time()
    c = _aconfig_client()
    # 1) WEB search (~1.2s instant response) -> fallbacks: TV, ANDROID
    for ctx, hdr in ((_web_search_context(gl, hl), HEADERS_WEB), (_tv_search_context(gl, hl), HEADERS_WEB), (_android_search_context(gl, hl), HEADERS_ANDROID_SEARCH)):
        try:
            r = await c.post(SEARCH_URL, json={"context": ctx, "query": query}, headers=hdr, timeout=3.0)
            if r.status_code != 200:
                continue
            results = _parse_search_json(r.json(), max_results)
            if results:
                out = {"query": query, "results": results, "_latency": time.time() - t0, "_bytes": len(r.content)}
                _cache_put(ck, out)
                return out
        except Exception:
            continue
    out = {"query": query, "results": [], "_latency": time.time() - t0, "_bytes": 0}
    return out

def fast_search_sync(query: str, max_results: int = 15, gl: str = "IN", hl: str = "en") -> Dict[str, Any]:
    ck = f"s:{query.lower().strip()}:{max_results}:{gl}"
    hit = _cache_get(ck)
    if hit is not None:
        return hit
    t0 = time.time()
    c = _sconfig_client()
    for ctx, hdr in ((_web_search_context(gl, hl), HEADERS_WEB), (_tv_search_context(gl, hl), HEADERS_WEB), (_android_search_context(gl, hl), HEADERS_ANDROID_SEARCH)):
        try:
            r = c.post(SEARCH_URL, json={"context": ctx, "query": query}, headers=hdr, timeout=3.0)
            if r.status_code != 200:
                continue
            results = _parse_search_json(r.json(), max_results)
            if results:
                out = {"query": query, "results": results, "_latency": time.time() - t0, "_bytes": len(r.content)}
                _cache_put(ck, out)
                return out
        except Exception:
            continue
    return {"query": query, "results": [], "_latency": time.time() - t0, "_bytes": 0}

async def fast_suggest(query: str, gl: str = "IN", hl: str = "en") -> List[str]:
    query = query.strip()
    if not query:
        return []
    ck = f"sug:{query.lower()}:{gl}"
    hit = _cache_get(ck)
    if hit is not None:
        return hit.get("suggestions", [])
    c = _aconfig_client()
    try:
        r = await c.get(
            "https://suggestqueries.google.com/complete/search",
            params={"client": "firefox", "ds": "yt", "q": query, "gl": gl, "hl": hl},
            timeout=2.0
        )
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list):
                suggs = [str(x) for x in data[1][:10]]
                _cache_put(ck, {"suggestions": suggs})
                return suggs
    except Exception:
        pass
    return []

def _parse_player(data: Dict[str, Any], video_id: str) -> Dict[str, Any]:
    vd = data.get("videoDetails", {}) or {}
    sd = data.get("streamingData", {}) or {}
    fmts = (sd.get("formats", []) or []) + (sd.get("adaptiveFormats", []) or [])
    video_streams, audio_streams, progressive = [], [], []
    res_set = set()
    for f in fmts:
        url = f.get("url")
        if not url:
            continue
        mime = f.get("mimeType", "") or ""
        ext = "webm" if "webm" in mime else "mp4"
        vcodec, acodec = None, None
        m = re.search(r'codecs="([^"]+)"', mime)
        if m:
            for p in [x.strip() for x in m.group(1).split(",")]:
                if p.startswith(("avc", "vp0", "vp9", "av01", "hev")):
                    vcodec = p
                elif p.startswith(("mp4a", "opus", "vorbis", "ac-")):
                    acodec = p
        else:
            if mime.startswith("video/"):
                vcodec = "unknown"
            if mime.startswith("audio/"):
                acodec = "unknown"
        h = f.get("height")
        if h:
            res_set.add(f"{h}p")
        try:
            cl = int(f.get("contentLength") or 0)
        except Exception:
            cl = 0
        entry = {"format_id": str(f.get("itag")), "url": url, "ext": ext, "resolution": f.get("qualityLabel"), "height": h, "width": f.get("width"), "fps": f.get("fps"), "filesize": cl or None, "filesize_approx": None, "filesize_human": f"{cl/1048576:.1f} MB" if cl else "—", "tbr": f.get("bitrate"), "vcodec": vcodec, "acodec": acodec, "abr": f.get("averageBitrate") or f.get("bitrate"), "asr": None, "protocol": "https", "format_note": f.get("quality")}
        hv = vcodec not in (None, "none")
        ha = acodec not in (None, "none")
        if hv and ha:
            progressive.append(entry)
        elif hv:
            video_streams.append(entry)
        elif ha:
            audio_streams.append(entry)
    video_streams.sort(key=lambda x: (x.get("height") or 0), reverse=True)
    progressive.sort(key=lambda x: (x.get("height") or 0), reverse=True)
    try:
        audio_streams.sort(key=lambda x: (x.get("abr") or 0), reverse=True)
    except Exception:
        pass
    playable = [f for f in progressive if f.get("ext") == "mp4"] or [f for f in progressive if f.get("url")]
    default_url = None
    if playable:
        pref = next((f for f in playable if f.get("height") == 720), None) or next((f for f in playable if (f.get("height") or 0) <= 720), playable[0])
        default_url = pref.get("url")
    thumbs = (vd.get("thumbnail", {}) or {}).get("thumbnails", [])
    try:
        dur = int(vd.get("lengthSeconds")) if vd.get("lengthSeconds") is not None else None
    except Exception:
        dur = None
    dur_str = None
    if isinstance(dur, int):
        m_, s_ = divmod(dur, 60)
        h_, m_ = divmod(m_, 60)
        dur_str = f"{h_}:{m_:02d}:{s_:02d}" if h_ else f"{m_}:{s_:02d}"
    try:
        vc = int(vd.get("viewCount")) if vd.get("viewCount") else None
    except Exception:
        vc = None
    return {"title": vd.get("title"), "duration": dur, "duration_string": dur_str, "thumbnail": _thumb(thumbs), "uploader": vd.get("author"), "channel": vd.get("author"), "view_count": vc, "like_count": None, "webpage_url": f"https://www.youtube.com/watch?v={video_id}", "extractor": "innertube", "resolutions": sorted(list(res_set), key=lambda r: int(r.replace("p", "")) if r.replace("p", "").isdigit() else 0), "video_streams": video_streams, "audio_streams": audio_streams, "progressive_streams": progressive, "playable_streams": playable, "default_play_url": default_url, "description": vd.get("shortDescription") or ""}

async def fast_player(video_id: str) -> Dict[str, Any]:
    c = _aconfig_client()
    r = await c.post(PLAYER_URL, json={"context": _android_player_context(), "videoId": video_id, "contentCheckOk": True, "racyCheckOk": True}, headers=HEADERS_ANDROID_PLAYER)
    r.raise_for_status()
    return _parse_player(r.json(), video_id)

def fast_player_sync(video_id: str) -> Dict[str, Any]:
    c = _sconfig_client()
    r = c.post(PLAYER_URL, json={"context": _android_player_context(), "videoId": video_id, "contentCheckOk": True, "racyCheckOk": True}, headers=HEADERS_ANDROID_PLAYER)
    r.raise_for_status()
    return _parse_player(r.json(), video_id)

def extract_video_id(url_or_id: str) -> Optional[str]:
    s = (url_or_id or "").strip()
    m = re.search(r"(?:v=|youtu\.be/|shorts/)([A-Za-z0-9_-]{11})", s)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", s):
        return s
    return None

# Categorized & interleaved diverse topic bank (50+ high-quality categories)
TOPIC_CATEGORIES: Dict[str, List[str]] = {
    "all": [
        "Trending now India", "Gaming highlights 2026", "Tech gadgets and reviews",
        "New movie trailers 2026", "Science and space discoveries", "Cricket match highlights",
        "Bollywood hits 2026", "Standup comedy Hindi", "Travel street food India",
        "BBC Earth wildlife 4K", "GTA 6 gameplay", "AI robotics inventions 2026",
        "New Hindi songs 2026", "SpaceX starship launch", "Minecraft survival build 4K",
        "Hollywood upcoming movies", "Football champions league goals", "Unreal Engine 5 games",
        "Latest smartphone unboxing 2026", "Funny comedy sketches Hindi", "Japan travel vlog 4K",
        "James Webb telescope discoveries", "Arijit Singh live concert", "Supercars acceleration sound 4K",
        "Cyberpunk 2077 ray tracing", "World news today live", "Deep sea ocean creatures 4K",
        "Top global music hits", "Formula 1 race recap", "Anime new season teaser",
        "Best laptops 2026 review", "Wilderness bushcraft cooking", "Quantum computing breakthrough",
        "BGMI esports championship", "Nature relaxing 4K drone", "Ancient civilizations history 4K",
        "IPL best moments", "Electric vehicles future cars", "Apple keynote highlights",
        "Lo-fi hip hop study relax", "Behind the scenes movie VFX", "Best street food world tour",
        "PlayStation 5 top games", "Smart home gadgets 2026", "Viral comedy scenes",
        "Coke Studio top tracks", "Olympic records highlights", "Futuristic technology 2026"
    ],
    "gaming": [
        "Gaming highlights 2026", "GTA 6 gameplay", "Minecraft survival build 4K",
        "BGMI esports championship", "Elden Ring gameplay 4K", "Cyberpunk 2077 ray tracing",
        "Call of Duty Warzone epic moments", "PlayStation 5 top games", "Unreal Engine 5 games"
    ],
    "tech": [
        "Tech gadgets and reviews", "New smartphone unboxing 2026", "AI robotics inventions 2026",
        "SpaceX starship launch", "Quantum computing breakthrough", "Best laptops 2026 review",
        "Electric vehicles future cars", "Apple keynote highlights", "Smart home gadgets 2026"
    ],
    "movies": [
        "New movie trailers 2026", "Bollywood blockbuster trailer", "Hollywood upcoming movies",
        "Anime new season teaser", "Behind the scenes movie VFX", "Cinema film reviews 2026",
        "Sci-fi movies 2026 trailers", "Action movies best scenes 4K"
    ],
    "music": [
        "Bollywood hits 2026", "New Hindi songs 2026", "Top global music hits",
        "Arijit Singh live concert", "Acoustic chill live session", "Punjabi new hits 2026",
        "Lo-fi hip hop study relax", "Coke Studio top tracks", "Electronic music festival 4K"
    ],
    "science": [
        "Science and space discoveries", "BBC Earth wildlife 4K", "James Webb telescope discoveries",
        "Deep sea ocean creatures 4K", "How universe works 4K", "National Geographic adventure",
        "Nature relaxing 4K drone", "Ancient civilizations history 4K"
    ],
    "sports": [
        "Cricket match highlights", "IPL best moments", "Football champions league goals",
        "World cup best moments", "Olympic records highlights", "Formula 1 race recap"
    ],
    "comedy": [
        "Standup comedy Hindi", "Funny comedy sketches Hindi", "Viral comedy scenes",
        "Late night comedy show", "Best sitcom moments", "Prank funny video compilation"
    ],
    "food": [
        "Travel street food India", "Japan travel vlog 4K", "Wilderness bushcraft cooking",
        "Best street food world tour", "Luxury travel destinations", "Village cooking channel"
    ]
}

TRENDING_TOPICS = TOPIC_CATEGORIES["all"]

# Explicit, hardened category-to-query synthesis dictionary
CATEGORY_QUERIES: Dict[str, Optional[str]] = {
    "all": None,  # Fetches natural home/trending feed
    "gaming": "gaming gameplay walkthrough esports live",
    "tech": "technology gadgets smartphone AI review unboxing",
    "movies": "movie trailer official clips cinema teaser",
    "music": "official music video new songs hits audio",
    "science": "science documentary astronomy physics technology",
    "sports": "sports highlights cricket football match moments",
    "comedy": "stand up comedy humor sketch comedy",
    "food": "street food cooking recipes food travel vlog",
    "trending": None  # Handled via trending endpoint
}

# Category-isolated fallback reserves to prevent cross-category contamination
_CATEGORY_RESERVES: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
_FEED_RESERVE: List[Dict[str, Any]] = []

# Category-isolated seen tracking
_CATEGORY_SEEN: Dict[str, OrderedDict[str, float]] = defaultdict(OrderedDict)
_SEEN_VIDEOS: OrderedDict[str, float] = OrderedDict()
_SEEN_VIDEOS_MAX = 500

def get_category_reserve(category: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return in-memory fallback reserve strictly for the requested category."""
    cat_key = (category or "all").lower().strip()
    if cat_key in ("all", "trending"):
        return _FEED_RESERVE or _CATEGORY_RESERVES.get("all", [])
    return _CATEGORY_RESERVES.get(cat_key, [])

async def fast_feed(page: int = 1, limit: int = 12, seed: int = 0, category: Optional[str] = None) -> Dict[str, Any]:
    page = max(1, int(page or 1))
    limit = max(1, min(25, int(limit or 12)))
    cat_key = (category or "all").lower().strip()

    # Specialized category handling with dedicated contextual query synthesis
    base_query = CATEGORY_QUERIES.get(cat_key)
    if base_query:
        suffixes = ["", " latest", " 2026", " trending", " viral", " highlights", " top", " new"]
        cycle = (page - 1) % len(suffixes)
        query = f"{base_query}{suffixes[cycle]}" if cycle > 0 else base_query
        try:
            r = await fast_search(query, max_results=max(30, limit * 2))
            items = (r.get("results", []) or [])
            if items:
                cat_seen = _CATEGORY_SEEN[cat_key]
                unseen = [v for v in items if v.get("id") and v["id"] not in cat_seen]
                chosen = unseen[:limit] if len(unseen) >= limit else (unseen + [v for v in items if v not in unseen])[:limit]

                now = time.time()
                for v in chosen:
                    if v.get("id"):
                        cat_seen[v["id"]] = now
                        if len(cat_seen) > 300:
                            cat_seen.popitem(last=False)

                res_list = _CATEGORY_RESERVES[cat_key]
                for it in chosen:
                    if it not in res_list:
                        res_list.append(it)
                if len(res_list) > 100:
                    del res_list[:len(res_list) - 100]

                return {"query": f"feed:{cat_key}", "results": chosen, "page": page, "category": cat_key}
        except Exception:
            pass

        # Fallback strictly to category-isolated reserve
        res_list = _CATEGORY_RESERVES.get(cat_key, [])
        if res_list:
            rot = ((page - 1) * limit) % max(1, len(res_list))
            rotated = res_list[rot:] + res_list[:rot]
            return {"query": f"feed:{cat_key}", "results": rotated[:limit], "page": page, "category": cat_key}

        return {"query": f"feed:{cat_key}", "results": [], "page": page, "category": cat_key}

    # Standard home/discovery feed ('all' or 'trending' or unknown category)
    topic_pool = TOPIC_CATEGORIES.get("all") or TRENDING_TOPICS
    cycle_num = (page - 1) // len(topic_pool)
    start_idx = (page - 1 + int(seed or 0)) % len(topic_pool)

    suffixes = ["", " latest", " 2026", " trending", " viral", " highlights", " top", " new"]
    suffix = suffixes[cycle_num % len(suffixes)]

    for offset in range(len(topic_pool)):
        idx = (start_idx + offset) % len(topic_pool)
        base_topic = topic_pool[idx]
        topic = f"{base_topic}{suffix}" if suffix and cycle_num > 0 else base_topic
        try:
            r = await fast_search(topic, max_results=30)
            items = (r.get("results", []) or [])
            if not items:
                continue

            unseen = [v for v in items if v.get("id") and v["id"] not in _SEEN_VIDEOS]

            if len(unseen) >= limit:
                chosen = unseen[:limit]
            elif unseen:
                seen_pool = [v for v in items if v not in unseen]
                chosen = (unseen + seen_pool)[:limit]
            else:
                chosen = items[:limit]

            now = time.time()
            for v in chosen:
                if v.get("id"):
                    _SEEN_VIDEOS[v["id"]] = now
                    if len(_SEEN_VIDEOS) > _SEEN_VIDEOS_MAX:
                        _SEEN_VIDEOS.popitem(last=False)

            for it in chosen:
                if it not in _FEED_RESERVE:
                    _FEED_RESERVE.append(it)
                if it not in _CATEGORY_RESERVES["all"]:
                    _CATEGORY_RESERVES["all"].append(it)
            if len(_FEED_RESERVE) > 200:
                del _FEED_RESERVE[:len(_FEED_RESERVE) - 200]

            return {"query": f"feed:{base_topic}", "results": chosen, "page": page, "topic": base_topic, "category": "all"}
        except Exception:
            continue

    if _FEED_RESERVE:
        unseen_reserve = [v for v in _FEED_RESERVE if v.get("id") not in _SEEN_VIDEOS]
        pool = unseen_reserve if len(unseen_reserve) >= limit else _FEED_RESERVE
        rot = ((page - 1) * limit) % max(1, len(pool))
        rotated = pool[rot:] + pool[:rot]
        return {"query": "feed:Trending", "results": rotated[:limit], "page": page, "topic": "Trending", "category": "all"}

    return {"query": "feed:Trending", "results": [], "page": page, "topic": "Trending", "category": "all"}

async def get_feed(category: Optional[str] = None, page: int = 1, limit: int = 12, seed: int = 0) -> Dict[str, Any]:
    """Qualified feed resolver matching get_feed interface."""
    return await fast_feed(page=page, limit=limit, seed=seed, category=category)

def fast_feed_sync(page: int = 1, limit: int = 10, seed: int = 0, category: Optional[str] = None) -> Dict[str, Any]:
    page = max(1, int(page or 1))
    limit = max(1, min(10, int(limit or 10)))
    cat_key = (category or "all").lower().strip()

    base_query = CATEGORY_QUERIES.get(cat_key)
    if base_query:
        suffixes = ["", " latest", " 2026", " trending", " viral", " highlights", " top", " new"]
        cycle = (page - 1) % len(suffixes)
        query = f"{base_query}{suffixes[cycle]}" if cycle > 0 else base_query
        try:
            r = fast_search_sync(query, max_results=max(20, limit * 2))
            items = (r.get("results", []) or [])
            if items:
                cat_seen = _CATEGORY_SEEN[cat_key]
                unseen = [v for v in items if v.get("id") and v["id"] not in cat_seen]
                chosen = (unseen or items)[:limit]
                now = time.time()
                for v in chosen:
                    if v.get("id"):
                        cat_seen[v["id"]] = now
                res_list = _CATEGORY_RESERVES[cat_key]
                for it in chosen:
                    if it not in res_list:
                        res_list.append(it)
                return {"query": f"feed:{cat_key}", "results": chosen, "page": page, "category": cat_key}
        except Exception:
            pass

        res_list = _CATEGORY_RESERVES.get(cat_key, [])
        if res_list:
            rot = ((page - 1) * limit) % max(1, len(res_list))
            rotated = res_list[rot:] + res_list[:rot]
            return {"query": f"feed:{cat_key}", "results": rotated[:limit], "page": page, "category": cat_key}
        return {"query": f"feed:{cat_key}", "results": [], "page": page, "category": cat_key}

    topic_pool = TOPIC_CATEGORIES.get("all") or TRENDING_TOPICS
    start_idx = (page - 1 + int(seed or 0)) % len(topic_pool)

    for offset in range(len(topic_pool)):
        idx = (start_idx + offset) % len(topic_pool)
        topic = topic_pool[idx]
        try:
            r = fast_search_sync(topic, max_results=25)
            items = (r.get("results", []) or [])
            if items:
                unseen = [v for v in items if v.get("id") and v["id"] not in _SEEN_VIDEOS]
                chosen = (unseen or items)[:limit]
                now = time.time()
                for v in chosen:
                    if v.get("id"):
                        _SEEN_VIDEOS[v["id"]] = now
                for it in chosen:
                    if it not in _FEED_RESERVE:
                        _FEED_RESERVE.append(it)
                return {"query": f"feed:{topic}", "results": chosen, "page": page, "topic": topic, "category": "all"}
        except Exception:
            continue

    if _FEED_RESERVE:
        return {"query": "feed:Trending", "results": _FEED_RESERVE[:limit], "page": page, "topic": "Trending", "category": "all"}
    return {"query": "feed:Trending", "results": [], "page": page, "topic": "Trending", "category": "all"}

def get_feed_sync(category: Optional[str] = None, page: int = 1, limit: int = 10, seed: int = 0) -> Dict[str, Any]:
    return fast_feed_sync(page=page, limit=limit, seed=seed, category=category)



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
