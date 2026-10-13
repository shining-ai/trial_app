import math


def format_excess(seconds: float) -> str:
    """超過の秒数を秒単位に切り上げ、「{m}分{s}秒」の形にする(画面と同じ書式)。"""
    total = math.ceil(round(seconds, 3))
    minutes, rest = divmod(total, 60)
    if minutes == 0:
        return f"{rest}秒"
    if rest == 0:
        return f"{minutes}分"
    return f"{minutes}分{rest}秒"
