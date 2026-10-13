import asyncio

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.lib.request_context import RequestIdMiddleware, current_request_id, use_startup_request_id


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)

    @app.get("/ids")
    async def ids():
        in_request = current_request_id()
        task = asyncio.create_task(asyncio.sleep(0, result=None))
        await task

        async def read_in_task():
            return current_request_id()

        in_task = await asyncio.create_task(read_in_task())
        return {"in_request": in_request, "in_task": in_task}

    return app


def test_request_gets_new_32_hex_request_id_shared_with_created_task():
    client = TestClient(_app())

    first = client.get("/ids").json()
    second = client.get("/ids").json()

    assert len(first["in_request"]) == 32
    assert first["in_task"] == first["in_request"]
    assert second["in_request"] != first["in_request"]


def test_use_startup_request_id_sets_startup():
    async def run():
        use_startup_request_id()
        return current_request_id()

    assert asyncio.run(run()) == "startup"
