"""Streaming extraction, proxy, and playback resolution router."""
import asyncio
import time
import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse

from app.models.video import ExtractRequest, ExtractResponse
from app.services import extractor
from app.services.innertube import extract_video_id, fast_player, fetch_innertube_player, fetch_innertube_player_sync
from app.core.cache import cache
from app.routers.proxy import stream_proxy

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

        # YouTube -> fast_player / fetch_innertube_player turbo first, yt-dlp fallback inside extractor.extract
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
    # 0. First query InnerTube fetch_innertube_player_sync (<150ms instant)
    try:
        fast_res = fetch_innertube_player_sync(clean_id)
        if fast_res and fast_res.get("qualities"):
            return fast_res
    except Exception:
        pass

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

    # 1. Query InnerTube fast_player_sync (bypasses YouTube datacenter/bot blocks)
    try:
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

    # 2. Fallback / enrich with yt_dlp ONLY if formats is still empty
    if not formats:
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

    # Check if an existing HLS / .m3u8 manifest is present
    for f in formats:
        f_url = f.get('url', '')
        if ('m3u8' in f_url or 'm3u8' in str(f.get('protocol', ''))) and not hls_url:
            hls_url = f_url
            break

    # If adaptive manifest present, pass it as primary stream source
    # If only discrete progressive/DASH formats exist, dynamically reference master.m3u8
    master_manifest_url = hls_url if hls_url else f"/api/stream/manifest/{clean_id}.m3u8"

    return {
        "id": clean_id,
        "title": title,
        "channel": channel,
        "duration": duration,
        "description": description,
        "view_count": view_count,
        "like_count": like_count,
        "upload_date": upload_date,
        "hls_manifest": master_manifest_url,
        "audio_url": best_audio_url,
        "qualities": sorted_qualities,
        "default_stream": sorted_qualities[0]["url"] if sorted_qualities else None
    }


_CACHE_TTL = 900  # 15 minutes (safe Google CDN token lifecycle)
_STREAM_CACHE = {}


def get_cached_qualities(video_id: str, force_refresh: bool = False):
    clean_id = extract_video_id(video_id) or video_id.strip()
    cache_key = f"stream_resolve:{clean_id}"
    if force_refresh:
        cache.delete(cache_key)
        _STREAM_CACHE.pop(clean_id, None)
    else:
        cached_data = cache.get(cache_key)
        if cached_data:
            return cached_data

        # Check local dictionary
        now = time.time()
        if clean_id in _STREAM_CACHE:
            ts, data = _STREAM_CACHE[clean_id]
            if now - ts < _CACHE_TTL:
                cache.set(cache_key, data, ttl=_CACHE_TTL)
                return data

    now = time.time()
    try:
        fast_res = fetch_innertube_player_sync(clean_id)
        if fast_res and fast_res.get("qualities"):
            cache.set(cache_key, fast_res, ttl=_CACHE_TTL)
            _STREAM_CACHE[clean_id] = (now, fast_res)
            return fast_res
    except Exception:
        pass

    data = extract_all_qualities(clean_id)
    if data:
        cache.set(cache_key, data, ttl=_CACHE_TTL)
        _STREAM_CACHE[clean_id] = (now, data)
    return data


@router.get("/stream/manifest/{video_id}.m3u8")
@router.get("/manifest/{video_id}.m3u8")
async def get_master_manifest(video_id: str, request: Request):
    """Dynamic Master Multi-Variant HLS playlist (master.m3u8) for adaptive streaming."""
    clean_id = extract_video_id(video_id) or video_id.strip()
    data = await asyncio.to_thread(get_cached_qualities, clean_id)
    if not data:
        raise HTTPException(status_code=404, detail="Video stream not found")

    native_hls = data.get("hls_manifest")
    if native_hls and native_hls.startswith("http"):
        from fastapi.responses import RedirectResponse
        from urllib.parse import quote
        return RedirectResponse(url=f"/api/proxy?url={quote(native_hls)}")

    qualities = data.get("qualities", [])
    if not qualities:
        raise HTTPException(status_code=404, detail="No qualities available for manifest")

    best_audio = data.get("audio_url")

    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:4",
        "#EXT-X-INDEPENDENT-SEGMENTS",
    ]

    has_separate_audio = bool(best_audio)
    if has_separate_audio:
        audio_uri = f"/api/stream/variant/{clean_id}/audio.m3u8"
        lines.append(f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio-group",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="{audio_uri}"')

    bw_map = {
        2160: 15000000,
        1440: 8000000,
        1080: 4500000,
        720: 2200000,
        480: 1200000,
        360: 700000,
        240: 400000,
        144: 200000
    }

    for q in qualities:
        h = q.get("height") or 720
        w = int(h * 16 / 9)
        bw = bw_map.get(h, h * 3000)
        res_label = q.get("resolution") or f"{h}p"
        audio_param = ',AUDIO="audio-group"' if (has_separate_audio and not q.get("has_audio")) else ""
        lines.append(f'#EXT-X-STREAM-INF:BANDWIDTH={bw},RESOLUTION={w}x{h},NAME="{res_label}"{audio_param}')
        lines.append(f"/api/stream/variant/{clean_id}/{res_label}.m3u8")

    playlist_content = "\n".join(lines) + "\n"
    return Response(
        content=playlist_content,
        media_type="application/vnd.apple.mpegurl",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "public, max-age=3600"
        }
    )


