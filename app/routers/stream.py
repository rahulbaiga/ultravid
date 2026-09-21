"""Streaming extraction, proxy, and playback resolution router."""
import asyncio
import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.models.video import ExtractRequest, ExtractResponse
from app.services import extractor
from app.services.innertube import extract_video_id, fast_player

router = APIRouter(tags=["Stream"])


@router.post("/extract", response_model=ExtractResponse)
@router.post("/stream", response_model=ExtractResponse)
async def api_extract(payload: ExtractRequest):
    try:
        s = (payload.url or "").strip()
        # Keyword detection: raw text -> search first result then extract
        if not extractor.is_url(s):
            try:
                from app.services.innertube import fast_search
                sr = await fast_search(s, max_results=1)
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
            vid = extract_video_id(s)
            if vid and extractor.is_youtube_url(s):
                try:
                    turbo = await fast_player(vid)
                    if turbo.get("default_play_url"):
                        return turbo
                except Exception:
                    pass
        except Exception:
            pass

        data = await asyncio.to_thread(extractor.extract, s)
        return data
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Extraction failed: {e}")


@router.get("/stream", response_model=ExtractResponse)
async def api_stream_get(url: str = Query(..., description="Video URL to stream")):
    return await api_extract(ExtractRequest(url=url))


@router.get("/stream/{video_id}", response_model=ExtractResponse)
async def api_stream_by_id(video_id: str):
    url = f"https://www.youtube.com/watch?v={video_id}"
    return await api_extract(ExtractRequest(url=url))


@router.api_route("/proxy", methods=["GET", "HEAD"])
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
