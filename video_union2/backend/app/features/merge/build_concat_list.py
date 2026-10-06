from pathlib import Path


def build_concat_list(part_paths: list[Path], *, parts_dir: Path) -> str:
    """中間ファイルのパスの列から、concat demuxer の一覧ファイルの中身を作る。

    中間ファイルのフォルダの外を指すパスが混ざっていたら ValueError を送出する。
    """
    base = parts_dir.resolve()
    lines = ["ffconcat version 1.0"]
    for path in part_paths:
        resolved = path.resolve()
        if not resolved.is_relative_to(base):
            raise ValueError("中間ファイルのフォルダの外のパスは一覧に入れられません")
        escaped = str(resolved).replace("'", "'\\''")
        lines.append(f"file '{escaped}'")
    return "\n".join(lines) + "\n"
