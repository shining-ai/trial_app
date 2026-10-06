from datetime import datetime
from zoneinfo import ZoneInfo

from app.features.download.build_download_name import build_download_name


def test_download_name_uses_completion_time():
    completed = datetime(2026, 10, 7, 9, 5, 3, tzinfo=ZoneInfo("Asia/Tokyo"))

    assert build_download_name(completed) == "merged-20261007-090503.mp4"
