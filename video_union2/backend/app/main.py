from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.features.health.router import router as health_router
from app.lib.config import Settings
from app.lib.disk_storage import DiskStorage
from app.lib.errors import register_error_handlers
from app.lib.logger import configure_logging
from app.lib.request_context import RequestIdMiddleware, use_startup_request_id


def create_app(settings: Settings | None = None) -> FastAPI:
    """設定を受け取り、ルートとミドルウェアを登録したアプリを作る。"""
    settings = settings or Settings.from_env()
    storage = DiskStorage(settings.storage_dir)
    configure_logging()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        use_startup_request_id()
        storage.uploads_dir().mkdir(parents=True, exist_ok=True)
        storage.merges_dir().mkdir(parents=True, exist_ok=True)
        yield

    app = FastAPI(title="動画結合アプリ", lifespan=lifespan)
    app.state.settings = settings
    app.state.storage = storage
    app.add_middleware(RequestIdMiddleware)
    register_error_handlers(app)
    app.include_router(health_router)
    return app


app = create_app()
