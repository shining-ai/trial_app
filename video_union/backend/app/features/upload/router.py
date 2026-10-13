from urllib.parse import unquote

from fastapi import APIRouter, Request, Response

from app.features.upload.delete_video import delete_video
from app.features.upload.schemas import VideoResponse
from app.features.upload.upload_video import upload_video
from app.lib.errors import AppError

router = APIRouter()


@router.post("/api/videos", status_code=201, response_model=VideoResponse)
async def post_video(request: Request) -> VideoResponse:
    raw_name = request.headers.get("x-file-name")
    if not raw_name:
        raise AppError(422, "file_name_required", "ファイル名がありません")
    raw_length = request.headers.get("content-length")
    declared_size = int(raw_length) if raw_length and raw_length.isdigit() else None
    return await upload_video(
        request.stream(), unquote(raw_name), declared_size, request.app.state.settings, request.app.state.storage
    )


@router.delete("/api/videos/{video_id}", status_code=204)
def remove_video(video_id: str, request: Request) -> Response:
    delete_video(video_id, request.app.state.storage)
    return Response(status_code=204)
