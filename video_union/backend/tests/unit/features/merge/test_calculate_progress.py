from app.features.merge.calculate_progress import calculate_progress


def test_progress_is_done_plus_current_over_total_scaled_to_95_percent():
    assert calculate_progress(done_seconds=4.0, current_seconds=1.0, total_seconds=10.0) == 0.475


def test_progress_never_goes_below_zero_or_above_95_percent_before_finish():
    assert calculate_progress(done_seconds=0.0, current_seconds=-1.0, total_seconds=10.0) == 0.0
    assert calculate_progress(done_seconds=10.0, current_seconds=5.0, total_seconds=10.0) == 0.95


def test_zero_total_gives_zero():
    assert calculate_progress(done_seconds=0.0, current_seconds=0.0, total_seconds=0.0) == 0.0
