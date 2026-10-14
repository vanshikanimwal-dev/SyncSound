from __future__ import annotations

import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.tokens import read_token
from app.services.room_hub import RoomError

ws_router = APIRouter()

COMMANDS = {
    "playback.play.request",
    "playback.pause.request",
    "playback.seek.request",
    "participant.heartbeat",
    "clock.sync.request",
    "room.snapshot.request",
}


@ws_router.websocket("/ws/rooms/{room_id}")
async def room_socket(websocket: WebSocket, room_id: str) -> None:
    token = websocket.query_params.get("token", "")
    secret = websocket.app.state.settings.session_secret
    claims = read_token(secret, token)
    if claims is None or claims[0] != room_id:
        await websocket.close(code=1008)
        return
    participant_id = claims[1]
    hub = websocket.app.state.hub
    manager = websocket.app.state.manager
    try:
        hub.get(room_id, participant_id)
    except RoomError:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    manager.add(room_id, websocket, participant_id)
    if manager.count(room_id, participant_id) == 1:
        room = hub.set_connection(room_id, participant_id, True)
        if room is not None:
            await manager.broadcast(room_id, _snapshot(hub, room))
    else:
        await websocket.send_json(_snapshot(hub, hub.get(room_id, participant_id)))

    try:
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict) or message.get("type") not in COMMANDS:
                await websocket.send_json(
                    {"type": "room.error", "code": "INVALID_INPUT", "message": "That message was not understood."}
                )
                continue
            kind = message["type"]
            if kind == "clock.sync.request":
                await websocket.send_json({"type": "clock.sync.response", "serverTimeMs": int(time.time() * 1000)})
                continue
            if kind == "participant.heartbeat":
                room = hub.set_connection(room_id, participant_id, True)
                if room is not None:
                    await websocket.send_json(_snapshot(hub, room))
                continue
            if kind == "room.snapshot.request":
                await websocket.send_json(_snapshot(hub, hub.get(room_id, participant_id)))
                continue
            try:
                room = _command(hub, room_id, participant_id, message)
            except RoomError as error:
                await websocket.send_json({"type": "room.error", "code": error.code, "message": error.message})
                continue
            await manager.broadcast(room_id, _snapshot(hub, room))
    except WebSocketDisconnect:
        pass
    except RuntimeError:
        pass
    finally:
        manager.discard(room_id, websocket)
        if manager.count(room_id, participant_id) == 0:
            room = hub.set_connection(room_id, participant_id, False)
            if room is not None:
                await manager.broadcast(room_id, _snapshot(hub, room))


def _command(hub, room_id: str, participant_id: str, message: dict):
    kind = message["type"]
    revision = message.get("revision")
    if kind == "playback.play.request":
        return hub.play(room_id, participant_id, revision)
    if kind == "playback.pause.request":
        return hub.pause(room_id, participant_id, revision)
    if kind == "playback.seek.request":
        return hub.seek(room_id, participant_id, revision, message.get("positionSeconds"))
    raise RoomError("INVALID_INPUT", "That message was not understood.")


def _snapshot(hub, room: dict) -> dict:
    return {"type": "room.snapshot", "room": room, "serverTimeMs": int(hub.now().timestamp() * 1000)}
