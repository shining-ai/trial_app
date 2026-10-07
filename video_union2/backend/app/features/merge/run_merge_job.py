import shutil
import time

from app.features.merge.build_concat_args import build_concat_args
from app.features.merge.build_concat_list import build_concat_list
from app.features.merge.build_normalize_args import build_normalize_args
from app.features.merge.calculate_progress import calculate_progress
from app.features.merge.merge_job_store import MergeJob
from app.features.merge.merge_source import MergeSource
from app.features.merge.parse_progress import parse_progress
from app.features.merge.plan_output_format import plan_output_format
from app.lib.config import Settings
from app.lib.disk_storage import DiskStorage
from app.lib.logger import log_error, log_info
from app.lib.run_process import run_process

_NAME = "merge.run_merge_job"
_MIN_TIMEOUT_SECONDS = 60


async def run_merge_job(job: MergeJob, sources: list[MergeSource], settings: Settings, storage: DiskStorage) -> None:
    """1本ずつ揃えてからつなぎ、ジョブの状態を更新する。

    失敗したら記録し、途中のファイルを消し、状態を failed にしてから元の例外を再送出する。
    """
    started = time.monotonic()
    video_ids = [s.video_id for s in sources]
    parts_dir = storage.merge_parts_dir(job.id)
    list_path = storage.merge_list_path(job.id)
    partial = storage.merge_result_partial_path(job.id)
    current_index = 0
    try:
        output = plan_output_format(sources, settings.max_fps)
        parts_dir.mkdir(parents=True, exist_ok=True)
        total = sum(s.duration_seconds for s in sources)
        done = 0.0
        part_paths = []
        for index, source in enumerate(sources, start=1):
            current_index = index
            part = storage.merge_part_path(job.id, index)
            args = build_normalize_args(
                source, output,
                input_path=storage.upload_video_path(source.video_id), output_path=part,
                preset=settings.x264_preset, crf=settings.x264_crf,
            )

            def on_line(line: str, done_so_far: float = done) -> None:
                seconds = parse_progress(line)
                if seconds is not None:
                    job.progress = calculate_progress(
                        done_seconds=done_so_far, current_seconds=seconds, total_seconds=total
                    )

            timeout = max(_MIN_TIMEOUT_SECONDS, source.duration_seconds * settings.ffmpeg_timeout_per_second)
            await run_process(args, timeout_seconds=timeout, on_stdout_line=on_line)
            part_paths.append(part)
            done += source.duration_seconds

        current_index = 0
        list_path.write_text(build_concat_list(part_paths, parts_dir=parts_dir))
        await run_process(build_concat_args(list_path, partial), timeout_seconds=max(_MIN_TIMEOUT_SECONDS, total))
        shutil.rmtree(parts_dir)
        list_path.unlink()
        partial.replace(storage.merge_result_path(job.id))
    except BaseException as e:
        failed = sources[current_index - 1] if current_index else None
        # 記録や後片付けでさらに失敗しても、ジョブが running のまま残らないよう、先に状態を決める
        job.status = "failed"
        job.error_code = "merge_failed"
        job.error_message = (
            f"{current_index}番目の動画『{failed.file_name}』の変換に失敗しました" if failed else "結合に失敗しました"
        )
        log_error(
            _NAME, "結合に失敗しました", err=e, video_ids=video_ids,
            failed_index=current_index or None, failed_video_id=failed.video_id if failed else None,
            ms=round((time.monotonic() - started) * 1000),
        )
        _cleanup_after_failure(e, video_ids, parts_dir, list_path, partial)
        raise

    job.progress = 1.0
    job.status = "succeeded"
    log_info(
        _NAME, "結合が完了しました", video_ids=video_ids, count=len(sources),
        width=output.width, height=output.height, duration_seconds=round(total, 3),
        ms=round((time.monotonic() - started) * 1000),
    )


def _cleanup_after_failure(original: BaseException, video_ids: list[str], parts_dir, list_path, partial) -> None:
    """失敗した結合の途中のファイルを消す。消せなければ記録し、元の例外に添える。"""
    for remove in (
        lambda: shutil.rmtree(parts_dir, ignore_errors=False) if parts_dir.exists() else None,
        lambda: list_path.unlink(missing_ok=True),
        lambda: partial.unlink(missing_ok=True),
    ):
        try:
            remove()
        except OSError as cleanup_error:
            log_error(_NAME, "失敗した結合の後片付けに失敗しました", err=cleanup_error, video_ids=video_ids)
            original.add_note(f"後片付けにも失敗しました: {type(cleanup_error).__name__}")
