import logging

import pytest

from app.lib.run_process import ProcessFailedError, run_process

pytestmark = pytest.mark.anyio


async def test_successful_command_returns_zero_and_passes_each_stdout_line_in_order():
    lines = []

    result = await run_process(["sh", "-c", "echo one; echo two"], timeout_seconds=10, on_stdout_line=lines.append)

    assert result.returncode == 0
    assert lines == ["one", "two"]


async def test_failed_ffprobe_raises_with_returncode_and_stderr_tail_and_logs_error(caplog):
    caplog.set_level(logging.INFO)

    with pytest.raises(ProcessFailedError) as exc_info:
        await run_process(["ffprobe", "-v", "error", "/no/such/file.mp4"], timeout_seconds=10)

    error = exc_info.value
    assert error.returncode != 0
    assert any("No such file" in line for line in error.stderr_tail)
    record = next(r for r in caplog.records if r.levelno == logging.ERROR)
    assert record.fields["args"] == ["ffprobe", "-v", "error", "/no/such/file.mp4"]
    assert record.fields["returncode"] == error.returncode
    assert any("No such file" in line for line in record.fields["stderr_tail"])


async def test_command_exceeding_timeout_is_stopped_and_raises():
    with pytest.raises(ProcessFailedError) as exc_info:
        await run_process(["sleep", "5"], timeout_seconds=0.5)

    assert exc_info.value.timed_out is True


async def test_stderr_tail_keeps_only_last_50_lines():
    with pytest.raises(ProcessFailedError) as exc_info:
        await run_process(["sh", "-c", "for i in $(seq 1 80); do echo line$i >&2; done; exit 3"], timeout_seconds=10)

    tail = exc_info.value.stderr_tail
    assert len(tail) == 50
    assert tail[0] == "line31"
    assert tail[-1] == "line80"


async def test_ffmpeg_success_is_logged_as_info_but_fast_ffprobe_success_is_not(caplog, tmp_path):
    caplog.set_level(logging.INFO)
    video = tmp_path / "a.mp4"

    await run_process(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x32:d=0.2", "-c:v", "libx264", str(video)],
        timeout_seconds=30,
    )
    await run_process(["ffprobe", "-v", "error", str(video)], timeout_seconds=30)

    infos = [r for r in caplog.records if r.levelno == logging.INFO]
    assert [r.fields["program"] for r in infos] == ["ffmpeg"]
    assert "ms" in infos[0].fields
