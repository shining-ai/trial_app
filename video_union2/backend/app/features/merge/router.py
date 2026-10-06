from fastapi import APIRouter, Request

from app.features.merge.merge_job_store import MergeJob
from app.features.merge.schemas import ErrorDetail, MergeJobResponse, MergeRequest
from app.features.merge.start_merge import start_merge
from app.lib.errors import AppError

router = APIRouter()


@router.post("/api/merges", status_code=202, response_model=MergeJobResponse)
async def post_merge(body: MergeRequest, request: Request) -> MergeJobResponse:
    state = request.app.state
    return _to_response(start_merge(body.video_ids, state.settings, state.storage, state.merge_jobs))


@router.get("/api/merges/{job_id}", response_model=MergeJobResponse)
def get_merge(job_id: str, request: Request) -> MergeJobResponse:
    job = request.app.state.merge_jobs.get(job_id)
    if job is None:
        raise AppError(404, "merge_not_found", "指定された結合が見つかりません")
    return _to_response(job)


def _to_response(job: MergeJob) -> MergeJobResponse:
    error = ErrorDetail(code=job.error_code, message=job.error_message) if job.error_code else None
    return MergeJobResponse(id=job.id, status=job.status, progress=job.progress, error=error)
