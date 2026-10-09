import subprocess

from tests.support.bright_bbox import bright_bbox
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


def _make_box_video(path, *, x, y, w, h):
    """黒地に白い四角を描いた1秒の動画を FFmpeg で作る。"""
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-f", "lavfi",
            "-i", "color=c=black:s=320x180:r=30:d=1",
            "-vf", f"drawbox=x={x}:y={y}:w={w}:h={h}:color=white:t=fill",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path),
        ],
        check=True,
        capture_output=True,
    )
    return path


def test_bright_bbox_returns_none_for_solid_black_video(tmp_path):
    path = make_video(tmp_path / "a.mp4", color="black", audio=False)

    assert bright_bbox(path, at_seconds=0.5) is None


def test_bright_bbox_returns_position_of_white_box_on_black(tmp_path):
    path = _make_box_video(tmp_path / "box.mp4", x=100, y=50, w=40, h=30)

    left, top, right, bottom = bright_bbox(path, at_seconds=0.5)

    # 四角は x=100..139、y=50..79 の画素(右と下は含む座標)。圧縮のずれは ±2 まで許す
    assert abs(left - 100) <= 2
    assert abs(top - 50) <= 2
    assert abs(right - 139) <= 2
    assert abs(bottom - 79) <= 2
