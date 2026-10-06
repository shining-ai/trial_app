from contextvars import ContextVar

from app.lib.generate_id import generate_id

_request_id: ContextVar[str] = ContextVar("request_id", default="-")


def current_request_id() -> str:
    return _request_id.get()


def use_startup_request_id() -> None:
    """リクエストの外で動く起動時の処理に、固定の request_id を入れる。"""
    _request_id.set("startup")


class RequestIdMiddleware:
    """HTTP リクエストごとに request_id を発行する。

    contextvars で持つため、処理の中で asyncio.create_task した処理にも引き継がれる。
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = generate_id()
        token = _request_id.set(request_id)

        async def send_with_request_id(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            _request_id.reset(token)
