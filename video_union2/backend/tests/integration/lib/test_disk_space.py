import shutil

from app.lib.disk_space import free_bytes


def test_free_bytes_matches_filesystem_free_space(tmp_path):
    expected = shutil.disk_usage(tmp_path).free

    assert abs(free_bytes(tmp_path) - expected) < 64 * 1024 * 1024


def test_free_bytes_of_missing_directory_uses_nearest_existing_parent(tmp_path):
    assert free_bytes(tmp_path / "not" / "yet") > 0
