import json

import pytest

from app.features.merge.load_merge_sources import load_merge_sources
from app.lib.disk_storage import DiskStorage
from app.lib.errors import AppError

VIDEO_ID = "0123456789abcdef0123456789abcdef"


@pytest.fixture
def storage(tmp_path):
    storage = DiskStorage(tmp_path / "data")
    storage.uploads_dir().mkdir(parents=True)
    return storage


def _write(storage, video_id, **overrides):
    data = {"version": 1, "id": video_id, "file_name": "a.mp4", "size_bytes": 10, "duration_seconds": 1.5,
            "width": 640, "height": 360, "fps_num": 30000, "fps_den": 1001, "has_audio": False, **overrides}
    storage.upload_metadata_path(video_id).write_text(json.dumps(data))
    storage.upload_video_path(video_id).write_bytes(b"video")


def test_metadata_is_read_into_merge_sources_in_request_order(storage):
    other = "fedcba9876543210fedcba9876543210"
    _write(storage, VIDEO_ID)
    _write(storage, other, file_name="b.mp4")

    sources = load_merge_sources([other, VIDEO_ID], storage)

    assert [s.video_id for s in sources] == [other, VIDEO_ID]
    assert sources[1].file_name == "a.mp4"
    assert (sources[1].duration_seconds, sources[1].width, sources[1].height) == (1.5, 640, 360)
    assert (sources[1].fps_num, sources[1].fps_den, sources[1].has_audio, sources[1].size_bytes) == (30000, 1001, False, 10)


@pytest.mark.parametrize("bad_id", ["fedcba9876543210fedcba9876543210", "../uploads/x", "0123", "A" * 32])
def test_unknown_or_malformed_id_is_rejected_with_422(storage, bad_id):
    _write(storage, VIDEO_ID)

    with pytest.raises(AppError) as exc_info:
        load_merge_sources([VIDEO_ID, bad_id], storage)

    assert (exc_info.value.status, exc_info.value.code) == (422, "video_not_found")
    assert exc_info.value.message == "指定された動画が見つかりません"


def test_unknown_metadata_version_is_an_error(storage):
    _write(storage, VIDEO_ID, version=2)

    with pytest.raises(ValueError, match="version"):
        load_merge_sources([VIDEO_ID], storage)


def test_metadata_without_video_file_is_rejected(storage):
    _write(storage, VIDEO_ID)
    storage.upload_video_path(VIDEO_ID).unlink()

    with pytest.raises(AppError) as exc_info:
        load_merge_sources([VIDEO_ID], storage)

    assert exc_info.value.code == "video_not_found"
