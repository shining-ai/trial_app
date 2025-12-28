from pathlib import Path
import subprocess
import json
import tempfile


OUTPUT_NAME = "output.mp4"


def run(cmd):
    subprocess.run(cmd, check=True)


def probe_video(path: Path) -> dict:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,avg_frame_rate",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)["streams"][0]


def reencode_video(src: Path, dst: Path, fps: str, width: int, height: int):
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"
    )

    run(
        [
            "ffmpeg",
            "-y",
            "-i",
            src,
            "-vf",
            vf,
            "-r",
            fps,
            "-c:v",
            "libx264",
            "-crf",
            "18",
            "-preset",
            "slow",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            dst,
        ]
    )


def make_text_video(text: str, output: Path, width: int, height: int, fps: str):
    vf = (
        "drawtext="
        "fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:"
        f"text='{text}':"
        "fontcolor=white:"
        "fontsize=64:"
        "x=(w-text_w)/2:"
        "y=(h-text_h)/2"
    )

    run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=black:s={width}x{height}:d=1:r={fps}",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-shortest",
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-crf",
            "18",
            "-preset",
            "slow",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            output,
        ]
    )


def concat_with_text(*items):
    if not items:
        raise ValueError("no inputs")

    videos = [x for x in items if isinstance(x, Path)]
    if not videos:
        raise ValueError("at least one video is required")

    # 基準情報は最初の動画
    base = probe_video(videos[0])
    fps = base["avg_frame_rate"]

    # 解像度は全動画の最大
    widths = []
    heights = []
    for v in videos:
        info = probe_video(v)
        widths.append(info["width"])
        heights.append(info["height"])

    width = max(widths)
    height = max(heights)

    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        concat_list = []
        idx = 0

        for item in items:
            if isinstance(item, Path):
                out = d / f"v_{idx}.mp4"
                reencode_video(item, out, fps, width, height)
                concat_list.append(out)
                idx += 1
            elif isinstance(item, str):
                out = d / f"t_{idx}.mp4"
                make_text_video(item, out, width, height, fps)
                concat_list.append(out)
                idx += 1
            else:
                raise TypeError("items must be Path or str")

        list_file = d / "list.txt"
        list_file.write_text("\n".join(f"file '{p}'" for p in concat_list))

        run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                list_file,
                "-c",
                "copy",
                OUTPUT_NAME,
            ]
        )


if __name__ == "__main__":
    concat_with_text(
        "20241202",
        Path("20241202_101731.mp4"),
        "20241204",
        Path("20241204_174225.mp4"),
        "20241206",
        Path("20241206_121618.mp4"),
        Path("20241206_131355.mp4"),
        "20241208",
        Path("20241208_093919.mp4"),
        Path("20241208_181203.mp4"),
        "20241210",
        Path("20241210_131541.mp4"),
        "20241211",
        Path("20241211_133645.mp4"),
        "20241216",
        Path("20241216_100130.mp4"),
        "20241219",
        Path("20241219_125901.mp4"),
        "20241220",
        Path("20241220_163439.mp4"),
        "20241221",
        Path("20241221_163140.mp4"),
        "20241223",
        Path("20241223_101959.mp4"),
        "20241225",
        Path("20241225_091905.mp4"),
        Path("20241225_170756.mp4"),
        "20241226",
        Path("20241226_124928.mp4"),
        Path("20241226_150523.mp4"),
        "20241229",
        Path("20241229_185535.mp4"),
    )
