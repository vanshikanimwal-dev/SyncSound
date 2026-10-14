from __future__ import annotations

import json

from sqlalchemy import String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class StoredRoom(Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    expires_at: Mapped[str] = mapped_column(String(40), index=True)
    document: Mapped[str] = mapped_column(Text)


class SqliteStore:
    """Single-process room storage. Restarting the server reloads rooms from this file."""

    def __init__(self, database_url: str) -> None:
        connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
        self.engine = create_engine(database_url, connect_args=connect_args)
        Base.metadata.create_all(self.engine)
        self._session = sessionmaker(self.engine)

    def load(self) -> list[dict]:
        with self._session() as session:
            rows = session.scalars(select(StoredRoom)).all()
            rooms: list[dict] = []
            for row in rows:
                try:
                    parsed = json.loads(row.document)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    rooms.append(parsed)
            return rooms

    def save_room(self, room: dict) -> None:
        with self._session() as session:
            self._upsert(session, room)
            session.commit()

    def delete_room(self, room_id: str) -> None:
        with self._session() as session:
            row = session.get(StoredRoom, room_id)
            if row is not None:
                session.delete(row)
                session.commit()

    def _upsert(self, session: Session, room: dict) -> None:
        row = session.get(StoredRoom, room["id"])
        document = json.dumps(room)
        if row is None:
            session.add(
                StoredRoom(
                    id=room["id"],
                    code=room["code"],
                    expires_at=room["expiresAt"],
                    document=document,
                )
            )
            return
        row.code = room["code"]
        row.expires_at = room["expiresAt"]
        row.document = document
