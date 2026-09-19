import re
import yt_dlp
from typing import Dict, Any, List

BASE_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "noplaylist": True,
    "ignoreerrors": False,
    "retries": 3,
    "nocheckcertificate": True,
    "user_agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
}

URL_RE = re.compile(r"^(https?://|www\.|youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com|tiktok\.com|vimeo\.com|dailymotion\.com)", re.IGNORECASE)

def is_youtube_url(s: str) -> bool:
    if not s:
        return False
    s = s.lower()
    return ("youtube.com" in s) or ("youtu.be" in s)

def is_url(s: str) -> bool:
    if not s:
        return False
    s = s.strip()
    if s.startswith("http://") or s.startswith("https://"):
        return True
    return bool(URL_RE.match(s))

def _clean_format(f: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "format_id": f.get("format_id"),
        "url": f.get("url"),
        "ext": f.get("ext"),
        "resolution": f.get("resolution"),
        "height": f.get("height"),
        "width": f.get("width"),
        "fps": f.get("fps"),
        "filesize": f.get("filesize"),
        "filesize_approx": f.get("filesize_approx"),
        "tbr": f.get("tbr"),
        "vcodec": f.get("vcodec"),
        "acodec": f.get("acodec"),
        "abr": f.get("abr"),
        "asr": f.get("asr"),
        "protocol": f.get("protocol"),
        "format_note": f.get("format_note"),
    }

def _human_size(n):
    if not n:
        return "—"
    try:
        n = int(n)
    except Exception:
        return "—"
    for unit in ["B", "KB", "MB", "GB"]:
        if n < 1024:
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024.0
    return f"{n:.1f} TB"

def extract(url: str) -> Dict[str, Any]:
    """Universal extraction: InnerTube turbo for YouTube, yt-dlp for IG/FB/X + full download list."""
    # Turbo path: YouTube -> fast_player first (sub-second streaming metadata + progressive play URL)
    if is_youtube_url(url):
        try:
            from app import innertube as _it
            vid = _it.extract_video_id(url)
            if vid:
                turbo = _it.fast_player_sync(vid)
                # if turbo got playable streams, merge full yt-dlp download formats in background? No - return turbo immediately for speed.
                # Enrich with yt-dlp full list only if turbo lacks download variety (<3 video streams)
                if turbo.get("default_play_url") and len(turbo.get("video_streams", [])) >= 3:
                    return turbo
                # else fall through to yt-dlp full extraction below, then merge turbo playable on top
                try:
                    full = _extract_ytdlp(url)
                    # prefer turbo playable/default (android progressive with sound) over DASH-only full
                    if turbo.get("default_play_url"):
                        full["default_play_url"] = turbo["default_play_url"]
                        full["playable_streams"] = turbo.get("playable_streams", []) or full.get("playable_streams", [])
                        if turbo.get("progressive_streams"):
                            # merge unique progressive
                            seen = {(f.get("format_id"), f.get("url")) for f in full.get("progressive_streams", [])}
                            for f in turbo["progressive_streams"]:
                                if (f.get("format_id"), f.get("url")) not in seen:
                                    full["progressive_streams"].append(f)
                    return full
                except Exception:
                    return turbo
        except Exception:
            pass
    return _extract_ytdlp(url)


