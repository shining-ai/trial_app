from app.features.upload.check_upload_size import check_upload_size

GB4 = 4294967296


def test_declared_size_over_limit_is_rejected_before_receiving():
    failure = check_upload_size(GB4 + 1, max_bytes=GB4, free_bytes=10 * GB4)

    assert (failure.status, failure.code, failure.message) == (413, "file_too_large", "ファイルサイズが上限の4GBを超えています")


def test_declared_size_larger_than_free_space_is_rejected_with_507():
    failure = check_upload_size(1000, max_bytes=GB4, free_bytes=999)

    assert (failure.status, failure.code, failure.message) == (507, "insufficient_storage", "保存先の空き容量が足りません")


def test_declared_size_within_limits_or_unknown_is_accepted():
    assert check_upload_size(GB4, max_bytes=GB4, free_bytes=GB4) is None
    assert check_upload_size(None, max_bytes=GB4, free_bytes=0) is None
