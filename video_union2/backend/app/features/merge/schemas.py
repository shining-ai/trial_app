from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr


class VideoItem(BaseModel):
    """結合リストの動画。ID の形式と存在は load_merge_sources で確かめる。"""

    model_config = ConfigDict(extra="forbid")

    type: Literal["video"]
    video_id: StrictStr


class TextItem(BaseModel):
    """結合リストのテキストの場面。表示時間の範囲は validate_merge_items、中身は normalize_text_items で確かめる。"""

    model_config = ConfigDict(extra="forbid")

    type: Literal["text"]
    text: StrictStr
    duration_tenths: StrictInt


MergeRequestItem = Annotated[VideoItem | TextItem, Field(discriminator="type")]


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
