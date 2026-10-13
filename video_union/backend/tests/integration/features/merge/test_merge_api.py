import json
import logging
import subprocess
from fractions import Fraction

import pytest

from tests.conftest import FIXTURES_DIR
from tests.support.api import upload_id, wait_for_job
from tests.support.make_video import make_video
from tests.support.probe import (
    audio_streams, decodes_to_end, frame_timestamps, max_volume_db, probe, top_level_atoms, video_stream,
)
from tests.support.sample_pixel import is_close, sample_pixel

RED, GREEN, BLUE, BLACK = (255, 0, 0), (0, 128, 0), (0, 0, 255), (0, 0, 0)


def _result_path(settings, job_id):
    return settings.storage_dir / "merges" / job_id / "result.mp4"


def _items_body(ids):
    return {"items": [{"type": "video", "video_id": video_id} for video_id in ids]}


def _merge(client, ids):
    return client.post("/api/merges", json=_items_body(ids))


def _merge_ok(client, settings, ids):
    response = _merge(client, ids)
    assert response.status_code == 202, response.text
    job = wait_for_job(client, response.json()["id"])
    assert job["status"] == "succeeded", job
    assert job["progress"] == 1.0
    return _result_path(settings, job["id"])


def _color_video(tmp_path, name, color, **kwargs):
    return make_video(tmp_path / f"{name}.mp4", color=color, width=kwargs.pop("width", 320),
                      height=kwargs.pop("height", 180), **kwargs)


def test_videos_are_merged_in_requested_order(client, settings, tmp_path):
    ids = {c: upload_id(client, _color_video(tmp_path, c, c)) for c in ("red", "green", "blue")}

    first = _merge_ok(client, settings, [ids["red"], ids["green"], ids["blue"]])
    first_colors = [sample_pixel(first, at_seconds=t, x=160, y=90) for t in (0.5, 1.5, 2.5)]
    second = _merge_ok(client, settings, [ids["blue"], ids["red"], ids["green"]])
    second_colors = [sample_pixel(second, at_seconds=t, x=160, y=90) for t in (0.5, 1.5, 2.5)]

    assert [is_close(c, e) for c, e in zip(first_colors, (RED, GREEN, BLUE))] == [True, True, True], first_colors
    assert [is_close(c, e) for c, e in zip(second_colors, (BLUE, RED, GREEN))] == [True, True, True], second_colors


def test_different_resolutions_are_centered_without_scaling_on_black(client, settings, tmp_path):
    red = upload_id(client, _color_video(tmp_path, "red", "red", width=640, height=360))
    green = upload_id(client, _color_video(tmp_path, "green", "green", width=360, height=640))

    result = _merge_ok(client, settings, [red, green])

    video = video_stream(probe(result))
    assert (video["width"], video["height"]) == (640, 640)
    assert is_close(sample_pixel(result, at_seconds=0.5, x=320, y=145), RED)
    assert is_close(sample_pixel(result, at_seconds=0.5, x=320, y=135), BLACK)
    assert is_close(sample_pixel(result, at_seconds=0.5, x=320, y=630), BLACK)
    assert is_close(sample_pixel(result, at_seconds=1.5, x=320, y=320), GREEN)
    assert is_close(sample_pixel(result, at_seconds=1.5, x=10, y=320), BLACK)
    assert is_close(sample_pixel(result, at_seconds=1.5, x=630, y=320), BLACK)


def test_rotated_video_is_merged_by_display_size(client, settings, tmp_path):
    rotated = upload_id(client, make_video(tmp_path / "r.mp4", width=640, height=360, rotation=90))
    plain = upload_id(client, make_video(tmp_path / "p.mp4", width=640, height=360))

    video = video_stream(probe(_merge_ok(client, settings, [rotated, plain])))

    assert (video["width"], video["height"]) == (640, 640)


def test_different_containers_and_codecs_are_merged(client, settings, tmp_path):
    ids = [
        upload_id(client, make_video(tmp_path / "a.mp4", color="red")),
        upload_id(client, make_video(tmp_path / "b.webm", color="green", container="webm")),
        upload_id(client, make_video(tmp_path / "c.mkv", color="blue", container="mkv")),
    ]

    result = _merge_ok(client, settings, ids)

    colors = [sample_pixel(result, at_seconds=t, x=160, y=90) for t in (0.5, 1.5, 2.5)]
    assert [is_close(c, e) for c, e in zip(colors, (RED, GREEN, BLUE))] == [True, True, True], colors


def test_highest_frame_rate_is_used(client, settings, tmp_path):
    ids = [upload_id(client, make_video(tmp_path / "a.mp4", fps="30")),
           upload_id(client, make_video(tmp_path / "b.mp4", fps="60"))]

    video = video_stream(probe(_merge_ok(client, settings, ids)))

    assert Fraction(video["avg_frame_rate"]) == 60


