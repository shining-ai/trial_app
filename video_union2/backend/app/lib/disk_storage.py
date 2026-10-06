import re
from pathlib import Path

_ID_PATTERN = re.compile(r"[0-9a-f]{32}")


class InvalidIdError(ValueError):
    """ID の形式が不正なときに送出する。"""


class DiskStorage:
    """保存先のすべてのパスを、種類ごとのメソッドで返す。"""

    def __init__(self, root: Path):
        self._root = Path(root).resolve()

    @staticmethod
    def is_valid_id(value: str) -> bool:
        return isinstance(value, str) and _ID_PATTERN.fullmatch(value) is not None

    def uploads_dir(self) -> Path:
        return self._inside(self._root / "uploads")

    def merges_dir(self) -> Path:
        return self._inside(self._root / "merges")

    def upload_video_path(self, video_id: str) -> Path:
        return self._inside(self.uploads_dir() / f"{self._checked(video_id)}.bin")

    def upload_metadata_path(self, video_id: str) -> Path:
        return self._inside(self.uploads_dir() / f"{self._checked(video_id)}.json")

    def upload_temp_path(self, video_id: str) -> Path:
        return self._inside(self.uploads_dir() / f"{self._checked(video_id)}.part")

    def merge_job_dir(self, job_id: str) -> Path:
        return self._inside(self.merges_dir() / self._checked(job_id))

    def merge_parts_dir(self, job_id: str) -> Path:
        return self._inside(self.merge_job_dir(job_id) / "parts")

    def merge_part_path(self, job_id: str, index: int) -> Path:
        return self._inside(self.merge_parts_dir(job_id) / f"{index:04d}.mp4")

    def merge_list_path(self, job_id: str) -> Path:
        return self._inside(self.merge_job_dir(job_id) / "parts.txt")

    def merge_result_partial_path(self, job_id: str) -> Path:
        return self._inside(self.merge_job_dir(job_id) / "result.partial.mp4")

    def merge_result_path(self, job_id: str) -> Path:
        return self._inside(self.merge_job_dir(job_id) / "result.mp4")

    def _checked(self, value: str) -> str:
        if not self.is_valid_id(value):
            raise InvalidIdError("ID の形式が不正です")
        return value

    def _inside(self, path: Path) -> Path:
        resolved = path.resolve()
        if not resolved.is_relative_to(self._root):
            raise InvalidIdError("保存先の外を指すパスは作れません")
        return resolved
