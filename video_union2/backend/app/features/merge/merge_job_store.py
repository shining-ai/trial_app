import asyncio
from dataclasses import dataclass, field

from app.lib.errors import AppError
from app.lib.generate_id import generate_id


@dataclass
class MergeJob:
    id: str
    video_ids: list[str]
    status: str = "running"
    progress: float = 0.0
    error_code: str | None = None
    error_message: str | None = None
    task: asyncio.Task | None = field(default=None, repr=False)


class MergeJobStore:
    """結合ジョブの状態をメモリに持ち、同時に実行できるジョブを1件にする。"""

    def __init__(self):
        self._jobs: dict[str, MergeJob] = {}

    def has_running(self) -> bool:
        return any(job.status == "running" for job in self._jobs.values())

    def create(self, video_ids: list[str]) -> MergeJob:
        if self.has_running():
            raise AppError(409, "merge_in_progress", "別の結合が実行中です")
        job = MergeJob(id=generate_id(), video_ids=list(video_ids))
        self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> MergeJob | None:
        return self._jobs.get(job_id)
