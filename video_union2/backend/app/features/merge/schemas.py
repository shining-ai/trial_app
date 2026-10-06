from typing import Literal

from pydantic import BaseModel


class MergeRequest(BaseModel):
    """結合の依頼。video_ids は並び順どおり。ID の形式と存在は load_merge_sources で確かめる。"""

    video_ids: list[str]


class ErrorDetail(BaseModel):
    code: str
    message: str


class MergeJobResponse(BaseModel):
    id: str
    status: Literal["running", "succeeded", "failed"]
    progress: float
    error: ErrorDetail | None
