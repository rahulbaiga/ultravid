"""Low-latency 206 Partial Content Streaming Proxy Router."""
import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse

from app.core.cache import cache

router = APIRouter(tags=["Proxy"])


_PROXY_LIMITS = httpx.Limits(max_keepalive_connections=30, max_connections=60)
_PROXY_CLIENT: httpx.AsyncClient | None = None

def _get_proxy_client() -> httpx.AsyncClient:
    global _PROXY_CLIENT
    if _PROXY_CLIENT is None or _PROXY_CLIENT.is_closed:
        _PROXY_CLIENT = httpx.AsyncClient(follow_redirects=True, timeout=30.0, limits=_PROXY_LIMITS)
    return _PROXY_CLIENT

async def aclose_proxy():
    global _PROXY_CLIENT
    if _PROXY_CLIENT is not None and not _PROXY_CLIENT.is_closed:
        await _PROXY_CLIENT.aclose()


@router.api_route("/proxy", methods=["GET", "HEAD"])
async def stream_proxy(request: Request, url: str = Query(...)):
    """Streaming reverse proxy for media streams with low-latency 64KB chunk yielding.
    Faithfully forwards HTTP Range headers and resolves CORS and 206 Partial Content.
    """
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid stream url")

    headers = {
        "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11; en_US) gzip",
        "Referer": "https://www.youtube.com/",
        "Origin": "https://www.youtube.com",
        "Accept": "*/*",
        "Connection": "keep-alive",
    }
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    client = _get_proxy_client()
    try:
        req = client.build_request(request.method, url, headers=headers)
        resp = await client.send(req, stream=True)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Proxy connection failed: {exc}")

    if resp.status_code in (403, 410):
        print(f"[PROXY CACHE-BUST] Upstream returned {resp.status_code} for expired CDN URL. Invalidating cache.")
        await resp.aclose()
        cache.invalidate_pattern("stream_resolve:")
        return Response(
            status_code=resp.status_code,
            content="Upstream CDN token expired; cache cleared",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Cache-Control": "no-cache, no-store, must-revalidate"
            }
        )

    status_code = resp.status_code if resp.status_code in (200, 206) else resp.status_code
    response_headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": resp.headers.get("content-type", "video/mp4"),
        "Content-Length": resp.headers.get("content-length", ""),
        "Content-Range": resp.headers.get("content-range", ""),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
        "Cache-Control": "public, max-age=3600",
    }
    # Clean empty headers
    response_headers = {k: v for k, v in response_headers.items() if v}

    if request.method == "HEAD":
        await resp.aclose()
        await client.aclose()
        return Response(status_code=status_code, headers=response_headers)

    async def stream_generator():
        try:
            async for chunk in resp.aiter_bytes(chunk_size=65536):  # 64KB low-latency chunks
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_generator(),
        status_code=status_code,
        headers=response_headers
    )
