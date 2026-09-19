"""InnerTube turbo engine - persistent HTTP/2, ANDROID compact search, TTL cache."""
import re
import time
from collections import OrderedDict
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
        _ACLIENT = httpx.AsyncClient(http2=True, timeout=5.0, limits=_LIMITS, headers=HEADERS_ANDROID_SEARCH)
    return _ACLIENT

def _sconfig_client() -> httpx.Client:
    global _SCLIENT
    if _SCLIENT is None or _SCLIENT.is_closed:
        _SCLIENT = httpx.Client(http2=True, timeout=5.0, limits=_LIMITS, headers=HEADERS_ANDROID_SEARCH)
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
            ch = _text(vr.get("ownerText")) or _text(vr.get("shortBylineText"))
            out.append({"id": vid, "title": t, "url": f"https://www.youtube.com/watch?v={vid}", "thumbnail": _thumb(th) or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg", "duration": _text(vr.get("lengthText")), "channel": ch, "uploader": ch})
    return out

async def fast_search(query: str, max_results: int = 15, gl: str = "IN", hl: str = "en") -> Dict[str, Any]:
    ck = f"s:{query.lower().strip()}:{max_results}:{gl}"
    hit = _cache_get(ck)
    if hit is not None:
        return hit
    t0 = time.time()
    c = _aconfig_client()
    # 1) ANDROID compact (~50KB target)
    for ctx, hdr in ((_android_search_context(gl, hl), HEADERS_ANDROID_SEARCH), (_tv_search_context(gl, hl), HEADERS_WEB), (_web_search_context(gl, hl), HEADERS_WEB)):
        try:
            r = await c.post(SEARCH_URL, json={"context": ctx, "query": query}, headers=hdr)
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
    for ctx, hdr in ((_android_search_context(gl, hl), HEADERS_ANDROID_SEARCH), (_tv_search_context(gl, hl), HEADERS_WEB), (_web_search_context(gl, hl), HEADERS_WEB)):
        try:
            r = c.post(SEARCH_URL, json={"context": ctx, "query": query}, headers=hdr)
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
    return {"title": vd.get("title"), "duration": dur, "duration_string": dur_str, "thumbnail": _thumb(thumbs), "uploader": vd.get("author"), "channel": vd.get("author"), "view_count": vc, "like_count": None, "webpage_url": f"https://www.youtube.com/watch?v={video_id}", "extractor": "innertube", "resolutions": sorted(list(res_set), key=lambda r: int(r.replace("p", "")) if r.replace("p", "").isdigit() else 0), "video_streams": video_streams, "audio_streams": audio_streams, "progressive_streams": progressive, "playable_streams": playable, "default_play_url": default_url}

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

# Trending feed: rotating popular topics, 10 per page
TRENDING_TOPICS = [
    "Trending songs India 2026",
    "Bollywood hits 2026",
    "Big Buck Bunny 4K",
    "Arijit Singh live",
    "Cricket highlights 2026",
    "Tech news today",
    "Funny shorts compilation",
    "Travel vlog India",
    "Cooking recipes Hindi",
    "Gaming highlights",
]

async def fast_feed(page: int = 1, limit: int = 10) -> Dict[str, Any]:
    page = max(1, int(page or 1))
    limit = max(1, min(10, int(limit or 10)))
    topic = TRENDING_TOPICS[(page - 1) % len(TRENDING_TOPICS)]
    r = await fast_search(topic, max_results=limit)
    return {"query": f"feed:{topic}", "results": (r.get("results", []) or [])[:limit], "page": page, "topic": topic}

def fast_feed_sync(page: int = 1, limit: int = 10) -> Dict[str, Any]:
    page = max(1, int(page or 1))
    limit = max(1, min(10, int(limit or 10)))
    topic = TRENDING_TOPICS[(page - 1) % len(TRENDING_TOPICS)]
    r = fast_search_sync(topic, max_results=limit)
    return {"query": f"feed:{topic}", "results": (r.get("results", []) or [])[:limit], "page": page, "topic": topic}
