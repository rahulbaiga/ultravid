"""Background async download queue using yt-dlp + ffmpeg."""
import os
import uuid
import threading
import time
from typing import Dict, Any
import yt_dlp

DOWNLOAD_DIR = os.path.join(os.path.dirname(__file__), "downloads")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

TASKS: Dict[str, Dict[str, Any]] = {}
LOCK = threading.Lock()

def _set(task_id: str, **kwargs):
    with LOCK:
        if task_id in TASKS:
            TASKS[task_id].update(kwargs)

def _progress_hook(task_id: str):
    def hook(d):
        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes") or 0
            pct = (downloaded / total * 100) if total else 0
            _set(task_id, percent=round(pct, 1), status="downloading",
                 filename=os.path.basename(d.get("filename", "")))
        elif status == "finished":
            _set(task_id, percent=100, status="processing",
                 filename=os.path.basename(d.get("filename", "")))
    return hook

def _worker(task_id: str, url: str, quality: str, audio_only: bool):
    try:
        _set(task_id, status="downloading", percent=0)
        # quality: e.g. "720", "1080", "best", "4k" -> height filter
        # audio_only -> mp3
        outtmpl = os.path.join(DOWNLOAD_DIR, "%(title).80s-%(id)s.%(ext)s")

        if audio_only:
            ydl_opts = {
                "format": "bestaudio/best",
                "outtmpl": outtmpl,
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "postprocessors": [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }],
                "progress_hooks": [_progress_hook(task_id)],
                "retries": 3,
                "nocheckcertificate": True,
            }
        else:
            # Merge requested video quality with best audio, fast -c copy into mp4
            # Use format selector: bestvideo[height<=Q]+bestaudio/best
            try:
                q = int(str(quality).replace("p", "").replace("4k", "2160"))
            except Exception:
                q = None
            if q:
                fmt = f"bestvideo[height<={q}]+bestaudio/best[height<={q}]/best"
            else:
                fmt = "bestvideo+bestaudio/best"
            ydl_opts = {
                "format": fmt,
                "outtmpl": outtmpl,
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "merge_output_format": "mp4",
                "postprocessors": [{
                    "key": "FFmpegVideoConvertor" if False else "FFmpegMerger",
                }],
                # fast merge, no re-encode lag: yt-dlp + ffmpeg defaults to -c copy for merger
                "postprocessor_args": ["-c", "copy"] if False else None,
                "progress_hooks": [_progress_hook(task_id)],
                "retries": 3,
                "nocheckcertificate": True,
            }
            # Note: FFmpegMerger uses -c copy automatically; keep fast.

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            # resolve final filename
            fname = ydl.prepare_filename(info)
            # if audio_only, ext becomes mp3
            if audio_only:
                base = os.path.splitext(fname)[0] + ".mp3"
                # yt-dlp may have different title truncation; find newest mp3
                if not os.path.exists(base):
                    # fallback: list dir newest
                    files = sorted(
                        [os.path.join(DOWNLOAD_DIR, f) for f in os.listdir(DOWNLOAD_DIR)],
                        key=lambda p: os.path.getmtime(p) if os.path.exists(p) else 0,
                        reverse=True,
                    )
                    base = files[0] if files else fname
                fname = base
            else:
                # merger may output mp4 even if fname is webm/mkv
                if not os.path.exists(fname):
                    base_noext = os.path.splitext(fname)[0]
                    for ext in (".mp4", ".webm", ".mkv"):
                        if os.path.exists(base_noext + ext):
                            fname = base_noext + ext
                            break
            _set(task_id, status="done", percent=100,
                 filename=os.path.basename(fname), filepath=fname)
    except Exception as e:
        _set(task_id, status="error", error=str(e))

def start_download(url: str, quality: str = "720", audio_only: bool = False) -> str:
    task_id = uuid.uuid4().hex[:12]
    with LOCK:
        TASKS[task_id] = {
            "task_id": task_id,
            "url": url,
            "quality": quality,
            "audio_only": audio_only,
            "status": "queued",
            "percent": 0,
            "filename": None,
            "filepath": None,
            "error": None,
            "created_at": time.time(),
        }
    t = threading.Thread(target=_worker, args=(task_id, url, quality, audio_only), daemon=True)
    t.start()
    return task_id

def get_status(task_id: str):
    with LOCK:
        return TASKS.get(task_id)
