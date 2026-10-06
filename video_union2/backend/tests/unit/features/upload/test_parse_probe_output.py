from app.features.upload.parse_probe_output import parse_probe_output


def _probe(streams, format_name="mov,mp4,m4a,3gp,3g2,mj2", duration="2.000000"):
    fmt = {"format_name": format_name}
    if duration is not None:
        fmt["duration"] = duration
    return {"streams": streams, "format": fmt}


def _video(width=1920, height=1080, duration="2.000000", rate="30/1", rotation=None, attached_pic=0):
    stream = {"codec_type": "video", "width": width, "height": height, "avg_frame_rate": rate,
              "disposition": {"attached_pic": attached_pic}}
    if duration is not None:
        stream["duration"] = duration
    if rotation is not None:
        stream["side_data_list"] = [{"side_data_type": "Display Matrix", "rotation": rotation}]
    return stream


AUDIO = {"codec_type": "audio", "sample_rate": "48000", "channels": 2}


def test_landscape_video_without_rotation():
    info = parse_probe_output(_probe([_video(), AUDIO]))

    assert info.has_video is True
    assert (info.width, info.height) == (1920, 1080)
    assert info.duration_seconds == 2.0
    assert (info.fps_num, info.fps_den) == (30, 1)
    assert info.has_audio is True
    assert info.format_names == ("mov", "mp4", "m4a", "3gp", "3g2", "mj2")


def test_rotation_90_degrees_swaps_display_width_and_height():
    for rotation in (-90, 90, 270, -270):
        info = parse_probe_output(_probe([_video(rotation=rotation)]))
        assert (info.width, info.height) == (1080, 1920), rotation


def test_rotation_180_keeps_width_and_height():
    info = parse_probe_output(_probe([_video(rotation=180)]))

    assert (info.width, info.height) == (1920, 1080)


def test_format_duration_is_used_when_video_duration_is_missing():
    info = parse_probe_output(_probe([_video(duration=None)], duration="3.500000"))

    assert info.duration_seconds == 3.5


def test_video_duration_wins_over_longer_format_duration():
    info = parse_probe_output(_probe([_video(duration="1.000000"), AUDIO], duration="2.000000"))

    assert info.duration_seconds == 1.0


def test_no_duration_anywhere_gives_none():
    info = parse_probe_output(_probe([_video(duration=None)], duration=None))

    assert info.duration_seconds is None


def test_no_audio_stream_means_no_audio():
    info = parse_probe_output(_probe([_video()]))

    assert info.has_audio is False


def test_first_video_stream_is_used_when_there_are_two():
    info = parse_probe_output(_probe([_video(width=640, height=360), _video(width=1920, height=1080)]))

    assert (info.width, info.height) == (640, 360)


def test_first_audio_stream_is_used_when_there_are_two():
    second = {"codec_type": "audio", "sample_rate": "44100", "channels": 1}

    info = parse_probe_output(_probe([_video(), AUDIO, second]))

    assert info.has_audio is True


def test_cover_art_stream_is_not_treated_as_the_video():
    info = parse_probe_output(_probe([_video(width=600, height=600, attached_pic=1), _video(width=640, height=360)]))

    assert (info.width, info.height) == (640, 360)


def test_audio_only_file_has_no_video():
    info = parse_probe_output(_probe([AUDIO], format_name="mp3"))

    assert info.has_video is False


def test_zero_avg_frame_rate_falls_back_to_r_frame_rate():
    stream = _video(rate="0/0")
    stream["r_frame_rate"] = "25/1"

    info = parse_probe_output(_probe([stream]))

    assert (info.fps_num, info.fps_den) == (25, 1)
