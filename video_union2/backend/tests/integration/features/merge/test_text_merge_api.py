import json
import logging

import pytest

from tests.support.api import upload_id, wait_for_job
from tests.support.bright_bbox import bright_bbox
from tests.support.make_video import make_video
from tests.support.probe import audio_streams, decodes_to_end, max_volume_db, probe, video_stream
from tests.support.sample_pixel import is_close, sample_pixel

RED, BLUE, WHITE, BLACK = (255, 0, 0), (0, 0, 255), (255, 255, 255), (0, 0, 0)
# テキストの本文がログに出ていないかを探すための、ほかに現れない文字列
SECRET = "秘密の見出し"


def _video(client, tmp_path, name, color, **kwargs):
    return upload_id(client, make_video(tmp_path / f"{name}.mp4", color=color, **kwargs))


def _v(video_id):
    return {"type": "video", "video_id": video_id}


def _t(text="■", tenths=10):
    return {"type": "text", "text": text, "duration_tenths": tenths}


def _merge(client, items):
    return client.post("/api/merges", json={"items": items})


def _merge_ok(client, settings, items):
    response = _merge(client, items)
    assert response.status_code == 202, response.text
    job = wait_for_job(client, response.json()["id"])
    assert job["status"] == "succeeded", job
    return settings.storage_dir / "merges" / job["id"] / "result.mp4"


def _duration(path):
    return float(probe(path)["format"]["duration"])


def _logs_text(caplog):
    return "\n".join(json.dumps(getattr(r, "fields", {}), ensure_ascii=False) + r.getMessage() for r in caplog.records)


def test_text_scene_is_shown_between_videos_as_white_on_black(client, settings, tmp_path):
    red = _video(client, tmp_path, "red", "red")
    blue = _video(client, tmp_path, "blue", "blue")

    result = _merge_ok(client, settings, [_v(red), _t("■", 10), _v(blue)])

    assert is_close(sample_pixel(result, at_seconds=0.5, x=160, y=90), RED)
    assert is_close(sample_pixel(result, at_seconds=1.5, x=159, y=89), WHITE)
    assert [is_close(sample_pixel(result, at_seconds=1.5, x=x, y=y), BLACK)
            for x, y in ((0, 0), (318, 0), (0, 178), (318, 178))] == [True] * 4
    assert is_close(sample_pixel(result, at_seconds=2.5, x=160, y=90), BLUE)
    assert abs(_duration(result) - 3.0) <= 1 / 30 + 0.03


def test_text_scene_length_follows_the_given_duration_within_a_tenth_of_a_second(client, settings, tmp_path):
    video = _video(client, tmp_path, "red", "red", fps="30000/1001")

    result = _merge_ok(client, settings, [_v(video), _t("■", 55)])

    text_part = _duration(result) - 1.0
    frame = 1001 / 30000
    assert abs(text_part - 165 * frame) <= frame + 0.03
    assert abs(text_part - 5.5) <= 0.1


def test_text_scenes_can_be_placed_before_and_after_a_single_video(client, settings, tmp_path):
    blue = _video(client, tmp_path, "blue", "blue")

    result = _merge_ok(client, settings, [_t("■", 10), _v(blue), _t("■", 10)])

    colors = [sample_pixel(result, at_seconds=t, x=159, y=89) for t in (0.5, 1.5, 2.5)]
    assert [is_close(c, e) for c, e in zip(colors, (WHITE, BLUE, WHITE))] == [True] * 3, colors


def test_twenty_by_five_glyphs_fit_inside_the_output_mixed_from_landscape_and_portrait(client, settings, tmp_path):
    wide = _video(client, tmp_path, "wide", "red", width=1920, height=1080, audio=False)
    tall = _video(client, tmp_path, "tall", "blue", width=1080, height=1920, audio=False)

    result = _merge_ok(client, settings, [_v(wide), _t("\n".join(["■" * 20] * 5), 10), _v(tall)])

    assert (video_stream(probe(result))["width"], video_stream(probe(result))["height"]) == (1920, 1920)
    left, top, right, bottom = bright_bbox(result, at_seconds=1.5)
    assert left >= 96 and right <= 1824 and top >= 96 and bottom <= 1824, (left, top, right, bottom)


