import pytest

from app.features.merge.parse_progress import parse_progress


def test_out_time_us_line_gives_seconds():
    assert parse_progress("out_time_us=1500000") == 1.5


@pytest.mark.parametrize("line", ["frame=10", "out_time_us=N/A", "progress=continue", "", "out_time=00:00:01.5"])
def test_unrelated_or_unknown_lines_are_ignored(line):
    assert parse_progress(line) is None
