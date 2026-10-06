from tests.conftest import FIXTURES_DIR
from tests.support.api import upload_id, wait_for_job
from tests.support.make_video import make_video


def _merge(client, ids):
    return client.post("/api/merges", json={"video_ids": ids}).json()["id"]


def test_completed_result_is_downloaded_as_attachment(client, settings, tmp_path):
    ids = [upload_id(client, make_video(tmp_path / f"{i}.mp4")) for i in range(2)]
    job_id = _merge(client, ids)
    wait_for_job(client, job_id)

    response = client.get(f"/api/merges/{job_id}/download")

    assert response.status_code == 200
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    file_name = disposition.split('filename="')[1].rstrip('"')
    assert file_name.startswith("merged-") and file_name.endswith(".mp4") and len(file_name) == len("merged-20261007-090503.mp4")
    assert response.content == (settings.storage_dir / "merges" / job_id / "result.mp4").read_bytes()


def test_unknown_and_malformed_job_ids_return_404(client):
    unknown = client.get("/api/merges/0123456789abcdef0123456789abcdef/download")
    malformed = client.get("/api/merges/0123/download")

    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "result_not_found"
    assert malformed.status_code == 404


def test_running_job_returns_404(client, tmp_path):
    ids = [upload_id(client, make_video(tmp_path / f"{i}.mp4", duration=10.0, color=None, width=640, height=360))
           for i in range(2)]
    job_id = _merge(client, ids)
    assert client.get(f"/api/merges/{job_id}").json()["status"] == "running"

    response = client.get(f"/api/merges/{job_id}/download")

    assert response.status_code == 404
    wait_for_job(client, job_id)


def test_failed_job_returns_404(client, settings, tmp_path):
    good = upload_id(client, make_video(tmp_path / "good.mp4"))
    broken = upload_id(client, make_video(tmp_path / "broken.mp4"))
    (settings.storage_dir / "uploads" / f"{broken}.bin").write_bytes((FIXTURES_DIR / "not_a_video.mp4").read_bytes())
    job_id = _merge(client, [good, broken])
    assert wait_for_job(client, job_id)["status"] == "failed"

    assert client.get(f"/api/merges/{job_id}/download").status_code == 404


def test_path_traversal_in_job_id_cannot_reach_uploads(client, tmp_path):
    video_id = upload_id(client, make_video(tmp_path / "a.mp4"))

    response = client.get(f"/api/merges/..%2Fuploads%2F{video_id}/download")

    assert response.status_code == 404
    assert response.content[:4] != b"\x00\x00\x00\x20"


def test_upload_video_id_used_as_job_id_does_not_return_the_upload(client, tmp_path):
    video_id = upload_id(client, make_video(tmp_path / "a.mp4"))

    response = client.get(f"/api/merges/{video_id}/download")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "result_not_found"