def test_text_scene_is_silent_and_keeps_the_output_format(client, settings, tmp_path):
    red = _video(client, tmp_path, "red", "red")
    blue = _video(client, tmp_path, "blue", "blue")

    result = _merge_ok(client, settings, [_v(red), _t("■", 10), _v(blue)])

    info = probe(result)
    audio = audio_streams(info)
    assert [(a["sample_rate"], a["channels"]) for a in audio] == [("48000", 2)]
    assert max_volume_db(result, start=1.1, duration=0.8) < -80
    assert video_stream(info)["avg_frame_rate"] == "30/1"
    ok, stderr = decodes_to_end(result)
    assert ok, stderr


def test_text_scene_durations_count_toward_the_total_length_limit(settings, make_client, tmp_path):
    client = make_client(settings, max_total_seconds=3)
    video = _video(client, tmp_path, "red", "red")

    accepted = _merge(client, [_v(video), _t("■", 20)])
    assert accepted.status_code == 202, accepted.text
    wait_for_job(client, accepted.json()["id"])
    rejected = _merge(client, [_v(video), _t("■", 21)])

    assert rejected.status_code == 422
    # 上限3秒(0分)を0.1秒超え、秒に切り上げて1秒
    assert rejected.json()["error"] == {"code": "too_long", "message": "結合後の長さが0分を1秒超えています"}


def test_text_scenes_do_not_count_toward_the_video_limit(settings, make_client, tmp_path):
    client = make_client(settings, max_videos=2)
    red = _video(client, tmp_path, "red", "red")
    blue = _video(client, tmp_path, "blue", "blue")

    response = _merge(client, [_v(red), _t(), _v(blue), _t(), _t()])

    assert response.status_code == 202, response.text
    assert wait_for_job(client, response.json()["id"])["status"] == "succeeded"


def test_text_scenes_alone_cannot_be_merged(client):
    response = _merge(client, [_t(), _t()])

    assert response.status_code == 422
    assert response.json()["error"] == {"code": "no_video", "message": "結合するには動画が1本以上必要です"}


@pytest.mark.parametrize("text, code, message", [
    ("あ" * 21, "invalid_text_scene", "2番目のテキストの場面: 1行は20文字までです(1行目が21文字)"),
    ("\n".join("あ" * 6), "invalid_text_scene", "2番目のテキストの場面: 5行までです(6行あります)"),
    (" \n　", "invalid_text_scene", "2番目のテキストの場面: テキストを入力してください"),
    ("京都\t嵐山", "unsupported_characters", "2番目のテキストの場面: 表示できない文字が含まれています: タブ"),
    ("京都😀", "unsupported_characters", "2番目のテキストの場面: 表示できない文字が含まれています: 😀"),
])
def test_invalid_text_is_rejected_with_its_position_and_no_job_is_started(client, tmp_path, text, code, message):
    video = _video(client, tmp_path, "red", "red")

    response = _merge(client, [_v(video), _t(text)])
    accepted = _merge(client, [_v(video), _t("京都")])

    assert response.status_code == 422
    assert response.json()["error"] == {"code": code, "message": message}
    assert accepted.status_code == 202, accepted.text
    wait_for_job(client, accepted.json()["id"])


@pytest.mark.parametrize("duration", [5.5, "55", None])
def test_duration_that_is_not_an_integer_is_a_malformed_request(client, tmp_path, duration):
    video = _video(client, tmp_path, "red", "red")

    response = _merge(client, [_v(video), {"type": "text", "text": "京都", "duration_tenths": duration}])

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


@pytest.mark.parametrize("tenths, status", [(9, 422), (10, 202), (600, 202), (601, 422)])
def test_duration_from_1_to_60_seconds_is_accepted(client, tmp_path, tenths, status):
    video = _video(client, tmp_path, "red", "red", width=64, height=36, fps="5", audio=False)

    response = _merge(client, [_v(video), _t("京都", tenths)])

    assert response.status_code == status, response.text
    if status == 422:
        assert response.json()["error"]["code"] == "invalid_text_scene"
    else:
        assert wait_for_job(client, response.json()["id"], timeout=300)["status"] == "succeeded"


def test_request_body_over_one_megabyte_is_rejected_with_413(client, tmp_path):
    video = _video(client, tmp_path, "red", "red")
    body = json.dumps({"items": [_v(video)] + [_t("京都", 10)] * 30000})
    assert len(body.encode()) > 1024 * 1024

    response = client.post("/api/merges", content=body, headers={"Content-Type": "application/json"})

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request_too_large"


