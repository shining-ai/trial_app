import shutil
from pathlib import Path


def free_bytes(path: Path) -> int:
    """path を含むファイルシステムの空き容量(バイト)を返す。path がまだなければ、存在する親で調べる。"""
    target = Path(path)
    while not target.exists():
        target = target.parent
    return shutil.disk_usage(target).free
