from datetime import datetime


def build_download_name(completed_at: datetime) -> str:
    """結合の完了時刻から、ダウンロードするファイル名を作る。"""
    return completed_at.strftime("merged-%Y%m%d-%H%M%S.mp4")