@router.get("/stream/variant/{video_id}/{variant_id}.m3u8")
@router.get("/variant/{video_id}/{variant_id}.m3u8")
async def get_variant_manifest(video_id: str, variant_id: str, request: Request):
    """Dynamic variant media playlist for discrete video/audio streams."""
    clean_id = extract_video_id(video_id) or video_id.strip()
    data = await asyncio.to_thread(get_cached_qualities, clean_id)
    if not data:
        raise HTTPException(status_code=404, detail="Video stream not found")

    duration = float(data.get("duration") or 60.0)
    target_dur = max(int(duration) + 1, 1)

    media_url = None
    if variant_id == "audio":
        media_url = data.get("audio_url")
    else:
        qualities = data.get("qualities", [])
        for q in qualities:
            if q.get("resolution") == variant_id or q.get("label", "").startswith(variant_id):
                media_url = q.get("url")
                break
        if not media_url and qualities:
            media_url = qualities[0].get("url")

    if not media_url:
        raise HTTPException(status_code=404, detail=f"Variant {variant_id} stream URL not found")

    from urllib.parse import quote
    proxied_url = f"/api/proxy?url={quote(media_url)}"

    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:4",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        f"#EXT-X-TARGETDURATION:{target_dur}",
        "#EXT-X-MEDIA-SEQUENCE:0",
        f"#EXTINF:{duration:.3f},",
        proxied_url,
        "#EXT-X-ENDLIST"
    ]

    playlist_content = "\n".join(lines) + "\n"
    return Response(
        content=playlist_content,
        media_type="application/vnd.apple.mpegurl",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "public, max-age=3600"
        }
    )


@router.get("/stream/resolve")
@router.get("/resolve")
async def resolve_video_stream(
    id: str = Query(None, description="YouTube Video ID"),
    url: str = Query(None, description="YouTube Video URL"),
    force_refresh: bool = Query(False, description="Bypass cache and force fresh resolution")
):
    target = id or url
    if not target:
        raise HTTPException(status_code=400, detail="Video ID or URL parameter is required")
    vid = extract_video_id(target) or target.strip()
    cache_key = f"stream_resolve:{vid}"
    if force_refresh:
        cache.delete(cache_key)
        _STREAM_CACHE.pop(vid, None)
    else:
        cached_data = cache.get(cache_key)
        if cached_data:
            return cached_data

    # Step 1: Fast InnerTube path (<200ms)
    t0 = time.time()
    result = await fetch_innertube_player(vid)
    if result and result.get("qualities"):
        print(f"[STREAM RESOLVER] InnerTube hit in {(time.time() - t0)*1000:.1f}ms")
        cache.set(cache_key, result, ttl=_CACHE_TTL)  # 15 minutes
        _STREAM_CACHE[vid] = (time.time(), result)
        return result

    # Step 2: Fallback to yt-dlp only if InnerTube fails
    print(f"[STREAM RESOLVER] InnerTube missed, falling back to yt-dlp for {vid}")
    fallback_result = await asyncio.to_thread(extract_all_qualities, vid)
    if fallback_result:
        cache.set(cache_key, fallback_result, ttl=_CACHE_TTL)
        _STREAM_CACHE[vid] = (time.time(), fallback_result)
        return fallback_result

    raise HTTPException(status_code=404, detail="Stream formats unavailable")


@router.get("/stream", response_model=ExtractResponse)
async def api_stream_get(url: str = Query(..., description="Video URL to stream")):
    return await api_extract(ExtractRequest(url=url))


@router.get("/stream/{video_id}", response_model=ExtractResponse)
async def api_stream_by_id(video_id: str):
    url = f"https://www.youtube.com/watch?v={video_id}"
    return await api_extract(ExtractRequest(url=url))


@router.api_route("/proxy", methods=["GET", "HEAD"])
async def api_proxy(request: Request, url: str = Query(...)):
    """Streaming reverse proxy delegating to centralized proxy implementation."""
    return await stream_proxy(request, url)
