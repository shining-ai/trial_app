import logging
import os
import time

import pytest

from app.lib.cleanup_stale_files import cleanup_stale_files
from app.lib.disk_storage import DiskStorage

HOUR = 3600


def _touch(path, age_seconds):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x")
    past = time.time() - age_seconds
    os.utime(path, (past, past))
    return path


@pytest.fixture
def storage(tmp_path):
    return DiskStorage(tmp_path / "data")


def test_files_older_than_24_hours_are_removed_and_newer_ones_are_kept(storage):
    old = _touch(storage.uploads_dir() / "old.bin", 24 * HOUR + 1)
    new = _touch(storage.uploads_dir() / "new.bin", 24 * HOUR - 1)

    cleanup_stale_files(storage, stale_hours=24)

    assert not old.exists()
    assert new.exists()


def test_old_merge_job_directory_is_removed_with_its_contents(storage):
    job = "0123456789abcdef0123456789abcdef"
    result = _touch(storage.merge_result_path(job), 25 * HOUR)
    os.utime(storage.merge_job_dir(job), (time.time() - 25 * HOUR,) * 2)
    fresh_job = "fedcba9876543210fedcba9876543210"
    fresh = _touch(storage.merge_result_path(fresh_job), 60)

    cleanup_stale_files(storage, stale_hours=24)

    assert not result.exists()
    assert not storage.merge_job_dir(job).exists()
    assert fresh.exists()


def test_undeletable_entry_is_logged_and_raised(storage, caplog):
    caplog.set_level(logging.INFO)
    stuck = storage.uploads_dir() / "stuck"
    _touch(stuck / "inner.bin", 25 * HOUR)
    os.utime(stuck, (time.time() - 25 * HOUR,) * 2)

    with pytest.raises(OSError):
        cleanup_stale_files(storage, stale_hours=24)

    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert errors and errors[0].fields["name"] == "lib.cleanup_stale_files"
    assert "err" in errors[0].fields


def test_missing_directories_are_not_an_error(storage):
    cleanup_stale_files(storage, stale_hours=24)


def test_app_startup_runs_cleanup(settings, make_client):
    storage = DiskStorage(settings.storage_dir)
    old = _touch(storage.uploads_dir() / "old.bin", 25 * HOUR)

    make_client(settings)

    assert not old.exists()
