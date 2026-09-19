from pydantic import BaseModel, Field
from typing import List, Optional, Any

class ExtractRequest(BaseModel):
    url: str = Field(..., description="Video page URL or raw search text")

class StreamFormat(BaseModel):
    format_id: Optional[str] = None
    url: Optional[str] = None
    ext: Optional[str] = None
    resolution: Optional[str] = None
    height: Optional[int] = None
    width: Optional[int] = None
    fps: Optional[float] = None
    filesize: Optional[int] = None
    filesize_approx: Optional[int] = None
    filesize_human: Optional[str] = None
    tbr: Optional[float] = None
    vcodec: Optional[str] = None
    acodec: Optional[str] = None
    abr: Optional[float] = None
    asr: Optional[int] = None
    protocol: Optional[str] = None
    format_note: Optional[str] = None

class ExtractResponse(BaseModel):
    title: Optional[str] = None
    duration: Optional[int] = None
    duration_string: Optional[str] = None
    thumbnail: Optional[str] = None
    uploader: Optional[str] = None
    channel: Optional[str] = None
    view_count: Optional[int] = None
    like_count: Optional[int] = None
    webpage_url: Optional[str] = None
    extractor: Optional[str] = None
    resolutions: List[str] = []
    video_streams: List[StreamFormat] = []
    audio_streams: List[StreamFormat] = []
    progressive_streams: List[StreamFormat] = []
    playable_streams: List[StreamFormat] = []
    default_play_url: Optional[str] = None

class SearchResultItem(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    url: Optional[str] = None
    duration: Optional[Any] = None
    thumbnail: Optional[str] = None
    uploader: Optional[str] = None
    channel: Optional[str] = None

class SearchResponse(BaseModel):
    query: str
    results: List[SearchResultItem] = []

class DownloadRequest(BaseModel):
    url: str
    quality: Optional[str] = "720"
    audio_only: Optional[bool] = False

class DownloadResponse(BaseModel):
    task_id: str
    status: str
