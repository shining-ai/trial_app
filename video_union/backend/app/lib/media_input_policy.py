"""FFmpeg・ffprobe に渡す、信用できない入力の制限(開けるプロトコルと入れ物の形式)。"""

# FR-013 で受け付ける入れ物の形式(MP4・MOV、MKV・WebM、AVI、MPEG-TS・PS、WMV、FLV)
ALLOWED_FORMATS: tuple[str, ...] = (
    "mov", "mp4", "m4a", "3gp", "3g2", "mj2", "matroska", "webm", "avi", "mpegts", "mpeg", "asf", "flv",
)


def input_restriction_args() -> list[str]:
    """入力の直前に置く引数。ローカルファイル以外のプロトコルと、許可していない形式を開かせない。"""
    return ["-protocol_whitelist", "file", "-format_whitelist", ",".join(ALLOWED_FORMATS)]


def is_allowed_format(format_names: tuple[str, ...]) -> bool:
    """ffprobe の format_name の要素のいずれかが許可リストにあるか。"""
    return any(name in ALLOWED_FORMATS for name in format_names)
