import pytest

from app.lib.config import Settings


def test_settings_from_empty_environment_uses_defaults():
    settings = Settings.from_env({})

    assert str(settings.storage_dir) == "/data"
    assert settings.max_upload_bytes == 4294967296
    assert (settings.max_long_side, settings.max_short_side) == (3840, 2160)
    assert settings.stale_file_hours == 24
    assert settings.ffprobe_timeout_seconds == 60
    assert settings.max_videos == 100
    assert settings.max_total_seconds == 1800
    assert settings.max_fps == 60
    assert settings.x264_preset == "veryfast"
    assert settings.x264_crf == 20
    assert settings.ffmpeg_timeout_per_second == 20


def test_settings_reads_values_from_environment():
    settings = Settings.from_env(
        {"STORAGE_DIR": "/tmp/x", "MAX_UPLOAD_BYTES": "1024", "MAX_TOTAL_SECONDS": "2", "X264_PRESET": "ultrafast"}
    )

    assert str(settings.storage_dir) == "/tmp/x"
    assert settings.max_upload_bytes == 1024
    assert settings.max_total_seconds == 2
    assert settings.x264_preset == "ultrafast"


def test_settings_with_non_numeric_value_raises_error():
    with pytest.raises(ValueError, match="MAX_VIDEOS"):
        Settings.from_env({"MAX_VIDEOS": "many"})
