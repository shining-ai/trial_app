"""結合テストで API を呼ぶ補助関数。"""

import time
from pathlib import Path
from urllib.parse import quote


def upload(client, path: Path, file_name: str | None = None):
    return client.post(
        "/api/videos",
        content=path.read_bytes(),
        headers={"Content-Type": "application/octet-stream", "X-File-Name": quote(file_name or path.name)},
    )


def upload_id(client, path: Path, file_name: str | None = None) -> str:
    response = upload(client, path, file_name)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def wait_for_job(client, job_id: str, timeout: float = 120) -> dict:
    """結合ジョブが running でなくなるまで待ち、最後の状態を返す。"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"/api/merges/{job_id}").json()
        if job["status"] != "running":
            return job
        time.sleep(0.1)
    raise AssertionError("結合が時間内に終わりませんでした")
