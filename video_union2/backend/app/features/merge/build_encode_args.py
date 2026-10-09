def build_encode_args(*, preset: str, crf: int) -> list[str]:
    """中間ファイルのエンコーダーの引数(映像・音声)を返す。

    2段目で再エンコードなしにつなぐため、動画とテキストの場面の中間ファイルはすべてこの設定で作る。
    """
    return [
        "-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-video_track_timescale", "90000",
    ]
