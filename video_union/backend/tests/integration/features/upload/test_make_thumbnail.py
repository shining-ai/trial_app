import pytest

from app.features.upload.make_thumbnail import make_thumbnail
from app.lib.run_process import ProcessFailedError
from tests.conftest import FIXTURES_DIR
from tests.support.make_video import make_video
from tests.support.probe import probe, video_stream
from tests.support.sample_pixel import is_close, sample_pixel


@pytest.mark.anyio
async def test_makes_jpeg_from_first_frame_of_video(tmp_path):
    video = make_video(tmp_path / "a.mp4", color="blue")
    output = tmp_path / "a.jpg"

    await make_thumbnail(video, output, video_stream_index=0, timeout_seconds=60)

    assert video_stream(probe(output))["codec_name"] == "mjpeg"
    assert is_close(sample_pixel(output, at_seconds=0, x=120, y=67), (0, 0, 255))


@pytest.mark.anyio
async def test_raises_when_input_is_not_a_video(tmp_path):
    with pytest.raises(ProcessFailedError):
        await make_thumbnail(FIXTURES_DIR / "not_a_video.mp4", tmp_path / "a.jpg", video_stream_index=0, timeout_seconds=60)


@pytest.mark.anyio
async def test_raises_when_stream_index_is_not_video(tmp_path):
    # 1番は音声のストリーム
    video = make_video(tmp_path / "a.mp4", audio=True)

    with pytest.raises(ProcessFailedError):
        await make_thumbnail(video, tmp_path / "a.jpg", video_stream_index=1, timeout_seconds=60)
