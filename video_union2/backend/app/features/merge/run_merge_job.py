import asyncio
import shutil
import time
from pathlib import Path

from app.features.merge.build_concat_args import build_concat_args
from app.features.merge.build_concat_list import build_concat_list
from app.features.merge.build_normalize_args import build_normalize_args
from app.features.merge.build_text_scene_args import build_text_scene_args
from app.features.merge.calculate_progress import calculate_progress
from app.features.merge.layout_text_scene import TextSceneLayoutError
from app.features.merge.merge_job_store import MergeJob
from app.features.merge.merge_segment import MergeSegment, TextScene
from app.features.merge.merge_source import MergeSource
from app.features.merge.parse_progress import parse_progress
from app.features.merge.plan_output_format import OutputFormat, plan_output_format
from app.features.merge.render_text_scene import render_text_scene
from app.features.merge.text_scene_duration import text_scene_duration
from app.lib.config import Settings
from app.lib.disk_storage import DiskStorage
from app.lib.logger import log_error, log_info
from app.lib.run_process import run_process

_NAME = "merge.run_merge_job"
_MIN_TIMEOUT_SECONDS = 60


async def run_merge_job(
    job: MergeJob, segments: list[MergeSegment], settings: Settings, storage: DiskStorage, font_path: Path
) -> None:
    """動画とテキストの場面を1つずつ中間ファイルに揃えてからつなぎ、ジョブの状態を更新する。

    失敗したら記録し、途中のファイルを消し、状態を failed にしてから元の例外を再送出する。
    テキストの本文はログに出さない。
    """
    started = time.monotonic()
    sources = [s for s in segments if isinstance(s, MergeSource)]
    video_ids = [s.video_id for s in sources]
    text_scene_count = len(segments) - len(sources)
    parts_dir = storage.merge_parts_dir(job.id)
    list_path = storage.merge_list_path(job.id)
    partial = storage.merge_result_partial_path(job.id)
    current_index = 0
    current_step = None
    output = None
    try:
        output = plan_output_format(sources, settings.max_fps)
        parts_dir.mkdir(parents=True, exist_ok=True)
        durations = [_duration_seconds(segment, output) for segment in segments]
        total = sum(durations)
        done = 0.0
        part_paths = []
        for index, (segment, duration) in enumerate(zip(segments, durations), start=1):
            current_index = index
            part = storage.merge_part_path(job.id, index)
            if isinstance(segment, TextScene):
                current_step = "render"
                image = storage.merge_text_image_path(job.id, index)
                await asyncio.to_thread(
                    render_text_scene, segment.lines,
                    width=output.width, height=output.height, font_path=font_path, image_path=image,
                )
                current_step = "encode"
                frames, _ = text_scene_duration(segment.duration_tenths, output)
                args = build_text_scene_args(
                    output, image_path=image, output_path=part, frames=frames, seconds=duration,
                    preset=settings.x264_preset, crf=settings.x264_crf,
                )
            else:
                current_step = None
                args = build_normalize_args(
                    segment, output,
                    input_path=storage.upload_video_path(segment.video_id), output_path=part,
                    preset=settings.x264_preset, crf=settings.x264_crf,
                )

            def on_line(line: str, done_so_far: float = done) -> None:
                seconds = parse_progress(line)
                if seconds is not None:
                    job.progress = calculate_progress(
                        done_seconds=done_so_far, current_seconds=seconds, total_seconds=total
                    )

            timeout = max(_MIN_TIMEOUT_SECONDS, duration * settings.ffmpeg_timeout_per_second)
            await run_process(args, timeout_seconds=timeout, on_stdout_line=on_line)
            part_paths.append(part)
            done += duration

        current_index = 0
        current_step = None
        list_path.write_text(build_concat_list(part_paths, parts_dir=parts_dir))
        await run_process(build_concat_args(list_path, partial), timeout_seconds=max(_MIN_TIMEOUT_SECONDS, total))
        shutil.rmtree(parts_dir)
        list_path.unlink()
        partial.replace(storage.merge_result_path(job.id))
    except BaseException as e:
        failed = segments[current_index - 1] if current_index else None
        # 記録や後片付けでさらに失敗しても、ジョブが running のまま残らないよう、先に状態を決める
        job.status = "failed"
        job.error_code = "merge_failed"
        job.error_message = _failure_message(current_index, failed)
        log_error(
            _NAME, "結合に失敗しました", err=e, video_ids=video_ids, text_scene_count=text_scene_count,
            failed_index=current_index or None,
            **_failure_fields(failed, e, current_step, output),
            ms=round((time.monotonic() - started) * 1000),
        )
        _cleanup_after_failure(e, video_ids, parts_dir, list_path, partial)
        raise

    job.progress = 1.0
    job.status = "succeeded"
    log_info(
        _NAME, "結合が完了しました", video_ids=video_ids, count=len(sources), text_scene_count=text_scene_count,
        width=output.width, height=output.height, duration_seconds=round(total, 3),
        ms=round((time.monotonic() - started) * 1000),
    )


def _duration_seconds(segment: MergeSegment, output: OutputFormat) -> float:
    if isinstance(segment, TextScene):
        return text_scene_duration(segment.duration_tenths, output)[1]
    return segment.duration_seconds


def _failure_message(index: int, failed: MergeSegment | None) -> str:
    if isinstance(failed, TextScene):
        return f"{index}番目のテキストの場面の作成に失敗しました"
    if isinstance(failed, MergeSource):
        return f"{index}番目の動画『{failed.file_name}』の変換に失敗しました"
    return "結合に失敗しました"


def _failure_fields(failed: MergeSegment | None, err: BaseException, step: str | None, output) -> dict:
    """失敗した入力の要約。テキストの場面は本文ではなく、行数・文字数・段階・出力サイズを出す。"""
    if isinstance(failed, MergeSource):
        return {"failed_video_id": failed.video_id}
    if isinstance(failed, TextScene):
        return {
            "failed_kind": "text",
            "failed_step": "layout" if isinstance(err, TextSceneLayoutError) else step,
            "width": output.width if output else None,
            "height": output.height if output else None,
            "line_count": len(failed.lines),
            "char_count": sum(len(line) for line in failed.lines),
        }
    return {"failed_video_id": None}


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
