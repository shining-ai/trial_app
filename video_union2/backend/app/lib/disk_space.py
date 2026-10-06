import shutil
from pathlib import Path


def directory_size(path: Path) -> int:
    """path の下にあるファイルの合計サイズ(バイト)を返す。path がなければ 0。"""
    root = Path(path)
    if not root.exists():
        return 0
    return sum(p.stat().st_size for p in root.rglob("*") if p.is_file())


def free_bytes(path: Path) -> int:
    """path を含むファイルシステムの空き容量(バイト)を返す。path がまだなければ、存在する親で調べる。"""
    target = Path(path)
    while not target.exists():
        target = target.parent
    return shutil.disk_usage(target).free
