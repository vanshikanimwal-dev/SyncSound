from __future__ import annotations

from collections import defaultdict

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


class ConnectionManager:
    def __init__(self) -> None:
        self._sockets: dict[str, dict[WebSocket, str]] = defaultdict(dict)

    def add(self, room_id: str, socket: WebSocket, participant_id: str) -> None:
        self._sockets[room_id][socket] = participant_id

    def discard(self, room_id: str, socket: WebSocket) -> str | None:
        room = self._sockets.get(room_id)
        if room is None:
            return None
        participant_id = room.pop(socket, None)
        if not room:
            self._sockets.pop(room_id, None)
        return participant_id

    def count(self, room_id: str, participant_id: str) -> int:
        room = self._sockets.get(room_id, {})
        return sum(1 for member_id in room.values() if member_id == participant_id)

    def connected_participants(self) -> int:
        return sum(len(set(members.values())) for members in self._sockets.values())

    async def broadcast(self, room_id: str, message: dict) -> None:
        sockets = list(self._sockets.get(room_id, {}))
        dead: list[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_json(message)
            except (RuntimeError, WebSocketDisconnect):
                dead.append(socket)
        for socket in dead:
            self.discard(room_id, socket)
