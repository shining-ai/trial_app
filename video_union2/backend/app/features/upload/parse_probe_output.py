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
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    if video is None:
        return VideoInfo(format_names, False, _float(fmt.get("duration")), 0, 0, 0, 1, has_audio)

    width, height = int(video.get("width", 0)), int(video.get("height", 0))
    if abs(_rotation(video)) % 180 == 90:
        width, height = height, width
    duration = _float(video.get("duration"))
    if duration is None:
        duration = _float(fmt.get("duration"))
    fps_num, fps_den = _rate(video.get("avg_frame_rate"))
    if fps_num == 0:
        fps_num, fps_den = _rate(video.get("r_frame_rate"))
    return VideoInfo(format_names, True, duration, width, height, fps_num, fps_den, has_audio)


def _rotation(stream: dict) -> int:
    for side_data in stream.get("side_data_list", []):
        if "rotation" in side_data:
            return int(round(float(side_data["rotation"])))
    return int(stream.get("tags", {}).get("rotate", 0))


def _float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _rate(value) -> tuple[int, int]:
    try:
        num, den = (int(part) for part in str(value).split("/"))
    except ValueError:
        return 0, 1
    return (num, den) if den else (0, 1)
