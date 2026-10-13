import pytest

from app.features.merge.read_limited_body import read_limited_body
from app.lib.errors import AppError


async def _chunks(*parts: bytes):
    for part in parts:
        yield part


@pytest.mark.anyio
async def test_body_of_exactly_the_limit_is_read_whole():
    body = await read_limited_body(_chunks(b"a" * 600, b"b" * 424), 1024)

    assert body == b"a" * 600 + b"b" * 424


@pytest.mark.anyio
async def test_body_one_byte_over_the_limit_is_rejected_with_413():
    with pytest.raises(AppError) as error:
        await read_limited_body(_chunks(b"a" * 600, b"b" * 425), 1024)

    assert (error.value.status, error.value.code, error.value.message) == (
        413, "request_too_large", "結合の依頼が大きすぎます")


@pytest.mark.anyio
async def test_reading_stops_at_the_chunk_that_crosses_the_limit():
    read = []

    async def chunks():
        for part in (b"a" * 1000, b"b" * 100, b"c" * 100):
            read.append(part[:1])
            yield part

    with pytest.raises(AppError):
        await read_limited_body(chunks(), 1024)

    assert read == [b"a", b"b"]


@pytest.mark.anyio
async def test_empty_body_is_read_as_empty_bytes():
    assert await read_limited_body(_chunks(), 1024) == b""
