import time
from collections.abc import AsyncIterator

from app.features.upload.parse_probe_output import parse_probe_output
from app.features.upload.probe_video import probe_video
from app.features.upload.receive_upload import receive_upload
from app.features.upload.schemas import VideoResponse
from app.features.upload.validate_video_info import validate_video_info
from app.features.upload.video_metadata_store import write_metadata
from app.lib.config import Settings
from app.lib.disk_storage import DiskStorage
from app.lib.errors import AppError
from app.lib.generate_id import generate_id
from app.lib.logger import log_error, log_info
from app.lib.run_process import ProcessFailedError

_NAME = "upload.upload_video"


async def upload_video(
    chunks: AsyncIterator[bytes], file_name: str, settings: Settings, storage: DiskStorage
) -> VideoResponse:
    """受信 → ffprobe → 判定 → 本保存 → メタ情報の書き込みを行う。失敗したら作ったファイルを消す。"""
    started = time.monotonic()
    video_id = generate_id()
    temp = storage.upload_temp_path(video_id)
    video = storage.upload_video_path(video_id)
    metadata = storage.upload_metadata_path(video_id)
    try:
        size = await receive_upload(chunks, temp, settings.max_upload_bytes)
        try:
            info = parse_probe_output(await probe_video(temp, settings.ffprobe_timeout_seconds))
        except ProcessFailedError as e:
            raise AppError(422, "not_a_video", "動画として読み込めませんでした") from e
        failure = validate_video_info(info, settings)
        if failure is not None:
            raise AppError(422, failure.code, failure.message)
        temp.replace(video)
        write_metadata(metadata, video_id=video_id, file_name=file_name, size_bytes=size, info=info)
    except BaseException as e:
        log_error(_NAME, "アップロードに失敗しました", err=e, video_ids=[video_id],
                  ms=round((time.monotonic() - started) * 1000))
        _remove_quietly_with_note(e, video_id, temp, video, metadata)
        raise

    log_info(_NAME, "アップロードが完了しました", video_ids=[video_id], size_bytes=size,
             width=info.width, height=info.height, duration_seconds=info.duration_seconds,
             ms=round((time.monotonic() - started) * 1000))
    return VideoResponse(id=video_id, file_name=file_name, duration_seconds=info.duration_seconds,
                         width=info.width, height=info.height)


def _remove_quietly_with_note(original: BaseException, video_id: str, *paths) -> None:
    """失敗の後始末としてファイルを消す。消せなければ記録し、元の例外に添える。"""
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError as cleanup_error:
            log_error(_NAME, "失敗したアップロードの後片付けに失敗しました", err=cleanup_error, video_ids=[video_id])
            original.add_note(f"後片付けにも失敗しました: {type(cleanup_error).__name__}")
