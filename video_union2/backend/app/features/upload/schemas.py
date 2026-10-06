from pydantic import BaseModel


class VideoResponse(BaseModel):
    """アップロード済みの動画。幅・高さは回転を反映した表示サイズ。"""

    id: str
    file_name: str
    duration_seconds: float
    width: int
    height: int
