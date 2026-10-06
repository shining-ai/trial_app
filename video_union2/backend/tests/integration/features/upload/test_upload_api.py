import json
import logging
import socket
import threading
from urllib.parse import quote

import pytest

from tests.conftest import FIXTURES_DIR
from tests.support.make_video import make_still_png, make_video

NOT_A_VIDEO = {"error": {"code": "not_a_video", "message": "動画として読み込めませんでした"}}


def _upload(client, path, file_name=None):
    headers = {"Content-Type": "application/octet-stream"}
    if file_name is not False:
        headers["X-File-Name"] = quote(file_name or path.name)
    return client.post("/api/videos", content=path.read_bytes(), headers=headers)


def _stored_files(settings):
    uploads = settings.storage_dir / "uploads"
    return sorted(p.name for p in uploads.iterdir()) if uploads.exists() else []


def test_upload_video_returns_201_with_display_info_and_stores_bin_and_metadata(client, settings, tmp_path):
    video = make_video(tmp_path / "IMG_0001.mp4", width=640, height=360, duration=2.0)

    response = _upload(client, video)

    assert response.status_code == 201
    body = response.json()
    assert body["file_name"] == "IMG_0001.mp4"
    assert abs(body["duration_seconds"] - 2.0) <= 0.05
    assert (body["width"], body["height"]) == (640, 360)
    assert _stored_files(settings) == [f"{body['id']}.bin", f"{body['id']}.json"]
    metadata = json.loads((settings.storage_dir / "uploads" / f"{body['id']}.json").read_text())
    assert metadata == {
        "version": 1,
        "id": body["id"],
        "file_name": "IMG_0001.mp4",
        "size_bytes": video.stat().st_size,
        "duration_seconds": body["duration_seconds"],
        "width": 640,
        "height": 360,
        "fps_num": 30,
        "fps_den": 1,
        "has_audio": True,
        "video_stream_index": 0,
        "audio_stream_index": 1,
    }


def test_duration_is_video_length_even_when_audio_is_longer(client, tmp_path):
    video = tmp_path / "a.mp4"
    make_video(tmp_path / "v.mp4", duration=1.0, audio=False)
    # 映像1秒に、2秒の音声を付ける
    import subprocess
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(tmp_path / "v.mp4"), "-f", "lavfi", "-i", "sine=d=2",
         "-c:v", "copy", "-c:a", "aac", str(video)],
        check=True,
    )

    response = _upload(client, video)

    assert response.status_code == 201
    assert abs(response.json()["duration_seconds"] - 1.0) <= 0.05


@pytest.mark.parametrize("container", ["webm", "mkv"])
def test_webm_and_mkv_videos_are_accepted(client, tmp_path, container):
    response = _upload(client, make_video(tmp_path / f"a.{container}", container=container))

    assert response.status_code == 201


def test_rotated_video_returns_display_size(client, tmp_path):
    response = _upload(client, make_video(tmp_path / "a.mp4", width=640, height=360, rotation=90))

    assert response.status_code == 201
    assert (response.json()["width"], response.json()["height"]) == (360, 640)


def test_video_without_audio_is_accepted(client, settings, tmp_path):
    response = _upload(client, make_video(tmp_path / "a.mp4", audio=False))

    assert response.status_code == 201
    metadata = json.loads((settings.storage_dir / "uploads" / f"{response.json()['id']}.json").read_text())
    assert metadata["has_audio"] is False


def test_text_file_with_mp4_extension_is_rejected_and_nothing_is_left(client, settings):
    response = _upload(client, FIXTURES_DIR / "not_a_video.mp4")

    assert response.status_code == 422
    assert response.json() == NOT_A_VIDEO
    assert _stored_files(settings) == []


def test_still_png_is_rejected_and_nothing_is_left(client, settings, tmp_path):
    response = _upload(client, make_still_png(tmp_path / "a.png"))

    assert response.status_code == 422
    assert response.json() == NOT_A_VIDEO
    assert _stored_files(settings) == []


def test_hls_playlist_is_rejected_and_nothing_is_left(client, settings, tmp_path):
    target = make_video(tmp_path / "target.mp4")
    playlist = tmp_path / "playlist.m3u8"
    playlist.write_text(f"#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nfile:{target}\n#EXT-X-ENDLIST\n")

    response = _upload(client, playlist)

    assert response.status_code == 422
    assert response.json() == NOT_A_VIDEO
    assert _stored_files(settings) == []


def test_playlist_referring_to_a_url_does_not_make_the_server_connect(client, settings):
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    listener.settimeout(0.2)
    port = listener.getsockname()[1]
    connections = []

    def accept():
        try:
            conn, _ = listener.accept()
            connections.append(conn)
        except OSError:
            pass

    watcher = threading.Thread(target=accept)
    watcher.start()
    payloads = [
        f"#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:{port}/a.ts\n#EXT-X-ENDLIST\n",
        f"ffconcat version 1.0\nfile http://127.0.0.1:{port}/a.mp4\n",
    ]

    responses = [
        client.post("/api/videos", content=p.encode(), headers={"Content-Type": "application/octet-stream", "X-File-Name": "x.mp4"})
        for p in payloads
    ]
    watcher.join()
    listener.close()

    assert [r.status_code for r in responses] == [422, 422]
    assert connections == []
    assert _stored_files(settings) == []