def _extract_ytdlp(url: str) -> Dict[str, Any]:
    """Full yt-dlp extraction (download formats + IG/FB/X support)."""
    opts = {**BASE_OPTS}
    # For social sites, allow playlist=False but single video; keep noplaylist True
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if isinstance(info, dict) and info.get("_type") == "playlist" and info.get("entries"):
            # take first valid entry
            entries = [e for e in info["entries"] if e]
            info = entries[0] if entries else info

        formats = info.get("formats", []) or []
        # Some IG/FB direct links have no formats list but direct url
        if not formats and info.get("url"):
            formats = [{
                "format_id": "direct",
                "url": info.get("url"),
                "ext": info.get("ext", "mp4"),
                "height": info.get("height"),
                "width": info.get("width"),
                "vcodec": "h264",
                "acodec": "aac",
                "filesize": None,
                "filesize_approx": None,
            }]

        video_streams: List[Dict[str, Any]] = []
        audio_streams: List[Dict[str, Any]] = []
        progressive_streams: List[Dict[str, Any]] = []
        resolutions_set = set()

        for f in formats:
            if not f.get("url"):
                continue
            # skip storyboard / mhtml
            if f.get("ext") in ("mhtml",):
                continue
            proto = (f.get("protocol") or "")
            # keep http/https/hls/dash; skip weird
            vcodec = f.get("vcodec")
            acodec = f.get("acodec")
            h = f.get("height")
            if h:
                # normalize to standard buckets but keep original too
                resolutions_set.add(f"{h}p")
            clean = _clean_format(f)
            # attach human size
            sz = clean.get("filesize") or clean.get("filesize_approx")
            clean["filesize_human"] = _human_size(sz)

            is_video_only = vcodec not in (None, "none") and acodec in (None, "none")
            is_audio_only = acodec not in (None, "none") and vcodec in (None, "none")
            is_progressive = (vcodec not in (None, "none") and acodec not in (None, "none"))
            if is_progressive:
                progressive_streams.append(clean)
            elif is_video_only:
                video_streams.append(clean)
            elif is_audio_only:
                audio_streams.append(clean)
            else:
                # unknown (e.g. images) -> treat as progressive if has video
                if vcodec not in (None, "none"):
                    progressive_streams.append(clean)

        video_streams.sort(key=lambda x: (x.get("height") or 0), reverse=True)
        progressive_streams.sort(key=lambda x: (x.get("height") or 0), reverse=True)
        audio_streams.sort(key=lambda x: (x.get("abr") or 0), reverse=True)

        # YouTube DASH-only fix: web client gives no progressive; retry with android client to get 360p MP4 with sound
        if not progressive_streams:
            try:
                android_opts = {**BASE_OPTS, "extractor_args": {"youtube": {"player_client": ["android"]}}}
                with yt_dlp.YoutubeDL(android_opts) as ydl2:
                    info2 = ydl2.extract_info(url, download=False)
                    if isinstance(info2, dict) and info2.get("_type") == "playlist" and info2.get("entries"):
                        entries2 = [e for e in info2["entries"] if e]
                        info2 = entries2[0] if entries2 else info2
                    for f in (info2.get("formats", []) or []):
                        if not f.get("url"):
                            continue
                        if f.get("vcodec") in (None, "none") or f.get("acodec") in (None, "none"):
                            continue
                        if f.get("ext") in ("mhtml",):
                            continue
                        clean = _clean_format(f)
                        sz = clean.get("filesize") or clean.get("filesize_approx")
                        clean["filesize_human"] = _human_size(sz)
                        # avoid dupes by format_id
                        if any(p.get("format_id") == clean.get("format_id") and p.get("url") == clean.get("url") for p in progressive_streams):
                            continue
                        progressive_streams.append(clean)
                        h2 = clean.get("height")
                        if h2:
                            resolutions_set.add(f"{h2}p")
                    progressive_streams.sort(key=lambda x: (x.get("height") or 0), reverse=True)
            except Exception:
                pass

        # --- Playback fix: separate playable streaming URLs from raw DASH download formats ---
        # Playable = progressive (vcodec != 'none' and acodec != 'none') over http/https, browser <video> can play with sound.
        # DASH (video-only 1080p/1440p/4K) stays in video_streams for the download engine only.
        def _is_playable(f: Dict[str, Any]) -> bool:
            if not f.get("url"):
                return False
            if f.get("vcodec") in (None, "none"):
                return False
            if f.get("acodec") in (None, "none"):
                return False
            proto = (f.get("protocol") or "").lower()
            # allow http/https progressive mp4; skip hls/dash manifests that often fail in <video>
            ext = (f.get("ext") or "").lower()
            if ext not in ("mp4", "webm", "mov", "m4v"):
                # still allow mp4-family only for reliable playback
                if ext != "mp4":
                    return False
            if "m3u8" in (f.get("url") or "") or "mpd" in (f.get("url") or ""):
                return False
            return True

        playable_streams = [f for f in progressive_streams if _is_playable(f)]
        # fallback: any progressive with url even if ext odd (e.g. IG direct)
        if not playable_streams:
            playable_streams = [f for f in progressive_streams if f.get("url")]
        playable_streams.sort(key=lambda x: (x.get("height") or 0), reverse=True)

        # Best progressive stream as default (prefer 720p/360p MP4 for instant play, else highest playable)
        default_play_url = None
        if playable_streams:
            # prefer 720p first for speed, else highest
            pref = next((f for f in playable_streams if f.get("height") == 720), None)
            if pref is None:
                pref = next((f for f in playable_streams if (f.get("height") or 0) <= 720), playable_streams[0])
            default_play_url = pref.get("url")
        # last-resort preview (muted) when no progressive exists at all
        if not default_play_url and video_streams:
            https_mp4 = [f for f in video_streams if (f.get("ext") == "mp4" and "m3u8" not in (f.get("url") or "") and "mpd" not in (f.get("url") or ""))]
            pool = https_mp4 or video_streams
            pool_sorted = sorted(pool, key=lambda x: (x.get("height") or 0))
            # prefer <=720p for fast preview
            prev = next((f for f in pool_sorted if (f.get("height") or 0) <= 720), pool_sorted[0] if pool_sorted else None)
            if prev:
                default_play_url = prev.get("url")

        def _rk(r: str) -> int:
            try:
                return int(r.replace("p", ""))
            except Exception:
                return 0
        resolutions = sorted(list(resolutions_set), key=_rk)

        # Ensure standard labels exist in order for UI even if missing (UI will disable missing)
        # but keep only detected to avoid fake buttons; frontend handles 144p-2160p mapping

        duration = info.get("duration")
        # duration string
        dur_str = None
        if isinstance(duration, (int, float)):
            m, s = divmod(int(duration), 60)
            h, m = divmod(m, 60)
            dur_str = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"

        return {
            "title": info.get("title"),
            "duration": duration if isinstance(duration, int) else None,
            "duration_string": dur_str,
            "thumbnail": info.get("thumbnail"),
            "uploader": info.get("uploader") or info.get("channel") or info.get("uploader_id"),
            "channel": info.get("channel") or info.get("uploader") or info.get("uploader_id"),
            "view_count": info.get("view_count"),
            "like_count": info.get("like_count"),
            "webpage_url": info.get("webpage_url") or url,
            "extractor": info.get("extractor"),
            "resolutions": resolutions,
            "video_streams": video_streams,
            "audio_streams": audio_streams,
            "progressive_streams": progressive_streams,
            "playable_streams": playable_streams,
            "default_play_url": default_play_url,
        }

