"""テストで動画の情報を調べる補助関数。"""

import json
import subprocess
from pathlib import Path


def probe(path: Path) -> dict:
    """ffprobe の format と streams を JSON で返す。"""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def video_stream(info: dict) -> dict:
    return next(s for s in info["streams"] if s["codec_type"] == "video")


def audio_streams(info: dict) -> list[dict]:
    return [s for s in info["streams"] if s["codec_type"] == "audio"]


def frame_timestamps(path: Path) -> list[float]:
    """映像の各フレームの表示時刻(秒)を返す。"""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return [float(line.strip(",")) for line in result.stdout.split() if line.strip(",")]


def max_volume_db(path: Path, *, start: float, duration: float) -> float:
    """指定区間の音声の最大音量(dB)を返す。無音ならおよそ -91 dB になる。"""
    result = subprocess.run(
        ["ffmpeg", "-v", "info", "-ss", str(start), "-t", str(duration), "-i", str(path),
         "-vn", "-af", "volumedetect", "-f", "null", "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    for line in result.stderr.splitlines():
        if "max_volume:" in line:
            value = line.split("max_volume:")[1].split("dB")[0].strip()
            return float("-inf") if value == "-inf" else float(value)
    raise AssertionError("音量を読み取れませんでした")


def top_level_atoms(path: Path) -> list[str]:
    """MP4 の最上位のボックスの種類を、ファイル内の順に返す。"""
    names = []
    with path.open("rb") as f:
        while header := f.read(8):
            if len(header) < 8:
                break
            size = int.from_bytes(header[:4], "big")
            names.append(header[4:8].decode("latin-1"))
            if size == 1:
                size = int.from_bytes(f.read(8), "big")
                f.seek(size - 16, 1)
            elif size == 0:
                break
            else:
                f.seek(size - 8, 1)
    return names


def decodes_to_end(path: Path) -> tuple[bool, str]:
    """最後までデコードしてエラーがないかを返す(成功したか、エラー出力)。"""
    result = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"], capture_output=True, text=True)
    return result.returncode == 0 and result.stderr.strip() == "", result.stderr
