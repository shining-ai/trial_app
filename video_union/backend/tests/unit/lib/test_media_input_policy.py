from app.lib.media_input_policy import ALLOWED_FORMATS, input_restriction_args, is_allowed_format


def test_allowed_formats_cover_required_containers_only():
    assert set(ALLOWED_FORMATS) == {
        "mov", "mp4", "m4a", "3gp", "3g2", "mj2", "matroska", "webm", "avi", "mpegts", "mpeg", "asf", "flv",
    }


def test_input_restriction_args_allow_only_file_protocol_and_allowed_formats():
    assert input_restriction_args() == ["-protocol_whitelist", "file", "-format_whitelist", ",".join(ALLOWED_FORMATS)]


def test_is_allowed_format_checks_any_element():
    assert is_allowed_format(("mov", "mp4", "m4a")) is True
    assert is_allowed_format(("matroska", "webm")) is True
    assert is_allowed_format(("hls",)) is False
    assert is_allowed_format(()) is False
