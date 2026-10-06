from fastapi import FastAPI

from app.features.health.router import router as health_router

app = FastAPI(title="動画結合アプリ")
app.include_router(health_router)