def test_variable_frame_rate_becomes_constant(client, settings, tmp_path):
    ids = [upload_id(client, make_video(tmp_path / "v.mp4", duration=2.0, variable_frame_rate=True, audio=False)),
           upload_id(client, make_video(tmp_path / "c.mp4", fps="30"))]

    result = _merge_ok(client, settings, ids)

    video = video_stream(probe(result))
    assert Fraction(video["avg_frame_rate"]) == 30
    assert Fraction(video["r_frame_rate"]) == 30
    times = frame_timestamps(result)
    assert {round(b - a, 3) for a, b in zip(times, times[1:])} == {round(1 / 30, 3)}


def test_audio_is_converted_to_48k_stereo_and_silence_is_added(client, settings, tmp_path):
    silent = upload_id(client, make_video(tmp_path / "s.mp4", audio=False))
    mono = upload_id(client, make_video(tmp_path / "m.mp4"))
    assert audio_streams(probe(tmp_path / "m.mp4"))[0]["sample_rate"] == "44100"

    result = _merge_ok(client, settings, [silent, mono])

    streams = audio_streams(probe(result))
    assert len(streams) == 1
    assert (streams[0]["sample_rate"], streams[0]["channels"]) == ("48000", 2)


def test_all_silent_videos_still_get_an_audio_track(client, settings, tmp_path):
    ids = [upload_id(client, make_video(tmp_path / f"{i}.mp4", audio=False)) for i in range(2)]

    assert len(audio_streams(probe(_merge_ok(client, settings, ids)))) == 1


def test_audio_is_cut_or_padded_to_each_video_length(client, settings, tmp_path):
    long_video = tmp_path / "long_video.mp4"
    long_audio = tmp_path / "long_audio.mp4"
    for path, video_seconds, audio_seconds in ((long_video, 2, 1), (long_audio, 1, 2)):
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=red:s=320x180:r=30:d={video_seconds}",
             "-f", "lavfi", "-i", f"sine=frequency=440:duration={audio_seconds}",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(path)],
            check=True,
        )
    ids = [upload_id(client, long_video), upload_id(client, long_audio)]

    result = _merge_ok(client, settings, ids)

    info = probe(result)
    assert abs(float(video_stream(info)["duration"]) - 3.0) <= 1 / 30 + 0.01
    assert abs(float(audio_streams(info)[0]["duration"]) - 3.0) <= 1 / 30 + 0.03
    assert max_volume_db(result, start=1.1, duration=0.8) < -60
    assert max_volume_db(result, start=0.2, duration=0.6) > -40


def test_output_is_h264_yuv420p_aac_faststart_and_decodes_to_the_end(client, settings, tmp_path):
    ids = [upload_id(client, make_video(tmp_path / f"{i}.mp4", duration=1.0)) for i in range(2)]

    result = _merge_ok(client, settings, ids)

    info = probe(result)
    video = video_stream(info)
    assert (video["codec_name"], video["pix_fmt"]) == ("h264", "yuv420p")
    assert audio_streams(info)[0]["codec_name"] == "aac"
    atoms = top_level_atoms(result)
    assert atoms.index("moov") < atoms.index("mdat")
    assert abs(float(info["format"]["duration"]) - 2.0) <= 1 / 30 + 0.03
    ok, stderr = decodes_to_end(result)
    assert ok, stderr


def test_total_length_limit_from_settings(settings, make_client, tmp_path):
    client = make_client(settings, max_total_seconds=2)
    one = upload_id(client, make_video(tmp_path / "a.mp4", duration=1.0))
    another = upload_id(client, make_video(tmp_path / "b.mp4", duration=1.0))
    longer = upload_id(client, make_video(tmp_path / "c.mp4", duration=1.5))

    accepted = _merge(client, [one, another])
    wait_for_job(client, accepted.json()["id"])
    rejected = _merge(client, [one, longer])

    assert accepted.status_code == 202
    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "too_long"


@pytest.mark.parametrize(
    ("make_body", "code"),
    [
        (lambda a, b: _items_body([a]), "too_few_items"),
        (lambda a, b: _items_body([]), "no_video"),
        (lambda a, b: _items_body([a, a]), "duplicate_video"),
        (lambda a, b: _items_body([a, "fedcba9876543210fedcba9876543210"]), "video_not_found"),
        (lambda a, b: _items_body([a, "../uploads/x"]), "video_not_found"),
        (lambda a, b: _items_body([a, "0123456789abcdef0123456789abcde"]), "video_not_found"),
        (lambda a, b: {"video_ids": [a, b]}, "invalid_request"),
    ],
)
def test_invalid_requests_are_rejected_with_422(client, tmp_path, make_body, code):
    a = upload_id(client, make_video(tmp_path / "a.mp4"))
    b = upload_id(client, make_video(tmp_path / "b.mp4"))

    response = client.post("/api/merges", json=make_body(a, b))

    assert response.status_code == 422
    assert response.json()["error"]["code"] == code


def test_ids_pointing_outside_uploads_are_not_read(client, settings, tmp_path):
    good = upload_id(client, make_video(tmp_path / "a.mp4"))
    real = settings.storage_dir / "uploads" / f"{good}.json"
    # 保存先の外(uploads の1つ上)に、本物と同じ形のメタ情報と動画を置く
    outside = settings.storage_dir / "evil"
    outside.with_suffix(".json").write_text(real.read_text())
    outside.with_suffix(".bin").write_bytes((settings.storage_dir / "uploads" / f"{good}.bin").read_bytes())

    response = _merge(client, [good, "../evil"])

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "video_not_found"


