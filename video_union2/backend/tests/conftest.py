import dataclasses
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.lib.config import Settings
from app.main import create_app

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def settings(tmp_path) -> Settings:
    """テストごとに専用の保存先を使う設定。上限は本番の既定値のまま。"""
    return Settings(storage_dir=tmp_path / "data")


@pytest.fixture
def make_client():
    """設定を受け取って TestClient を作る。起動処理(lifespan)も実行する。"""
    clients = []

    def _make(settings: Settings, **overrides) -> TestClient:
        client = TestClient(create_app(dataclasses.replace(settings, **overrides)))
        client.__enter__()
        clients.append(client)
        return client

    yield _make
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(settings, make_client) -> TestClient:
    return make_client(settings)
