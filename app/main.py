import os
import asyncio
from typing import Optional
import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from app.models import ExtractRequest, ExtractResponse, SearchResponse, DownloadRequest, DownloadResponse
from app import extractor
from app import download_manager

app = FastAPI(title="UltraVid Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(__file__)
STATIC_DIR = os.path.join(BASE_DIR, "static")
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

@app.on_event("shutdown")
async def _close_http():
    try:
        from app import innertube as _it
        await _it.aclose()
        _it.sclose()
    except Exception:
        pass

@app.middleware("http")
async def _cache_headers(request, call_next):
    resp = await call_next(request)
    p = request.url.path
    if p in ("/", "/index.html", "/app.js") or p.startswith("/api/feed"):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    elif p.startswith("/api/search"):
        resp.headers["Cache-Control"] = "public, max-age=60"
    return resp

@app.get("/health")
def health():
    return {"status": "ok", "service": "ultravid-engine"}

@app.post("/api/extract", response_model=ExtractResponse)
async def api_extract(payload: ExtractRequest):
    try:
        s = (payload.url or "").strip()
        # keyword detection: raw text -> search first result then extract
        if not extractor.is_url(s):
            # turbo search first
            try:
                from app import innertube as _it
                sr = await _it.fast_search(s, max_results=1)
                if sr.get("results"):
                    s = sr["results"][0]["url"]
                else:
                    sr2 = extractor.search(s, max_results=1)
                    if not sr2["results"]:
                        raise ValueError("No results for query")
                    s = sr2["results"][0]["url"]
            except Exception:
                sr = extractor.search(s, max_results=1)
                if not sr["results"]:
                    raise ValueError("No results for query")
                s = sr["results"][0]["url"]
        # YouTube -> fast_player turbo first, yt-dlp fallback inside extractor.extract
        try:
            from app import innertube as _it
            vid = _it.extract_video_id(s)
            if vid and extractor.is_youtube_url(s):
                try:
                    turbo = await _it.fast_player(vid)
                    if turbo.get("default_play_url"):
                        return turbo
                except Exception:
                    pass
        except Exception:
            pass
        data = extractor.extract(s)
        return data
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Extraction failed: {e}")

@app.get("/api/suggest")
async def api_suggest(q: str = Query("", max_length=100)):
    q = q.strip()
    if not q:
        return {"query": "", "suggestions": []}
    try:
        from app import innertube as _it
        suggs = await _it.fast_suggest(q)
        return {"query": q, "suggestions": suggs}
    except Exception as e:
        logger.warning(f"Suggest error for {q}: {e}")
        return {"query": q, "suggestions": []}

@app.get("/api/search", response_model=SearchResponse)
async def api_search(q: str = Query(..., description="Search query"), max_results: int = 15, page: int = 1):
    try:
        q = q.strip()
        page = max(1, int(page or 1))
        # if user pastes URL into search bar, smart-redirect to extract-compatible search result
        if extractor.is_url(q):
            d = await asyncio.to_thread(extractor.extract, q)
            ch = d.get("uploader") or d.get("channel") or "UltraVid"
            return {"query": q, "results": [{
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
            }]}
        
        search_query = q
        if page > 1:
            suffixes = ["", " latest", " 2026", " full", " highlights", " top", " videos"]
            search_query = f"{q}{suffixes[(page - 1) % len(suffixes)]}"

        # turbo InnerTube primary (blazing fast <1s)
        try:
            from app import innertube as _it
            turbo = await asyncio.wait_for(_it.fast_search(search_query, max_results=max_results), timeout=3.5)
            if turbo.get("results"):
                return {"query": q, "results": turbo["results"][:max_results]}
        except Exception:
            pass
        # Non-blocking fallback in thread pool with timeout
        data = await asyncio.wait_for(asyncio.to_thread(extractor.search, search_query, max_results), timeout=4.0)
        return data
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Search failed: {e}")

@app.get("/api/feed", response_model=SearchResponse)
async def api_feed(page: int = 1, limit: int = 12, seed: int = 0, category: Optional[str] = None, t: Optional[str] = None):
    try:
        limit = max(1, min(25, int(limit or 12)))
        page = max(1, int(page or 1))
        from app import innertube as _it
        try:
            turbo = await asyncio.wait_for(_it.fast_feed(page=page, limit=limit, seed=seed, category=category), timeout=5.0)
            if turbo.get("results"):
                return {"query": turbo.get("query", "feed"), "results": turbo["results"][:limit]}
        except Exception:
            pass
        # Instant fallback to in-memory reserve cache (0ms latency, guaranteed items with rotation)
        if getattr(_it, "_FEED_RESERVE", None):
            res = _it._FEED_RESERVE
            rot = ((page - 1) * limit) % max(1, len(res))
            rotated = res[rot:] + res[:rot]
            return {"query": "feed:Trending", "results": rotated[:limit]}
        return {"query": "feed:Trending", "results": []}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Feed failed: {e}")

@app.api_route("/api/proxy", methods=["GET", "HEAD"])
async def api_proxy(request: Request, url: str = Query(...)):
    """Streaming reverse proxy for GoogleVideo/YouTube media streams.
    Resolves HTTP 403 Forbidden and ORB errors by proxying with Range headers.
    """
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid stream url")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.youtube.com/",
        "Accept": "*/*",
        "Connection": "keep-alive",
    }
    range_hdr = request.headers.get("range")
    if range_hdr:
        headers["Range"] = range_hdr

    client = httpx.AsyncClient(follow_redirects=True, timeout=20.0)
    try:
        req = client.build_request("GET", url, headers=headers)
        upstream = await client.send(req, stream=True)
    except Exception as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Proxy connection failed: {exc}")

    resp_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
        "Cache-Control": "public, max-age=3600",
    }
    for h in ("content-length", "content-range", "accept-ranges", "content-type"):
        if h in upstream.headers:
            resp_headers[h] = upstream.headers[h]

    if "content-type" not in resp_headers:
        resp_headers["content-type"] = "video/mp4"

    async def stream_chunks():
        try:
            async for chunk in upstream.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    status_code = upstream.status_code if upstream.status_code in (200, 206) else 200
    return StreamingResponse(stream_chunks(), status_code=status_code, headers=resp_headers)

@app.post("/api/download", response_model=DownloadResponse)
def api_download(payload: DownloadRequest):
    try:
        task_id = download_manager.start_download(
            url=payload.url,
            quality=payload.quality or "720",
            audio_only=bool(payload.audio_only),
        )
        return {"task_id": task_id, "status": "queued"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Download failed: {e}")

@app.get("/api/downloads/status/{task_id}")
def api_download_status(task_id: str):
    st = download_manager.get_status(task_id)
    if not st:
        raise HTTPException(status_code=404, detail="task not found")
    return st

@app.get("/api/downloads/file/{filename}")
def api_download_file(filename: str):
    # prevent path traversal
    safe = os.path.basename(filename)
    fpath = os.path.join(DOWNLOAD_DIR, safe)
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(fpath, filename=safe)

# Mount static UI at / AFTER api routes; / serves index.html
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