def search(query: str, max_results: int = 8) -> Dict[str, Any]:
    # Turbo first: direct InnerTube (200-400ms warm), fallback yt-dlp
    try:
        from app import innertube as _it
        turbo = _it.fast_search_sync(query, max_results=max_results)
        if turbo.get("results"):
            return {"query": query, "results": turbo["results"][:max_results]}
    except Exception:
        pass
    opts = {
        "extract_flat": True,
        "skip_download": True,
        "ignoreerrors": True,
        "quiet": True,
        "no_warnings": True,
    }
    search_str = f"ytsearch12:{query}"
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(search_str, download=False)
        entries = info.get("entries", []) or []
        results = []
        for entry in entries:
            if not entry:
                continue
            vid = entry.get("id")
            title = entry.get("title")
            if not vid or not title:
                continue
            # skip deleted/private placeholders that slip through
            if title in ("[Deleted video]", "[Private video]"):
                continue
            results.append({
                "id": entry["id"],
                "title": entry.get("title"),
                "url": f'https://www.youtube.com/watch?v={entry["id"]}',
                "thumbnail": entry.get("thumbnail") or f'https://i.ytimg.com/vi/{entry["id"]}/hqdefault.jpg',
                "duration": entry.get("duration_string") or entry.get("duration"),
                "channel": entry.get("uploader") or entry.get("channel"),
                "uploader": entry.get("uploader") or entry.get("channel"),
            })
            if len(results) >= max_results:
                break
        return {"query": query, "results": results}

def smart(query_or_url: str, max_results: int = 8) -> Dict[str, Any]:
    """Keyword detection: URL -> extract, raw text -> search."""
    s = (query_or_url or "").strip()
    if is_url(s):
        # ensure scheme
        if s.startswith("www."):
            s = "https://" + s
        return {"type": "extract", "data": extract(s)}
    else:
        return {"type": "search", "data": search(s, max_results=max_results)}
