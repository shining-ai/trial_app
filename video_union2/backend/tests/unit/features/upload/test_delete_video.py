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
