_PREFIX = "out_time_us="


def parse_progress(line: str) -> float | None:
    """FFmpeg の -progress の1行から、変換済みの時間(秒)を取り出す。該当しない行は None。"""
    if not line.startswith(_PREFIX):
        return None
    try:
        return int(line[len(_PREFIX):]) / 1_000_000
    except ValueError:
        return None