def test_text_with_quotes_colons_and_expansions_is_drawn_without_reaching_ffmpeg(client, settings, tmp_path):
    video = _video(client, tmp_path, "red", "red")

    result = _merge_ok(client, settings, [_v(video), _t("'a:b' %{pts}\n\\c;d,e[f]", 10)])

    files = sorted(str(p.relative_to(settings.storage_dir)) for p in settings.storage_dir.rglob("*") if p.is_file())
    assert [f for f in files if not f.startswith("uploads/")] == [str(result.relative_to(settings.storage_dir))]
    assert is_close(sample_pixel(result, at_seconds=0.5, x=160, y=90), RED)


def test_output_too_small_for_text_is_rejected_before_starting(client, settings, tmp_path):
    tiny = _video(client, tmp_path, "tiny", "red", width=22, height=22)
    small = _video(client, tmp_path, "small", "red", width=24, height=24)

    rejected = _merge(client, [_v(tiny), _t()])
    accepted = _merge_ok(client, settings, [_v(small), _t()])

    assert rejected.status_code == 422
    assert rejected.json()["error"] == {
        "code": "output_too_small_for_text",
        "message": "動画の解像度が小さすぎて、テキストの場面を表示できません(出力の短い辺が23ピクセル以上必要です)",
    }
    assert accepted.exists()


def test_failed_text_scene_is_reported_by_position_logged_by_step_and_cleaned_up(settings, make_client, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    client = make_client(settings, x264_preset="no-such-preset")
    video = _video(client, tmp_path, "red", "red")

    response = _merge(client, [_t(SECRET), _v(video)])
    job = wait_for_job(client, response.json()["id"])

    assert job["status"] == "failed"
    assert job["error"] == {"code": "merge_failed", "message": "1番目のテキストの場面の作成に失敗しました"}
    job_dir = settings.storage_dir / "merges" / job["id"]
    assert not job_dir.exists() or list(job_dir.iterdir()) == []
    failures = [r.fields for r in caplog.records
                if getattr(r, "fields", {}).get("name") == "merge.run_merge_job" and r.levelname == "ERROR"]
    assert len(failures) == 1
    fields = failures[0]
    assert {k: fields[k] for k in ("failed_index", "failed_kind", "failed_step", "width", "height",
                                   "line_count", "char_count", "text_scene_count")} == {
        "failed_index": 1, "failed_kind": "text", "failed_step": "encode", "width": 320, "height": 180,
        "line_count": 1, "char_count": 6, "text_scene_count": 1,
    }
    assert fields["err"]["type"] == "ProcessFailedError"
    assert SECRET not in _logs_text(caplog)


def test_successful_merge_logs_the_text_scene_count_but_not_the_text(client, settings, tmp_path, caplog):
    caplog.set_level(logging.INFO)
    video = _video(client, tmp_path, "red", "red")

    _merge_ok(client, settings, [_v(video), _t(SECRET), _t(SECRET + "二")])

    done = [r.fields for r in caplog.records if r.getMessage() == "結合が完了しました"]
    assert [d["text_scene_count"] for d in done] == [2]
    assert SECRET not in _logs_text(caplog)


@pytest.mark.parametrize("text_item", [
    {"type": "text", "text": SECRET + "😀", "duration_tenths": 30},
    {"type": "text", "text": SECRET + "\t", "duration_tenths": 30},
    {"type": "text", "text": SECRET * 4, "duration_tenths": 30},
    {"type": "txt", "text": SECRET, "duration_tenths": 30},
    {"type": "text", "text": SECRET, "duration_tenths": "55"},
])
def test_rejected_requests_do_not_log_the_text(client, tmp_path, caplog, text_item):
    caplog.set_level(logging.INFO)
    video = _video(client, tmp_path, "red", "red")

    response = client.post("/api/merges", json={"items": [_v(video), text_item]})

    assert response.status_code == 422
    assert SECRET not in _logs_text(caplog)


def test_too_large_request_does_not_log_the_text(client, caplog):
    caplog.set_level(logging.INFO)
    body = json.dumps({"items": [_t(SECRET, 10)] * 30000})

    response = client.post("/api/merges", content=body, headers={"Content-Type": "application/json"})

    assert response.status_code == 413
    assert SECRET not in _logs_text(caplog)
