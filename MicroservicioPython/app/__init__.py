from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from .config import get_settings
from .routes.analysis import router as analysis_router
from .routes.coins import router as coins_router
from .routes.health import router as health_router
from .routes.prices import router as prices_router
from .routes.sync import router as sync_router
from .routes.tables import router as tables_router
from .services import ensure_initial_sync, start_background_sync, stop_background_sync


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await ensure_initial_sync()
    task = await start_background_sync()
    try:
        yield
    finally:
        await stop_background_sync(task)


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
    application.include_router(health_router, tags=["health"])
    application.include_router(sync_router, prefix="/api", tags=["sync"])
    application.include_router(prices_router, prefix="/api", tags=["prices"])
    application.include_router(coins_router, prefix="/api", tags=["coins"])
    application.include_router(analysis_router, prefix="/api", tags=["analysis"])
    application.include_router(tables_router)
    return application


app = create_app()
