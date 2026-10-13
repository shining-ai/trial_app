import math

from app.features.upload.video_info import VideoInfo


def parse_probe_output(probe: dict) -> VideoInfo:
    """ffprobe の JSON から VideoInfo を作る。映像・音声は最初のストリームを使う。"""
    streams = probe.get("streams", [])
    fmt = probe.get("format", {})
    format_names = tuple(n for n in fmt.get("format_name", "").split(",") if n)
    video = next(
        (s for s in streams if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")),
        None,
    )
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    has_audio = audio is not None
    audio_index = audio.get("index") if audio else None
    if video is None:
        return VideoInfo(format_names, False, _float(fmt.get("duration")), 0, 0, 0, 1, has_audio, None, audio_index)

    width, height = int(video.get("width", 0)), int(video.get("height", 0))
    if abs(_rotation(video)) % 180 == 90:
        width, height = height, width
    # 映像の長さ → Matroska・WebM の tags.DURATION("00:00:01.500000000")→ 入れ物の長さ、の順に、
    # 正の値が見つかるまで探す(録画が途中で止まったファイルでは 0 が入っていることがある)
    duration = next(
        (
            value
            for value in (
                _float(video.get("duration")),
                _clock(video.get("tags", {}).get("DURATION")),
                _float(fmt.get("duration")),
            )
            if value is not None and value > 0
        ),
        None,
    )
    fps_num, fps_den = _rate(video.get("avg_frame_rate"))
    if fps_num == 0:
        fps_num, fps_den = _rate(video.get("r_frame_rate"))
    return VideoInfo(
        format_names, True, duration, width, height, fps_num, fps_den, has_audio, video.get("index"), audio_index
    )


def _rotation(stream: dict) -> int:
    """表示行列(displaymatrix)の回転だけを読む。FFmpeg はタグの rotate では回転しないため使わない。"""
    for side_data in stream.get("side_data_list", []):
        if "rotation" in side_data:
            rotation = _float(side_data["rotation"])
            return int(round(rotation)) if rotation is not None and math.isfinite(rotation) else 0
    return 0


def _float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _clock(value) -> float | None:
    try:
        hours, minutes, seconds = str(value).split(":")
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    except ValueError:
        return None


def _rate(value) -> tuple[int, int]:
    try:
        num, den = (int(part) for part in str(value).split("/"))
    except ValueError:
        return 0, 1
    return (num, den) if den else (0, 1)
