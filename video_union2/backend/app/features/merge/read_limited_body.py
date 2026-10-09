from collections.abc import AsyncIterator

from app.lib.errors import AppError


async def read_limited_body(chunks: AsyncIterator[bytes], max_bytes: int) -> bytes:
    """本文を少しずつ読み、上限を超えた時点で読むのをやめて 413 の AppError を送出する。"""
    body = bytearray()
    async for chunk in chunks:
        body += chunk
        if len(body) > max_bytes:
            raise AppError(413, "request_too_large", "結合の依頼が大きすぎます")
    return bytes(body)
