import pytest

from app.features.merge.format_excess import format_excess


@pytest.mark.parametrize(
    ("seconds", "expected"),
    [(0.001, "1秒"), (59.5, "1分"), (60, "1分"), (61, "1分1秒"), (135, "2分15秒"), (120, "2分")],
)
def test_excess_is_rounded_up_to_seconds_and_written_in_minutes_and_seconds(seconds, expected):
    assert format_excess(seconds) == expected
