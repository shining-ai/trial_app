import shutil

from app.lib.disk_space import free_bytes


def test_free_bytes_matches_filesystem_free_space(tmp_path):
    expected = shutil.disk_usage(tmp_path).free

    assert abs(free_bytes(tmp_path) - expected) < 64 * 1024 * 1024


def test_free_bytes_of_missing_directory_uses_nearest_existing_parent(tmp_path):
    assert free_bytes(tmp_path / "not" / "yet") > 0


def test_directory_size_sums_all_files_below(tmp_path):
    from app.lib.disk_space import directory_size

    (tmp_path / "a").mkdir()
    (tmp_path / "a" / "x.bin").write_bytes(b"1" * 100)
    (tmp_path / "y.bin").write_bytes(b"1" * 50)

    assert directory_size(tmp_path) == 150
    assert directory_size(tmp_path / "missing") == 0
