"""Video details and metadata inspection router."""
from fastapi import APIRouter, HTTPException
from app.services.extractor import get_stream_info
from app.services.innertube import extract_video_id

router = APIRouter(tags=["Details"])


@router.get("/info/{video_id}")
async def api_video_info(video_id: str):
    """Returns detailed video metadata, playable formats, and stream specifications."""
    try:
        vid = extract_video_id(video_id) or video_id.strip()
        data = await get_stream_info(vid)
        if not data:
            raise HTTPException(status_code=404, detail="Video details not found")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch video details: {e}")
