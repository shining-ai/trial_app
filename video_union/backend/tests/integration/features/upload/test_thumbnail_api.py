import subprocess

from tests.support.api import upload, upload_id
from tests.support.make_video import make_video
from tests.support.probe import probe, video_stream
from tests.support.sample_pixel import is_close, sample_pixel

RED = (255, 0, 0)
BLUE = (0, 0, 255)
THUMBNAIL_NOT_FOUND = {"error": {"code": "thumbnail_not_found", "message": "サムネイルが見つかりません"}}


def _save_thumbnail(client, video_id, tmp_path):
    response = client.get(f"/api/videos/{video_id}/thumbnail")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/jpeg"
    path = tmp_path / f"thumb-{video_id}.jpg"
    path.write_bytes(response.content)
    return path


def _size(path):
    stream = video_stream(probe(path))
    return stream["width"], stream["height"]


def test_thumbnail_of_landscape_video_is_red_jpeg_shrunk_into_240x135(client, tmp_path):
    video_id = upload_id(client, make_video(tmp_path / "a.mp4", width=640, height=360, color="red"))

    thumbnail = _save_thumbnail(client, video_id, tmp_path)

    assert video_stream(probe(thumbnail))["codec_name"] == "mjpeg"
    assert _size(thumbnail) == (240, 135)
    assert is_close(sample_pixel(thumbnail, at_seconds=0, x=120, y=67), RED)


def test_thumbnail_of_portrait_video_keeps_aspect_ratio_within_135_high(client, tmp_path):
    video_id = upload_id(client, make_video(tmp_path / "a.mp4", width=360, height=640))

    width, height = _size(_save_thumbnail(client, video_id, tmp_path))

    assert height == 135
    assert 75 <= width <= 77


def test_thumbnail_of_rotated_video_follows_display_orientation(client, tmp_path):
    video_id = upload_id(client, make_video(tmp_path / "a.mp4", width=640, height=360, rotation=90))

    width, height = _size(_save_thumbnail(client, video_id, tmp_path))

    assert height == 135
    assert 75 <= width <= 77


def test_thumbnail_is_taken_from_first_frame(client, tmp_path):
    # 先頭0.5秒が赤、残り1.5秒が青の動画
    video = tmp_path / "red-then-blue.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error",
         "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=0.5",
         "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=1.5",
         "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video)],
        check=True, capture_output=True,
    )
    video_id = upload_id(client, video)

    thumbnail = _save_thumbnail(client, video_id, tmp_path)

    assert is_close(sample_pixel(thumbnail, at_seconds=0, x=120, y=67), RED)
    assert not is_close(sample_pixel(thumbnail, at_seconds=0, x=120, y=67), BLUE)


def test_unknown_or_malformed_id_returns_404(client):
    unknown = client.get("/api/videos/0123456789abcdef0123456789abcdef/thumbnail")
    malformed = client.get("/api/videos/..%2F..%2Fetc/thumbnail")
    upper = client.get("/api/videos/0123456789ABCDEF0123456789ABCDEF/thumbnail")

    assert unknown.status_code == 404
    assert unknown.json() == THUMBNAIL_NOT_FOUND
    assert malformed.status_code == 404
    assert upper.status_code == 404
    assert upper.json() == THUMBNAIL_NOT_FOUND


def test_thumbnail_is_gone_after_video_is_deleted(client, settings, tmp_path):
    video_id = upload_id(client, make_video(tmp_path / "a.mp4"))
    assert client.get(f"/api/videos/{video_id}/thumbnail").status_code == 200

    assert client.delete(f"/api/videos/{video_id}").status_code == 204

    response = client.get(f"/api/videos/{video_id}/thumbnail")
    assert response.status_code == 404
    assert response.json() == THUMBNAIL_NOT_FOUND
    assert not (settings.storage_dir / "uploads" / f"{video_id}.jpg").exists()


def test_video_whose_first_frame_cannot_be_decoded_is_rejected_and_nothing_is_left(client, settings, tmp_path):
    # 先頭に moov を置いた動画を mdat の途中で切ると、ffprobe は読めるが映像を復号できない
    whole = tmp_path / "whole.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=2",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(whole)],
        check=True, capture_output=True,
    )
    data = whole.read_bytes()
    truncated = tmp_path / "truncated.mp4"
    truncated.write_bytes(data[: data.index(b"mdat") + 20])
    assert subprocess.run(["ffprobe", "-v", "error", str(truncated)], capture_output=True).returncode == 0

    response = upload(client, truncated)

    assert response.status_code == 422
    assert response.json() == {"error": {"code": "not_a_video", "message": "動画として読み込めませんでした"}}
    assert list((settings.storage_dir / "uploads").iterdir()) == []


def test_thumbnail_timeout_is_reported_as_server_busy_not_as_broken_video(settings, make_client, tmp_path):
    client = make_client(settings, thumbnail_timeout_seconds=0.001)

    response = upload(client, make_video(tmp_path / "a.mp4"))

    assert response.status_code == 503
    assert response.json() == {
        "error": {
            "code": "thumbnail_timeout",
            "message": "動画の読み込みに時間がかかりすぎました。しばらくしてからもう一度お試しください",
        }
    }
    assert list((settings.storage_dir / "uploads").iterdir()) == []
