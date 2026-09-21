"""Offline media download router."""
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.models.video import DownloadRequest, DownloadResponse
from app.core.config import DOWNLOAD_DIR
from app import download_manager

router = APIRouter(tags=["Download"])


@router.post("/download", response_model=DownloadResponse)
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


@router.get("/downloads/status/{task_id}")
def api_download_status(task_id: str):
    st = download_manager.get_status(task_id)
    if not st:
        raise HTTPException(status_code=404, detail="task not found")
    return st


@router.get("/downloads/file/{filename}")
def api_download_file(filename: str):
    # Prevent path traversal attacks
    safe = os.path.basename(filename)
    fpath = os.path.join(DOWNLOAD_DIR, safe)
    if not os.path.exists(fpath):
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(fpath, filename=safe)
