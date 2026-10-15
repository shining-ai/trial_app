import pytest

from app.lib.config import Settings


def test_settings_from_empty_environment_uses_defaults():
    settings = Settings.from_env({})

    assert str(settings.storage_dir) == "/data"
    assert settings.max_upload_bytes == 4294967296
    assert (settings.max_long_side, settings.max_short_side) == (3840, 2160)
    assert settings.stale_file_hours == 24
    assert settings.ffprobe_timeout_seconds == 60
    assert settings.thumbnail_timeout_seconds == 60
    assert settings.max_videos == 100
    assert settings.max_total_seconds == 1800
    assert settings.max_fps == 60
    assert settings.x264_preset == "veryfast"
    assert settings.x264_crf == 20
    assert settings.ffmpeg_timeout_per_second == 20
    assert str(settings.scene_font_path) == "/usr/share/fonts/opentype/ipaexfont-gothic/ipaexg.ttf"


def test_settings_reads_scene_font_path_from_environment():
    settings = Settings.from_env({"SCENE_FONT_PATH": "/fonts/custom.ttf"})

    assert str(settings.scene_font_path) == "/fonts/custom.ttf"


def test_settings_reads_values_from_environment():
    settings = Settings.from_env(
        {"STORAGE_DIR": "/tmp/x", "MAX_UPLOAD_BYTES": "1024", "MAX_TOTAL_SECONDS": "2", "X264_PRESET": "ultrafast"}
    )

    assert str(settings.storage_dir) == "/tmp/x"
    assert settings.max_upload_bytes == 1024
    assert settings.max_total_seconds == 2
    assert settings.x264_preset == "ultrafast"


def test_settings_reads_thumbnail_timeout_from_environment():
    settings = Settings.from_env({"THUMBNAIL_TIMEOUT_SECONDS": "5"})

    assert settings.thumbnail_timeout_seconds == 5


def test_settings_accepts_thumbnail_timeout_of_one_second():
    assert Settings.from_env({"THUMBNAIL_TIMEOUT_SECONDS": "1"}).thumbnail_timeout_seconds == 1


@pytest.mark.parametrize("value", ["0", "-1"])
def test_settings_rejects_thumbnail_timeout_of_zero_or_less(value):
    with pytest.raises(ValueError, match="THUMBNAIL_TIMEOUT_SECONDS"):
        Settings.from_env({"THUMBNAIL_TIMEOUT_SECONDS": value})


def test_settings_with_non_numeric_value_raises_error():
    with pytest.raises(ValueError, match="MAX_VIDEOS"):
        Settings.from_env({"MAX_VIDEOS": "many"})
