import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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
    # aggressive browser caching for static UI (no CDN, embedded CSS)
    if p in ("/", "/index.html"):
        resp.headers["Cache-Control"] = "public, max-age=300"
    elif p in ("/app.js",):
        resp.headers["Cache-Control"] = "public, max-age=86400, immutable"
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

@app.get("/api/search", response_model=SearchResponse)
async def api_search(q: str = Query(..., description="Search query"), max_results: int = 8):
    try:
        # if user pastes URL into search bar, smart-redirect to extract-compatible search result
        if extractor.is_url(q):
            d = extractor.extract(q)
            return {"query": q, "results": [{
                "id": None,
                "title": d.get("title"),
                "url": d.get("webpage_url"),
                "duration": d.get("duration"),
                "thumbnail": d.get("thumbnail"),
                "uploader": d.get("uploader"),
            }]}
        # turbo InnerTube primary, yt-dlp fallback
        try:
            from app import innertube as _it
            turbo = await _it.fast_search(q, max_results=max_results)
            if turbo.get("results"):
                return {"query": q, "results": turbo["results"][:max_results]}
        except Exception:
            pass
        data = extractor.search(q, max_results=max_results)
        return data
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Search failed: {e}")

@app.get("/api/feed", response_model=SearchResponse)
async def api_feed(page: int = 1, limit: int = 10):
    try:
        limit = max(1, min(10, int(limit or 10)))
        page = max(1, int(page or 1))
        from app import innertube as _it
        try:
            turbo = await _it.fast_feed(page=page, limit=limit)
            if turbo.get("results"):
                return {"query": turbo.get("query", "feed"), "results": turbo["results"][:limit]}
        except Exception:
            pass
        # fallback: trending topic via extractor (yt-dlp path)
        from app import innertube as _it2
        topic = _it2.TRENDING_TOPICS[(page - 1) % len(_it2.TRENDING_TOPICS)]
        data = extractor.search(topic, max_results=limit)
        return {"query": f"feed:{topic}", "results": (data.get("results", []) or [])[:limit]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Feed failed: {e}")

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
