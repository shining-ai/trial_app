from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from app.features.download.find_download import find_download

router = APIRouter()


@router.get("/api/merges/{job_id}/download")
def download_merge(job_id: str, request: Request) -> FileResponse:
    path, file_name = find_download(job_id, request.app.state.storage)
    return FileResponse(path, media_type="video/mp4", filename=file_name)
