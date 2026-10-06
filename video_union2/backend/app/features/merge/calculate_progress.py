# 2段目(再エンコードなしの結合)と後片付けの分を残しておく
_FIRST_STAGE_SHARE = 0.95


def calculate_progress(*, done_seconds: float, current_seconds: float, total_seconds: float) -> float:
    """完了した長さと変換中の時間から、1段目の進み具合(0〜0.95)を計算する。"""
    if total_seconds <= 0:
        return 0.0
    ratio = (done_seconds + max(current_seconds, 0.0)) / total_seconds
    return round(min(max(ratio, 0.0), 1.0) * _FIRST_STAGE_SHARE, 6)
