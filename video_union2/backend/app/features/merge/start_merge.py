import asyncio
import shutil

from app.features.merge.load_merge_sources import load_merge_sources
from app.features.merge.merge_job_store import MergeJob, MergeJobStore
from app.features.merge.run_merge_job import run_merge_job
from app.features.merge.validate_merge_request import validate_merge_request
from app.lib.config import Settings
from app.lib.disk_space import free_bytes
from app.lib.disk_storage import DiskStorage
from app.lib.errors import AppError
from app.lib.logger import log_error


def start_merge(video_ids: list[str], settings: Settings, storage: DiskStorage, store: MergeJobStore) -> MergeJob:
    """確認 → 前回の結果の削除 → ジョブの登録と開始を行う。"""
    sources = load_merge_sources(video_ids, storage)
    failure = validate_merge_request(sources, free_bytes=free_bytes(storage.merges_dir()), settings=settings)
    if failure is not None:
        raise AppError(failure.status, failure.code, failure.message)
    if store.has_running():
        raise AppError(409, "merge_in_progress", "別の結合が実行中です")

    _remove_previous_results(storage, video_ids)
    job = store.create(video_ids)
    job.task = asyncio.create_task(run_merge_job(job, sources, settings, storage))
    job.task.add_done_callback(_retrieve_exception)
    return job


def _remove_previous_results(storage: DiskStorage, video_ids: list[str]) -> None:
    merges = storage.merges_dir()
    if not merges.exists():
        return
    for entry in merges.iterdir():
        try:
            shutil.rmtree(entry) if entry.is_dir() else entry.unlink()
        except OSError as e:
            log_error("merge.start_merge", "前回の結合結果の削除に失敗しました", err=e, video_ids=video_ids)
            raise


def _retrieve_exception(task: asyncio.Task) -> None:
    """ジョブの例外を受け取る(記録は run_merge_job で済んでいる)。"""
    if not task.cancelled():
        task.exception()
