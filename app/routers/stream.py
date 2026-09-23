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


# Standard resolution ordering for clean UX display
QUALITY_ORDER = ["2160p", "1440p", "1080p", "720p", "480p", "360p", "240p", "144p"]


def extract_all_qualities(video_id: str):
    clean_id = extract_video_id(video_id) or video_id.strip()
    url = f"https://www.youtube.com/watch?v={clean_id}"
    formats = []
    title = ""
    channel = ""
    duration = 0
    description = ""
    view_count = 0
    like_count = 0
    upload_date = ""
    hls_url = None
    best_audio_url = None

    # 1. First query InnerTube fast_player_sync (bypasses YouTube datacenter/bot blocks)
    try:
        from app.innertube import fast_player_sync
        turbo = fast_player_sync(clean_id)
        if turbo:
            title = turbo.get("title") or title
            channel = turbo.get("channel") or turbo.get("uploader") or channel
            duration = turbo.get("duration") or duration
            description = turbo.get("description") or description
            view_count = turbo.get("view_count") or view_count
            like_count = turbo.get("like_count") or like_count
            upload_date = turbo.get("upload_date") or upload_date
            for s in (turbo.get("progressive_streams", []) + turbo.get("video_streams", [])):
                formats.append(s)
            audio_s = turbo.get("audio_streams", [])
            if audio_s:
                m4a_audio = [a for a in audio_s if a.get("ext") == "m4a" and a.get("url")]
                if m4a_audio:
                    best_audio_url = m4a_audio[0].get("url")
                elif audio_s[0].get("url"):
                    best_audio_url = audio_s[0].get("url")
    except Exception:
        pass

    # 2. Fallback / enrich with yt_dlp if needed (especially for HLS manifest and full audio tracks)
    try:
        ydl_opts = {
            'format': 'bestvideo+bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'skip_download': True,
            'nocheckcertificate': True,
            'user_agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        }
        import yt_dlp
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            hls_url = hls_url or info.get('manifest_url') or info.get('hls_manifest_url')
            title = title or info.get('title')
            channel = channel or info.get('uploader') or info.get('channel')
            duration = duration or info.get('duration')
            description = description or info.get('description', '') or ''
            view_count = view_count or info.get('view_count', 0)
            like_count = like_count or info.get('like_count', 0)
            upload_date = upload_date or info.get('upload_date', '') or info.get('release_date', '')

            yt_formats = info.get('formats', [])
            if not formats:
                formats = yt_formats

            # Standalone audio formats
            audio_formats = [
                f for f in yt_formats
                if f.get('acodec') not in (None, 'none') and f.get('vcodec') in (None, 'none') and f.get('url')
            ]
            if audio_formats:
                audio_formats.sort(key=lambda x: (x.get('ext') == 'm4a', x.get('abr') or 0), reverse=True)
                best_audio_url = audio_formats[0].get('url') or best_audio_url
    except Exception:
        pass

    qualities_map = {}

    # 3. Inspect all available formats
    for f in formats:
        height = f.get('height')
        if not height:
            continue
        res_label = f"{height}p"
        f_url = f.get('url')
        if not f_url:
            continue

        # Prioritize formats with audio, or store best available format stream
        is_progressive = f.get('vcodec') not in (None, 'none') and f.get('acodec') not in (None, 'none')
        ext = f.get('ext', 'mp4')

        if res_label not in qualities_map or is_progressive or (ext == 'mp4' and 'webm' in qualities_map[res_label].get('label', '')):
            qualities_map[res_label] = {
                "label": f"{res_label} • {ext}",
                "resolution": res_label,
                "height": height,
                "url": f_url,
                "format_id": f.get('format_id'),
                "has_audio": is_progressive,
                "audio_url": None if is_progressive else best_audio_url
            }

    # 4. Sort by highest resolution descending according to QUALITY_ORDER
    sorted_qualities = []
    for q in QUALITY_ORDER:
        if q in qualities_map:
            sorted_qualities.append(qualities_map[q])

    for k, v in sorted(qualities_map.items(), key=lambda x: x[1].get('height', 0), reverse=True):
        if v not in sorted_qualities:
            sorted_qualities.append(v)

    # Fallback if no formatted map generated
    if not sorted_qualities:
        sorted_qualities.append({
            "label": "Auto",
            "resolution": "auto",
            "height": 720,
            "url": f"/api/stream/{clean_id}",
            "has_audio": True,
            "audio_url": None
        })

    return {
        "id": clean_id,
        "title": title,
        "channel": channel,
        "duration": duration,
        "description": description,
        "view_count": view_count,
        "like_count": like_count,
        "upload_date": upload_date,
        "hls_manifest": hls_url,
        "audio_url": best_audio_url,
        "qualities": sorted_qualities,
        "default_stream": sorted_qualities[0]["url"] if sorted_qualities else None
    }


@router.get("/stream/resolve")
@router.get("/resolve")
async def resolve_video_stream(
    id: str = Query(None, description="YouTube Video ID"),
    url: str = Query(None, description="YouTube Video URL")
):
    target = id or url
    if not target:
        raise HTTPException(status_code=400, detail="Video ID or URL parameter is required")
    vid = extract_video_id(target) or target.strip()
    try:
        return await asyncio.to_thread(extract_all_qualities, vid)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to resolve video qualities: {str(e)}")


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
