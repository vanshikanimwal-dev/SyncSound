from __future__ import annotations

import os
from dataclasses import dataclass

DEV_SECRET = "dev-syncsound-change-me"


@dataclass(frozen=True)
class Settings:
    app_env: str
    session_secret: str
    database_url: str
    cors_origins: list[str]
    room_max_participants: int
    room_ttl_minutes: int
    create_limit: int
    join_limit: int
    disconnect_grace_seconds: int


def load_settings() -> Settings:
    app_env = os.getenv("APP_ENV", "development")
    secret = os.getenv("SESSION_SECRET", DEV_SECRET)
    if app_env == "production" and secret in ("", DEV_SECRET):
        raise RuntimeError("SESSION_SECRET must be set to a unique value in production.")
    database_url = os.getenv("DATABASE_URL", "sqlite:///./syncsound.db")
    if database_url == "":
        database_url = "sqlite:///./syncsound.db"
    origins = [item.strip() for item in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if item.strip()]
    return Settings(
        app_env=app_env,
        session_secret=secret,
        database_url=database_url,
        cors_origins=origins,
        room_max_participants=_int_env("ROOM_MAX_PARTICIPANTS", 20, 2, 20),
        room_ttl_minutes=_int_env("ROOM_TTL_MINUTES", 240, 1, 24 * 60),
        create_limit=_int_env("CREATE_RATE_LIMIT", 20, 1, 1000),
        join_limit=_int_env("JOIN_RATE_LIMIT", 60, 1, 1000),
        disconnect_grace_seconds=_int_env("HOST_DISCONNECT_GRACE_SECONDS", 30, 5, 300),
    )


def _int_env(name: str, default: int, low: int, high: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer.") from error
    if value < low or value > high:
        raise RuntimeError(f"{name} must be between {low} and {high}.")
    return value
