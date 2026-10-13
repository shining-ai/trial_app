from app.lib.disk_storage import DiskStorage
from app.lib.generate_id import generate_id


def test_generate_id_returns_32_hex_chars_accepted_by_disk_storage():
    value = generate_id()

    assert len(value) == 32
    assert DiskStorage.is_valid_id(value)


def test_generate_id_returns_different_values():
    assert len({generate_id() for _ in range(100)}) == 100