def test_ffconcat_list_is_refused_by_format_whitelist(client, settings, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    target = make_video(tmp_path / "target.mp4")
    listing = tmp_path / "list.ffconcat"
    listing.write_text(f"ffconcat version 1.0\nfile {target}\n")

    response = _upload(client, listing)

    assert response.status_code == 422
    assert response.json() == NOT_A_VIDEO
    assert _stored_files(settings) == []
    probe_errors = [r for r in caplog.records if r.levelno == logging.ERROR and r.fields.get("program") == "ffprobe"]
    assert any("not on whitelist" in line for line in probe_errors[0].fields["stderr_tail"])


def test_size_exactly_at_limit_is_accepted_and_one_byte_over_is_rejected_with_413(settings, make_client, tmp_path):
    video = make_video(tmp_path / "a.mp4")
    size = video.stat().st_size

    at_limit = _upload(make_client(settings, max_upload_bytes=size), video)
    over = _upload(make_client(settings, max_upload_bytes=size - 1), video)

    assert at_limit.status_code == 201
    assert over.status_code == 413
    assert over.json() == {"error": {"code": "file_too_large", "message": "ファイルサイズが上限の4GBを超えています"}}
    assert not any(name.endswith(".part") for name in _stored_files(settings))
    assert len([n for n in _stored_files(settings) if n.endswith(".bin")]) == 1


def test_resolution_limit_and_cleanup(settings, make_client, tmp_path):
    client = make_client(settings, max_long_side=640, max_short_side=360)

    ok = _upload(client, make_video(tmp_path / "ok.mp4", width=640, height=360))
    files_after_ok = _stored_files(settings)
    over = _upload(client, make_video(tmp_path / "over.mp4", width=642, height=360))

    assert ok.status_code == 201
    assert over.status_code == 422
    assert over.json()["error"]["code"] == "resolution_too_large"
    assert "642x360" in over.json()["error"]["message"]
    assert _stored_files(settings) == files_after_ok


def test_resolution_limit_uses_rotated_display_size(settings, make_client, tmp_path):
    client = make_client(settings, max_long_side=640, max_short_side=360)

    ok = _upload(client, make_video(tmp_path / "ok.mp4", width=640, height=360, rotation=90))
    over = _upload(client, make_video(tmp_path / "over.mp4", width=642, height=360, rotation=90))

    assert ok.status_code == 201
    assert (ok.json()["width"], ok.json()["height"]) == (360, 640)
    assert over.status_code == 422
    assert "360x642" in over.json()["error"]["message"]


def test_missing_file_name_header_is_rejected(client, settings, tmp_path):
    response = _upload(client, make_video(tmp_path / "a.mp4"), file_name=False)

    assert response.status_code == 422
    assert response.json() == {"error": {"code": "file_name_required", "message": "ファイル名がありません"}}
    assert _stored_files(settings) == []


def test_file_name_with_path_traversal_is_only_stored_in_metadata(client, settings, tmp_path):
    response = _upload(client, make_video(tmp_path / "a.mp4"), file_name="../../etc/passwd")

    assert response.status_code == 201
    assert response.json()["file_name"] == "../../etc/passwd"
    video_id = response.json()["id"]
    assert _stored_files(settings) == [f"{video_id}.bin", f"{video_id}.json"]
    assert not (settings.storage_dir.parent / "etc").exists()


def test_delete_removes_video_and_metadata(client, settings, tmp_path):
    video_id = _upload(client, make_video(tmp_path / "a.mp4")).json()["id"]

    response = client.delete(f"/api/videos/{video_id}")

    assert response.status_code == 204
    assert _stored_files(settings) == []


def test_delete_unknown_or_malformed_id_returns_404(client):
    unknown = client.delete("/api/videos/0123456789abcdef0123456789abcdef")
    malformed = client.delete("/api/videos/..%2F..%2Fetc")

    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "video_not_found"
    assert malformed.status_code == 404


def test_error_messages_do_not_contain_storage_paths(client, settings):
    response = _upload(client, FIXTURES_DIR / "not_a_video.mp4")

    assert response.status_code == 422
    assert set(response.json()["error"]) == {"code", "message"}
    assert str(settings.storage_dir) not in response.text
    assert "/data" not in response.text


def test_upload_completion_is_logged_with_video_id_and_without_file_name(client, tmp_path, caplog):
    caplog.set_level(logging.INFO)

    video_id = _upload(client, make_video(tmp_path / "secret-name.mp4")).json()["id"]

    done = [r for r in caplog.records if getattr(r, "fields", {}).get("name") == "upload.upload_video"]
    assert done and done[0].levelno == logging.INFO
    assert done[0].fields["video_ids"] == [video_id]
    assert "ms" in done[0].fields
    assert not any("secret-name" in json.dumps(getattr(r, "fields", {})) + r.getMessage() for r in caplog.records)


def test_webm_duration_is_video_length_even_when_audio_is_longer(client, tmp_path):
    import subprocess
    video = tmp_path / "a.webm"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=64x64:r=30:d=1", "-f", "lavfi",
         "-i", "sine=d=2", "-c:v", "libvpx-vp9", "-deadline", "realtime", "-c:a", "libopus", str(video)],
        check=True,
    )

    response = _upload(client, video)

    assert response.status_code == 201
    assert abs(response.json()["duration_seconds"] - 1.0) <= 0.05


def test_malformed_request_body_gets_common_error_shape(client):
    response = client.post("/api/merges", json={"ids": []})

    assert response.status_code == 422
    assert response.json() == {"error": {"code": "invalid_request", "message": "リクエストの形式が正しくありません"}}
