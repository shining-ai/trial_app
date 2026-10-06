import pytest

from app.lib.disk_storage import DiskStorage, InvalidIdError

VALID_ID = "0123456789abcdef0123456789abcdef"


@pytest.fixture
def storage(tmp_path):
    return DiskStorage(tmp_path / "data")


def test_upload_paths_are_inside_uploads_dir(storage, tmp_path):
    root = (tmp_path / "data").resolve()

    assert storage.upload_video_path(VALID_ID) == root / "uploads" / f"{VALID_ID}.bin"
    assert storage.upload_metadata_path(VALID_ID) == root / "uploads" / f"{VALID_ID}.json"
    assert storage.upload_temp_path(VALID_ID) == root / "uploads" / f"{VALID_ID}.part"
    assert storage.uploads_dir() == root / "uploads"


def test_merge_paths_are_inside_job_dir(storage, tmp_path):
    job_dir = (tmp_path / "data").resolve() / "merges" / VALID_ID

    assert storage.merges_dir() == job_dir.parent
    assert storage.merge_job_dir(VALID_ID) == job_dir
    assert storage.merge_part_path(VALID_ID, 1) == job_dir / "parts" / "0001.mp4"
    assert storage.merge_part_path(VALID_ID, 100) == job_dir / "parts" / "0100.mp4"
    assert storage.merge_parts_dir(VALID_ID) == job_dir / "parts"
    assert storage.merge_list_path(VALID_ID) == job_dir / "parts.txt"
    assert storage.merge_result_partial_path(VALID_ID) == job_dir / "result.partial.mp4"
    assert storage.merge_result_path(VALID_ID) == job_dir / "result.mp4"


@pytest.mark.parametrize(
    "bad_id",
    [
        "../etc/passwd",
        "0123456789abcdef/123456789abcdef",
        "0123456789abcdef0123456789abcde",
        "0123456789abcdef0123456789abcdef0",
        "0123456789abcdef0123456789abcdeg",
        "0123456789ABCDEF0123456789ABCDEF",
        "",
    ],
)
def test_invalid_ids_are_rejected(storage, bad_id):
    with pytest.raises(InvalidIdError):
        storage.upload_video_path(bad_id)
    with pytest.raises(InvalidIdError):
        storage.merge_result_path(bad_id)


def test_is_valid_id_accepts_only_32_lowercase_hex(storage):
    assert DiskStorage.is_valid_id(VALID_ID) is True
    assert DiskStorage.is_valid_id("../x") is False
