from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.core.config import Settings, load_settings
from app.core.rate_limit import RateLimiter
from app.services.persistence import SqliteStore
from app.services.room_hub import RoomError, RoomHub, RoomStore
from app.ws.handler import ws_router
from app.ws.manager import ConnectionManager

logger = logging.getLogger("syncsound")

STATUS = {
    "ROOM_NOT_FOUND": 404,
    "ROOM_EXPIRED": 410,
    "ROOM_FULL": 409,
    "UNAUTHORIZED": 403,
    "INVALID_MEDIA": 400,
    "INVALID_INPUT": 400,
    "DUPLICATE_MEDIA": 409,
    "STALE_REVISION": 409,
    "RATE_LIMITED": 429,
    "PLAYBACK_NOT_READY": 409,
}


def create_app(store: RoomStore | None = None, settings: Settings | None = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        task = asyncio.create_task(_sweep_loop(application))
        yield
        task.cancel()

    application = FastAPI(title="SyncSound", version="0.1.0", lifespan=lifespan)
    application.state.settings = settings
    application.state.hub = RoomHub(
        store or SqliteStore(settings.database_url),
        grace_seconds=settings.disconnect_grace_seconds,
        max_participants_cap=settings.room_max_participants,
    )
    application.state.manager = ConnectionManager()
    application.state.limiter = RateLimiter()

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?",
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    application.include_router(router)
    application.include_router(ws_router)

    @application.exception_handler(RoomError)
    async def room_error(_request: Request, exc: RoomError) -> JSONResponse:
        return JSONResponse(status_code=STATUS.get(exc.code, 400), content={"code": exc.code, "message": exc.message})

    @application.exception_handler(Exception)
    async def unexpected(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled server error: %s", exc.__class__.__name__)
        return JSONResponse(status_code=500, content={"code": "INTERNAL", "message": "Something went wrong."})

    return application


async def _sweep_loop(application: FastAPI) -> None:
    while True:
        await asyncio.sleep(5)
        changed = application.state.hub.sweep_disconnects()
        for room in changed:
            await application.state.manager.broadcast(
                room["id"],
                {"type": "room.snapshot", "room": room, "serverTimeMs": _server_now(application)},
            )


def _server_now(application: FastAPI) -> int:
    return int(application.state.hub.now().timestamp() * 1000)


app = create_app()
