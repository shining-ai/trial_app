import pytest

from app.features.upload.delete_video import delete_video
from app.lib.disk_storage import DiskStorage
from app.lib.errors import AppError


def test_each_not_found_error_is_a_new_exception(tmp_path):
    storage = DiskStorage(tmp_path)

    with pytest.raises(AppError) as first:
        delete_video("0" * 32, storage)
    with pytest.raises(AppError) as second:
        delete_video("1" * 32, storage)

    assert first.value is not second.value


def test_failed_deletion_is_logged_with_ms_and_raised(tmp_path, caplog):
    import logging

    caplog.set_level(logging.INFO)
    storage = DiskStorage(tmp_path)
    video_id = "0" * 32
    storage.uploads_dir().mkdir(parents=True)
    # .bin の名前でフォルダを置き、unlink を失敗させる
    storage.upload_video_path(video_id).mkdir()

    with pytest.raises(OSError):
        delete_video(video_id, storage)

    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert errors[0].fields["video_ids"] == [video_id]
    assert "ms" in errors[0].fields and "err" in errors[0].fields
