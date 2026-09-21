"""Feed and Search domain models."""
from pydantic import BaseModel
from typing import List, Optional, Any


class SearchResultItem(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    url: Optional[str] = None
    duration: Optional[Any] = None
    duration_str: Optional[str] = None
    thumbnail: Optional[str] = None
    uploader: Optional[str] = None
    uploader_id: Optional[str] = None
    channel: Optional[str] = None
    channelTitle: Optional[str] = None
    views: Optional[Any] = None
    view_count: Optional[Any] = None
    publishedTime: Optional[str] = None
    channelAvatar: Optional[str] = None
    description: Optional[str] = None
    isLive: Optional[bool] = False
    sub_topic: Optional[str] = None

    class Config:
        extra = "allow"


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResultItem] = []
