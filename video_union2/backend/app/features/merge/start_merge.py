import asyncio
import shutil

from app.features.merge.build_merge_segments import build_merge_segments
from app.features.merge.load_merge_sources import load_merge_sources
from app.features.merge.load_scene_font import SceneFont
from app.features.merge.merge_job_store import MergeJob, MergeJobStore
from app.features.merge.normalize_text_items import normalize_text_items
from app.features.merge.run_merge_job import run_merge_job
from app.features.merge.schemas import TextItem, VideoItem
from app.features.merge.validate_merge_items import validate_merge_items
from app.features.merge.validate_merge_request import MergeRequestFailure, validate_merge_request
from app.lib.config import Settings
from app.lib.disk_space import directory_size, free_bytes
from app.lib.disk_storage import DiskStorage
from app.lib.errors import AppError
from app.lib.logger import log_error


def start_merge(
    items: list[VideoItem | TextItem], settings: Settings, storage: DiskStorage, store: MergeJobStore, font: SceneFont
) -> MergeJob:
    """確認 → 前回の結果の削除 → ジョブの登録と開始を行う。"""
    _raise_if_failed(validate_merge_items(items, settings))
    text_scenes = normalize_text_items(items, font.code_points)
    _raise_if_failed(text_scenes if isinstance(text_scenes, MergeRequestFailure) else None)
    video_ids = [item.video_id for item in items if isinstance(item, VideoItem)]
    sources = load_merge_sources(video_ids, storage)
    segments = build_merge_segments(items, text_scenes, sources)
    # 前回の結果は開始時に消すため、その分も使える容量に数える
    available = free_bytes(storage.merges_dir()) + directory_size(storage.merges_dir())
    _raise_if_failed(validate_merge_request(segments, free_bytes=available, settings=settings))
    if store.has_running():
        raise AppError(409, "merge_in_progress", "別の結合が実行中です")

    _remove_previous_results(storage, video_ids)
    job = store.create(video_ids)
    job.task = asyncio.create_task(run_merge_job(job, segments, settings, storage, font.path))
    job.task.add_done_callback(_retrieve_exception)
    return job


def _raise_if_failed(failure: MergeRequestFailure | None) -> None:
    if failure is not None:
        raise AppError(failure.status, failure.code, failure.message)


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