def test_first_audio_track_is_used_when_there_are_two(client, settings, tmp_path):
    two_tracks = tmp_path / "two.mkv"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=1",
         "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
         "-map", "0:v", "-map", "1:a", "-map", "2:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
         "-shortest", str(two_tracks)],
        check=True,
    )
    ids = [upload_id(client, two_tracks), upload_id(client, make_video(tmp_path / "b.mp4", audio=False))]

    result = _merge_ok(client, settings, ids)

    assert max_volume_db(result, start=0.1, duration=0.8) < -60


def test_second_merge_while_running_is_rejected_with_409(client, tmp_path):
    ids = [upload_id(client, make_video(tmp_path / f"{i}.mp4", duration=10.0, color=None, width=640, height=360))
           for i in range(2)]
    first = _merge(client, ids)
    assert client.get(f"/api/merges/{first.json()['id']}").json()["status"] == "running"

    second = _merge(client, ids)

    assert second.status_code == 409
    assert second.json() == {"error": {"code": "merge_in_progress", "message": "別の結合が実行中です"}}
    wait_for_job(client, first.json()["id"])


def test_broken_video_fails_the_job_and_leaves_no_files(client, settings, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    good = upload_id(client, make_video(tmp_path / "good.mp4"))
    broken = upload_id(client, make_video(tmp_path / "IMG_0012.mp4"), file_name="IMG_0012.MOV")
    # アップロード後に中身が壊れた状態を作る(ffprobe は通ったが、変換で失敗する)
    (settings.storage_dir / "uploads" / f"{broken}.bin").write_bytes((FIXTURES_DIR / "not_a_video.mp4").read_bytes())

    response = _merge(client, [good, broken])
    job = wait_for_job(client, response.json()["id"])

    assert job["status"] == "failed"
    assert job["error"] == {"code": "merge_failed", "message": "2番目の動画『IMG_0012.MOV』の変換に失敗しました"}
    job_dir = settings.storage_dir / "merges" / job["id"]
    leftovers = sorted(p.name for p in job_dir.iterdir()) if job_dir.exists() else []
    assert leftovers == []
    errors = [r for r in caplog.records if getattr(r, "fields", {}).get("name") == "merge.run_merge_job"]
    assert errors and errors[0].levelno == logging.ERROR
    assert errors[0].fields["video_ids"] == [good, broken]
    assert (errors[0].fields["failed_index"], errors[0].fields["failed_video_id"]) == (2, broken)
    assert "err" in errors[0].fields
    assert not any("IMG_0012" in json.dumps(getattr(r, "fields", {})) + r.getMessage() for r in caplog.records)
    task = client.app.state.merge_jobs.get(job["id"]).task
    assert type(task.exception()).__name__ == "ProcessFailedError"


def test_video_truncated_in_the_middle_fails_the_job_and_leaves_no_files(client, settings, tmp_path):
    good = upload_id(client, make_video(tmp_path / "good.mp4"))
    source = tmp_path / "cut.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=3", "-f", "lavfi",
         "-i", "sine=d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart",
         str(source)],
        check=True,
    )
    cut = tmp_path / "half.mp4"
    cut.write_bytes(source.read_bytes()[: source.stat().st_size // 2])
    truncated = upload_id(client, cut, file_name="half.mp4")

    job = wait_for_job(client, _merge(client, [good, truncated]).json()["id"])

    assert job["status"] == "failed"
    assert job["error"]["message"] == "2番目の動画『half.mp4』の変換に失敗しました"
    job_dir = settings.storage_dir / "merges" / job["id"]
    leftovers = sorted(p.name for p in job_dir.iterdir()) if job_dir.exists() else []
    assert leftovers == []


def test_job_logs_carry_request_id_of_the_post(client, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    ids = [upload_id(client, make_video(tmp_path / f"{i}.mp4")) for i in range(2)]

    response = _merge(client, ids)
    wait_for_job(client, response.json()["id"])

    done = [r for r in caplog.records if getattr(r, "fields", {}).get("name") == "merge.run_merge_job"]
    assert done[0].levelno == logging.INFO
    assert done[0].fields["request_id"] == response.headers["X-Request-ID"]
    assert done[0].fields["video_ids"] == ids


def test_starting_next_merge_removes_previous_job_directory(client, settings, tmp_path):
    ids = [upload_id(client, make_video(tmp_path / f"{i}.mp4")) for i in range(2)]
    first = _merge_ok(client, settings, ids)

    _merge_ok(client, settings, ids)

    assert not first.parent.exists()


def test_intermediate_files_are_removed_after_success(client, settings, tmp_path):
    ids = [upload_id(client, make_video(tmp_path / f"{i}.mp4")) for i in range(2)]

    result = _merge_ok(client, settings, ids)

    assert sorted(p.name for p in result.parent.iterdir()) == ["result.mp4"]


def test_unknown_job_returns_404(client):
    response = client.get("/api/merges/0123456789abcdef0123456789abcdef")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "merge_not_found"
