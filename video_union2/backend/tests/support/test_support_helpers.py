from tests.support.make_video import make_still_png, make_video
from tests.support.probe import audio_streams, frame_timestamps, probe, video_stream
from tests.support.sample_pixel import is_close, sample_pixel


def test_make_video_creates_mp4_with_requested_size_duration_and_audio(tmp_path):
    path = make_video(tmp_path / "a.mp4", width=320, height=180, duration=1.0, fps="30", color="red")

    info = probe(path)
    video = video_stream(info)
    assert (video["width"], video["height"]) == (320, 180)
    assert video["codec_name"] == "h264"
    assert abs(float(info["format"]["duration"]) - 1.0) < 0.1
    assert len(audio_streams(info)) == 1


def test_make_video_without_audio_has_no_audio_stream(tmp_path):
    info = probe(make_video(tmp_path / "a.mp4", audio=False))

    assert audio_streams(info) == []


def test_make_video_with_rotation_sets_display_matrix(tmp_path):
    info = probe(make_video(tmp_path / "a.mp4", rotation=90))

    rotations = [d.get("rotation") for d in video_stream(info).get("side_data_list", [])]
    assert rotations in ([90], [-90])


def test_make_video_webm_and_mkv_use_requested_codecs(tmp_path):
    webm = video_stream(probe(make_video(tmp_path / "a.webm", container="webm")))
    mkv = video_stream(probe(make_video(tmp_path / "a.mkv", container="mkv")))

    assert webm["codec_name"] == "vp9"
    assert mkv["codec_name"] == "mpeg4"


def test_make_video_variable_frame_rate_has_uneven_frame_intervals(tmp_path):
    path = make_video(tmp_path / "a.mp4", duration=2.0, variable_frame_rate=True, audio=False)

    times = frame_timestamps(path)
    intervals = {round(b - a, 3) for a, b in zip(times, times[1:])}
    assert len(intervals) >= 2


def test_sample_pixel_reads_color_of_solid_video(tmp_path):
    path = make_video(tmp_path / "a.mp4", color="blue", audio=False)

    assert is_close(sample_pixel(path, at_seconds=0.5, x=160, y=90), (0, 0, 255))


def test_make_still_png_creates_png(tmp_path):
    info = probe(make_still_png(tmp_path / "a.png"))

    assert info["format"]["format_name"] == "png_pipe"
