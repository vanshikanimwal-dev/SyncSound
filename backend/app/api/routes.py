from __future__ import annotations

import time

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, Field

from app.core.tokens import issue_token, read_token
from app.services.room_hub import RoomError, RoomHub

router = APIRouter()


class CreateBody(BaseModel):
    displayName: str = Field(max_length=80)
    roomName: str = ""
    source: str
    isPublic: bool
    requireApproval: bool
    queueEditing: str
    maxParticipants: int
    ttlMinutes: int
    sessionId: str


class JoinBody(BaseModel):
    code: str = Field(max_length=16)
    displayName: str = Field(max_length=80)
    sessionId: str


class TargetBody(BaseModel):
    targetParticipantId: str


class QueueAddBody(BaseModel):
    mediaId: str = Field(max_length=32)
    title: str = ""


class QueueItemBody(BaseModel):
    itemId: str


class QueueMoveBody(BaseModel):
    itemId: str
    direction: str


class PlaybackBody(BaseModel):
    action: str
    revision: int
    positionSeconds: float | None = None


def _hub(request: Request) -> RoomHub:
    return request.app.state.hub


def _token(request: Request, authorization: str | None, room_id: str) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise RoomError("UNAUTHORIZED", "You don't have permission to do that.")
    claims = read_token(request.app.state.settings.session_secret, authorization.removeprefix("Bearer ").strip())
    if claims is None or claims[0] != room_id:
        raise RoomError("UNAUTHORIZED", "You don't have permission to do that.")
    return claims[1]


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _membership(request: Request, room: dict, participant_id: str, status: str) -> dict:
    return {
        "status": status,
        "participantId": participant_id,
        "token": issue_token(request.app.state.settings.session_secret, room["id"], participant_id),
        "room": room,
    }


async def _broadcast(request: Request, room: dict | None, closed_room_id: str | None = None) -> None:
    manager = request.app.state.manager
    server_time = int(time.time() * 1000)
    if closed_room_id is not None:
        await manager.broadcast(closed_room_id, {"type": "room.closed", "roomId": closed_room_id, "serverTimeMs": server_time})
        return
    if room is not None:
        await manager.broadcast(room["id"], {"type": "room.snapshot", "room": room, "serverTimeMs": server_time})


@router.get("/api/health")
def health(request: Request) -> dict:
    hub = _hub(request)
    return {
        "status": "ok",
        "activeRooms": len(hub.rooms),
        "connectedParticipants": request.app.state.manager.connected_participants(),
    }


@router.post("/api/rooms", status_code=201)
async def create_room(body: CreateBody, request: Request) -> dict:
    settings = request.app.state.settings
    if not request.app.state.limiter.allow("create", _client_key(request), settings.create_limit):
        raise RoomError("RATE_LIMITED", "Too many rooms were created from this network. Wait a minute and try again.")
    payload = body.model_dump()
    payload["ttlMinutes"] = min(body.ttlMinutes, settings.room_ttl_minutes)
    room, participant_id = _hub(request).create(payload)
    return _membership(request, room, participant_id, "joined")


@router.post("/api/rooms/join")
async def join_room(body: JoinBody, request: Request) -> dict:
    settings = request.app.state.settings
    if not request.app.state.limiter.allow("join", _client_key(request), settings.join_limit):
        raise RoomError("RATE_LIMITED", "Too many join attempts. Wait a minute and try again.")
    status, room, participant_id = _hub(request).join(body.model_dump())
    await _broadcast(request, room)
    return _membership(request, room, participant_id, status)


@router.get("/api/rooms/{room_id}")
def get_room(room_id: str, request: Request, authorization: str | None = Header(default=None)) -> dict:
    participant_id = _token(request, authorization, room_id)
    return _hub(request).get(room_id, participant_id)


@router.post("/api/rooms/{room_id}/approve")
async def approve(room_id: str, body: TargetBody, request: Request, authorization: str | None = Header(default=None)) -> dict:
    participant_id = _token(request, authorization, room_id)
    room = _hub(request).approve(room_id, participant_id, body.targetParticipantId)
    await _broadcast(request, room)
    return room


@router.post("/api/rooms/{room_id}/deny")
async def deny(room_id: str, body: TargetBody, request: Request, authorization: str | None = Header(default=None)) -> dict:
    participant_id = _token(request, authorization, room_id)
    room = _hub(request).deny(room_id, participant_id, body.targetParticipantId)
    await _broadcast(request, room)
    return room


@router.post("/api/rooms/{room_id}/participants/remove")
async def remove_participant(
    room_id: str,
    body: TargetBody,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict:
    participant_id = _token(request, authorization, room_id)
    room = _hub(request).remove_participant(room_id, participant_id, body.targetParticipantId)
    await _broadcast(request, room)
    return room


@router.post("/api/rooms/{room_id}/leave")
async def leave(room_id: str, request: Request, authorization: str | None = Header(default=None)) -> dict:
    participant_id = _token(request, authorization, room_id)
    closed, room = _hub(request).leave(room_id, participant_id)
    if closed:
        await _broadcast(request, None, closed_room_id=room_id)
    else:
        await _broadcast(request, room)
    return {"closed": closed, "room": room}


@router.post("/api/rooms/{room_id}/close")
async def close(room_id: str, request: Request, authorization: str | None = Header(default=None)) -> dict:
    participant_id = _token(request, authorization, room_id)
    _hub(request).close(room_id, participant_id)
    await _broadcast(request, None, closed_room_id=room_id)
    return {"closed": True}


@router.post("/api/rooms/{room_id}/queue")
async def add_queue(
    room_id: str,
    body: QueueAddBody,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict:
    participant_id = _token(request, authorization, room_id)
    room = _hub(request).add_queue_item(room_id, participant_id, body.mediaId, body.title)
    await _broadcast(request, room)
    return room


@router.post("/api/rooms/{room_id}/queue/remove")
async def remove_queue(
    room_id: str,
    body: QueueItemBody,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict:
    participant_id = _token(request, authorization, room_id)
    room = _hub(request).remove_queue_item(room_id, participant_id, body.itemId)
    await _broadcast(request, room)
    return room


@router.post("/api/rooms/{room_id}/queue/move")
async def move_queue(
    room_id: str,
    body: QueueMoveBody,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict:
    participant_id = _token(request, authorization, room_id)
    room = _hub(request).move_queue_item(room_id, participant_id, body.itemId, body.direction)
    await _broadcast(request, room)
    return room


@router.post("/api/rooms/{room_id}/select")
async def select_track(
    room_id: str,
    body: QueueItemBody,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict:
    participant_id = _token(request, authorization, room_id)
    room = _hub(request).select_track(room_id, participant_id, body.itemId)
    await _broadcast(request, room)
    return room


@router.post("/api/rooms/{room_id}/playback")
async def playback(
    room_id: str,
    body: PlaybackBody,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict:
    participant_id = _token(request, authorization, room_id)
    hub = _hub(request)
    if body.action == "play":
        room = hub.play(room_id, participant_id, body.revision)
    elif body.action == "pause":
        room = hub.pause(room_id, participant_id, body.revision)
    elif body.action == "seek":
        if body.positionSeconds is None:
            raise RoomError("INVALID_INPUT", "Choose a valid position in the track.")
        room = hub.seek(room_id, participant_id, body.revision, body.positionSeconds)
    else:
        raise RoomError("INVALID_INPUT", "That playback action is not available.")
    await _broadcast(request, room)
    return room
