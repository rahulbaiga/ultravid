"""Low-latency 206 Partial Content Streaming Proxy Router."""
import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse

router = APIRouter(tags=["Proxy"])


@router.api_route("/proxy", methods=["GET", "HEAD"])
async def stream_proxy(request: Request, url: str = Query(...)):
    """Streaming reverse proxy for media streams with low-latency 64KB chunk yielding.
    Faithfully forwards HTTP Range headers and resolves CORS and 206 Partial Content.
    """
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Invalid stream url")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.youtube.com/",
        "Accept": "*/*",
        "Connection": "keep-alive",
    }
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    client = httpx.AsyncClient(follow_redirects=True, timeout=20.0)
    try:
        req = client.build_request(request.method, url, headers=headers)
        resp = await client.send(req, stream=True)
    except Exception as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Proxy connection failed: {exc}")

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
