"""Shared room coordination for one SyncSound server process."""

from __future__ import annotations

import copy
import re
import secrets
import threading
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Protocol

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
CODE_RE = re.compile(rf"^[{ALPHABET}]{{6}}$")
MAX_NAME = 40
MAX_ROOM_NAME = 60
MAX_TITLE = 120
MAX_QUEUE = 50
MIN_PEOPLE = 2
MAX_PEOPLE = 20
MAX_TTL = 24 * 60


class RoomError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class RoomStore(Protocol):
    def load(self) -> list[dict]: ...

    def save_room(self, room: dict) -> None: ...

    def delete_room(self, room_id: str) -> None: ...


class MemoryStore:
    def __init__(self) -> None:
        self.rooms: dict[str, dict] = {}

    def load(self) -> list[dict]:
        return [copy.deepcopy(room) for room in self.rooms.values()]

    def save_room(self, room: dict) -> None:
        self.rooms[room["id"]] = copy.deepcopy(room)

    def delete_room(self, room_id: str) -> None:
        self.rooms.pop(room_id, None)


def utc_now() -> datetime:
    return datetime.now(UTC)


def clean_text(value: str) -> str:
    without_controls = re.sub(r"[\u0000-\u001F\u007F]", "", value)
    return re.sub(r"\s+", " ", without_controls).strip()


class RoomHub:
    def __init__(
        self,
        store: RoomStore,
        now: Callable[[], datetime] | None = None,
        grace_seconds: int = 30,
        max_participants_cap: int = MAX_PEOPLE,
    ) -> None:
        self.store = store
        self.now = now or utc_now
        self.grace_seconds = grace_seconds
        self.max_participants_cap = max_participants_cap
        self._lock = threading.Lock()
        self.rooms: dict[str, dict] = {}
        for room in store.load():
            if isinstance(room, dict) and isinstance(room.get("id"), str):
                self.rooms[room["id"]] = room
        self._purge_locked()

    def create(self, payload: dict) -> tuple[dict, str]:
        display_name = self._name(payload.get("displayName", ""))
        source = payload.get("source")
        if source != "youtube":
            raise RoomError("INVALID_INPUT", "YouTube is the only playback source available.")
        if not isinstance(payload.get("isPublic"), bool) or not isinstance(payload.get("requireApproval"), bool):
            raise RoomError("INVALID_INPUT", "Room visibility settings are invalid.")
        queue_editing = payload.get("queueEditing")
        if queue_editing not in ("host", "everyone"):
            raise RoomError("INVALID_INPUT", "Choose who can edit the queue.")
        max_participants = payload.get("maxParticipants")
        if (
            not isinstance(max_participants, int)
            or isinstance(max_participants, bool)
            or max_participants < MIN_PEOPLE
            or max_participants > self.max_participants_cap
        ):
            raise RoomError(
                "INVALID_INPUT",
                f"Participant limit must be between {MIN_PEOPLE} and {self.max_participants_cap}.",
            )
        ttl = payload.get("ttlMinutes")
        if not isinstance(ttl, int) or isinstance(ttl, bool) or ttl < 1 or ttl > MAX_TTL:
            raise RoomError("INVALID_INPUT", "Room lifetime must be between 1 minute and 24 hours.")
        session_id = self._session(payload.get("sessionId", ""))
        created = self.now()
        host_id = str(uuid.uuid4())
        with self._lock:
            self._purge_locked()
            code = self._unique_code()
        room = {
            "id": str(uuid.uuid4()),
            "code": code,
            "name": self._room_name(str(payload.get("roomName", "")), display_name),
            "hostParticipantId": host_id,
            "settings": {
                "isPublic": payload["isPublic"],
                "requireApproval": payload["requireApproval"],
                "queueEditing": queue_editing,
                "maxParticipants": max_participants,
                "source": "youtube",
                "ttlMinutes": ttl,
            },
            "participants": [
                self._participant(host_id, session_id, display_name, "host", "active", created),
            ],
            "queue": [],
            "currentMediaId": None,
            "playback": self._idle_playback(),
            "createdAt": created.isoformat(),
            "lastActivityAt": created.isoformat(),
            "expiresAt": (created + timedelta(minutes=ttl)).isoformat(),
        }
        with self._lock:
            self.rooms[room["id"]] = room
            self.store.save_room(room)
            return copy.deepcopy(room), host_id

    def join(self, payload: dict) -> tuple[str, dict, str]:
        code = clean_text(str(payload.get("code", ""))).replace(" ", "").replace("-", "").upper()
        if not CODE_RE.fullmatch(code):
            raise RoomError(
                "INVALID_INPUT",
                "Enter a 6-character room code. Codes use letters and numbers without 0, 1, I, or O.",
            )
        display_name = self._name(payload.get("displayName", ""))
        session_id = self._session(payload.get("sessionId", ""))
        with self._lock:
            _expired_ids, expired_codes = self._purge_locked()
            if code in expired_codes:
                raise RoomError("ROOM_EXPIRED", "This room has expired.")
            room = next((item for item in self.rooms.values() if item["code"] == code), None)
            if room is None:
                raise RoomError("ROOM_NOT_FOUND", "No room uses that code.")
            existing = next((item for item in room["participants"] if item["sessionId"] == session_id), None)
            if existing is not None:
                existing["displayName"] = display_name
                existing["lastSeenAt"] = self.now().isoformat()
                if existing["membershipStatus"] == "active":
                    existing["connectionState"] = "connected"
                    existing["disconnectedAt"] = None
                self._touch(room)
                self.store.save_room(room)
                status = "pending" if existing["membershipStatus"] == "pending" else "joined"
                return status, copy.deepcopy(room), existing["id"]
            if len(room["participants"]) >= room["settings"]["maxParticipants"]:
                raise RoomError("ROOM_FULL", "This room is full.")
            membership = "pending" if room["settings"]["requireApproval"] else "active"
            participant_id = str(uuid.uuid4())
            room["participants"].append(
                self._participant(participant_id, session_id, display_name, "listener", membership, self.now())
            )
            self._touch(room)
            self.store.save_room(room)
            status = "pending" if membership == "pending" else "joined"
            return status, copy.deepcopy(room), participant_id

    def get(self, room_id: str, participant_id: str) -> dict:
        with self._lock:
            expired_ids, _expired_codes = self._purge_locked()
            if room_id in expired_ids:
                raise RoomError("ROOM_EXPIRED", "This room has expired.")
            room = self.rooms.get(room_id)
            if room is None:
                raise RoomError("ROOM_NOT_FOUND", "That room is not available.")
            if not any(item["id"] == participant_id for item in room["participants"]):
                raise RoomError("UNAUTHORIZED", "You don't have permission to do that.")
            return copy.deepcopy(room)

    def set_connection(self, room_id: str, participant_id: str, connected: bool) -> dict | None:
        with self._lock:
            room = self.rooms.get(room_id)
            if room is None:
                return None
            participant = next((item for item in room["participants"] if item["id"] == participant_id), None)
            if participant is None or participant["membershipStatus"] != "active":
                return None
            participant["lastSeenAt"] = self.now().isoformat()
            if connected:
                participant["connectionState"] = "connected"
                participant["disconnectedAt"] = None
            else:
                participant["connectionState"] = "disconnected"
                participant["disconnectedAt"] = self.now().isoformat()
            self._touch(room)
            self.store.save_room(room)
            return copy.deepcopy(room)

    def sweep_disconnects(self) -> list[dict]:
        changed: list[dict] = []
        with self._lock:
            self._purge_locked()
            deadline = self.now() - timedelta(seconds=self.grace_seconds)
            for room in list(self.rooms.values()):
                host = next((item for item in room["participants"] if item["id"] == room["hostParticipantId"]), None)
                if host is None or host["connectionState"] != "disconnected":
                    continue
                disconnected_at = _parse_time(host.get("disconnectedAt"))
                if disconnected_at is None or disconnected_at > deadline:
                    continue
                replacement = next(
                    (
                        item
                        for item in sorted(room["participants"], key=lambda person: person["joinedAt"])
                        if item["membershipStatus"] == "active"
                        and item["connectionState"] == "connected"
                        and item["id"] != host["id"]
                    ),
                    None,
                )
                if replacement is None:
                    continue
                host["role"] = "listener"
                replacement["role"] = "host"
                room["hostParticipantId"] = replacement["id"]
                self._touch(room)
                self.store.save_room(room)
                changed.append(copy.deepcopy(room))
        return changed

    def approve(self, room_id: str, host_id: str, target_id: str) -> dict:
        def mutate(room: dict) -> dict:
            self._require_host(room, host_id)
            target = next((item for item in room["participants"] if item["id"] == target_id), None)
            if target is None or target["membershipStatus"] != "pending":
                raise RoomError("INVALID_INPUT", "That person is not waiting for approval.")
            active = [item for item in room["participants"] if item["membershipStatus"] == "active"]
            if len(active) >= room["settings"]["maxParticipants"]:
                raise RoomError("ROOM_FULL", "This room is full.")
            target["membershipStatus"] = "active"
            target["role"] = "listener"
            target["connectionState"] = "connected"
            target["disconnectedAt"] = None
            return room

        return self._update(room_id, mutate)

    def deny(self, room_id: str, host_id: str, target_id: str) -> dict:
        def mutate(room: dict) -> dict:
            self._require_host(room, host_id)
            target = next((item for item in room["participants"] if item["id"] == target_id), None)
            if target is None or target["membershipStatus"] != "pending":
                raise RoomError("INVALID_INPUT", "That person is not waiting for approval.")
            room["participants"] = [item for item in room["participants"] if item["id"] != target_id]
            return room

        return self._update(room_id, mutate)

    def remove_participant(self, room_id: str, host_id: str, target_id: str) -> dict:
        def mutate(room: dict) -> dict:
            self._require_host(room, host_id)
            if target_id == host_id:
                raise RoomError("UNAUTHORIZED", "Leave the room or close it instead of removing yourself.")
            target = next(
                (
                    item
                    for item in room["participants"]
                    if item["id"] == target_id and item["membershipStatus"] == "active"
                ),
                None,
            )
            if target is None:
                raise RoomError("INVALID_INPUT", "That person is not in the room.")
            room["participants"] = [item for item in room["participants"] if item["id"] != target_id]
            return room

        return self._update(room_id, mutate)

    def leave(self, room_id: str, participant_id: str) -> tuple[bool, dict | None]:
        with self._lock:
            self._purge_locked()
            room = self.rooms.get(room_id)
            if room is None:
                raise RoomError("ROOM_NOT_FOUND", "That room is not available.")
            participant = next((item for item in room["participants"] if item["id"] == participant_id), None)
            if participant is None:
                raise RoomError("UNAUTHORIZED", "You don't have permission to do that.")
            was_host = room["hostParticipantId"] == participant_id
            room["participants"] = [item for item in room["participants"] if item["id"] != participant_id]
            remaining = sorted(
                [item for item in room["participants"] if item["membershipStatus"] == "active"],
                key=lambda item: item["joinedAt"],
            )
            if not remaining:
                self.rooms.pop(room_id, None)
                self.store.delete_room(room_id)
                return True, None
            if was_host:
                next_host = remaining[0]
                room["hostParticipantId"] = next_host["id"]
                for item in room["participants"]:
                    if item["id"] == next_host["id"]:
                        item["role"] = "host"
            self._touch(room)
            self.store.save_room(room)
            return False, copy.deepcopy(room)

    def close(self, room_id: str, participant_id: str) -> None:
        with self._lock:
            room = self._require_room(room_id)
            self._require_host(room, participant_id)
            self.rooms.pop(room_id, None)
            self.store.delete_room(room_id)

    def add_queue_item(self, room_id: str, participant_id: str, media_id: str, title: str) -> dict:
        def mutate(room: dict) -> dict:
            self._require_editor(room, participant_id)
            if not isinstance(media_id, str) or not VIDEO_ID.fullmatch(media_id):
                raise RoomError("INVALID_MEDIA", "Enter a YouTube video URL or an 11-character video ID.")
            if any(item["mediaId"] == media_id for item in room["queue"]):
                raise RoomError("DUPLICATE_MEDIA", "That video is already in the queue.")
            if len(room["queue"]) >= MAX_QUEUE:
                raise RoomError("INVALID_INPUT", f"The queue already has {MAX_QUEUE} videos.")
            cleaned = clean_text(title)
            if len(cleaned) > MAX_TITLE:
                raise RoomError("INVALID_INPUT", f"Title must be {MAX_TITLE} characters or fewer.")
            room["queue"].append(
                {
                    "id": str(uuid.uuid4()),
                    "provider": "youtube",
                    "mediaId": media_id,
                    "title": cleaned or "YouTube video",
                    "addedByParticipantId": participant_id,
                    "addedAt": self.now().isoformat(),
                    "position": len(room["queue"]),
                    "error": None,
                }
            )
            return room

        return self._update(room_id, mutate)

    def remove_queue_item(self, room_id: str, participant_id: str, item_id: str) -> dict:
        def mutate(room: dict) -> dict:
            self._require_editor(room, participant_id)
            item = next((entry for entry in room["queue"] if entry["id"] == item_id), None)
            if item is None:
                raise RoomError("INVALID_INPUT", "That queue item is no longer in the queue.")
            room["queue"] = [entry for entry in room["queue"] if entry["id"] != item_id]
            self._reindex(room)
            if room["currentMediaId"] == item["mediaId"]:
                room["currentMediaId"] = None
                room["playback"] = self._idle_playback(room["playback"]["revision"] + 1)
            return room

        return self._update(room_id, mutate)

    def move_queue_item(self, room_id: str, participant_id: str, item_id: str, direction: str) -> dict:
        def mutate(room: dict) -> dict:
            self._require_editor(room, participant_id)
            if direction not in ("up", "down"):
                raise RoomError("INVALID_INPUT", "Choose whether to move the video up or down.")
            index = next((position for position, entry in enumerate(room["queue"]) if entry["id"] == item_id), -1)
            if index < 0:
                raise RoomError("INVALID_INPUT", "That queue item is no longer in the queue.")
            target = index - 1 if direction == "up" else index + 1
            if target < 0 or target >= len(room["queue"]):
                return room
            entry = room["queue"].pop(index)
            room["queue"].insert(target, entry)
            self._reindex(room)
            return room

        return self._update(room_id, mutate)

    def select_track(self, room_id: str, participant_id: str, item_id: str) -> dict:
        def mutate(room: dict) -> dict:
            self._require_host(room, participant_id)
            item = next((entry for entry in room["queue"] if entry["id"] == item_id), None)
            if item is None:
                raise RoomError("INVALID_MEDIA", "That queue item is no longer available.")
            room["currentMediaId"] = item["mediaId"]
            room["playback"] = self._idle_playback(room["playback"]["revision"] + 1)
            return room

        return self._update(room_id, mutate)

    def play(self, room_id: str, participant_id: str, revision: int) -> dict:
        def mutate(room: dict) -> dict:
            self._require_host(room, participant_id)
            self._require_revision(room, revision)
            if not room["currentMediaId"]:
                raise RoomError("PLAYBACK_NOT_READY", "Choose a track before starting playback.")
            now_ms = self._now_ms()
            position = self._expected_position(room, now_ms) if room["playback"]["status"] == "playing" else room["playback"]["positionSeconds"]
            start_at = now_ms + 1200
            room["playback"] = {
                "status": "playing",
                "positionSeconds": position,
                "anchorServerMs": start_at,
                "revision": room["playback"]["revision"] + 1,
            }
            return room

        return self._update(room_id, mutate)

    def pause(self, room_id: str, participant_id: str, revision: int) -> dict:
        def mutate(room: dict) -> dict:
            self._require_host(room, participant_id)
            self._require_revision(room, revision)
            now_ms = self._now_ms()
            position = self._expected_position(room, now_ms)
            room["playback"] = {
                "status": "paused",
                "positionSeconds": position,
                "anchorServerMs": None,
                "revision": room["playback"]["revision"] + 1,
            }
            return room

        return self._update(room_id, mutate)

    def seek(self, room_id: str, participant_id: str, revision: int, position_seconds: float) -> dict:
        def mutate(room: dict) -> dict:
            self._require_host(room, participant_id)
            self._require_revision(room, revision)
            if not isinstance(position_seconds, (int, float)) or isinstance(position_seconds, bool):
                raise RoomError("INVALID_INPUT", "Choose a valid position in the track.")
            if position_seconds < 0 or position_seconds > 60 * 60 * 12:
                raise RoomError("INVALID_INPUT", "That position is outside the track.")
            status = room["playback"]["status"]
            now_ms = self._now_ms()
            room["playback"] = {
                "status": status if status == "playing" else "paused",
                "positionSeconds": float(position_seconds),
                "anchorServerMs": now_ms if status == "playing" else None,
                "revision": room["playback"]["revision"] + 1,
            }
            return room

        return self._update(room_id, mutate)

    def _update(self, room_id: str, mutate: Callable[[dict], dict]) -> dict:
        with self._lock:
            self._purge_locked()
            room = self._require_room(room_id)
            draft = copy.deepcopy(room)
            updated = mutate(draft)
            self._touch(updated)
            self.rooms[room_id] = updated
            self.store.save_room(updated)
            return copy.deepcopy(updated)

    def _purge_locked(self) -> tuple[set[str], set[str]]:
        now = self.now()
        expired = [room for room in self.rooms.values() if _parse_time(room["expiresAt"]) <= now]
        expired_ids = {room["id"] for room in expired}
        expired_codes = {room["code"] for room in expired}
        for room_id in expired_ids:
            self.rooms.pop(room_id, None)
            self.store.delete_room(room_id)
        return expired_ids, expired_codes

    def _require_room(self, room_id: str) -> dict:
        room = self.rooms.get(room_id)
        if room is None:
            raise RoomError("ROOM_NOT_FOUND", "That room is not available.")
        return room

    def _require_active(self, room: dict, participant_id: str) -> dict:
        participant = next((item for item in room["participants"] if item["id"] == participant_id), None)
        if participant is None or participant["membershipStatus"] != "active":
            raise RoomError("UNAUTHORIZED", "You don't have permission to do that.")
        return participant

    def _require_host(self, room: dict, participant_id: str) -> dict:
        participant = self._require_active(room, participant_id)
        if participant["role"] != "host" or room["hostParticipantId"] != participant_id:
            raise RoomError("UNAUTHORIZED", "Only the host can do that.")
        return participant

    def _require_editor(self, room: dict, participant_id: str) -> dict:
        participant = self._require_active(room, participant_id)
        if room["settings"]["queueEditing"] == "host" and participant["role"] != "host":
            raise RoomError("UNAUTHORIZED", "Only the host can edit the queue in this room.")
        return participant

    def _require_revision(self, room: dict, revision: int) -> None:
        if not isinstance(revision, int) or isinstance(revision, bool) or revision != room["playback"]["revision"]:
            raise RoomError("STALE_REVISION", "That playback command is out of date. Use the latest room state.")

    def _expected_position(self, room: dict, now_ms: int) -> float:
        playback = room["playback"]
        if playback["status"] != "playing" or playback["anchorServerMs"] is None:
            return float(playback["positionSeconds"])
        elapsed = max(0, (now_ms - playback["anchorServerMs"]) / 1000)
        return float(playback["positionSeconds"]) + elapsed

    def _now_ms(self) -> int:
        return int(self.now().timestamp() * 1000)

    def _touch(self, room: dict) -> None:
        room["lastActivityAt"] = self.now().isoformat()

    def _unique_code(self) -> str:
        for _ in range(8):
            code = "".join(secrets.choice(ALPHABET) for _ in range(6))
            if all(room["code"] != code for room in self.rooms.values()):
                return code
        raise RoomError("INVALID_INPUT", "Could not assign a room code. Try again.")

    def _name(self, value: object) -> str:
        if not isinstance(value, str):
            raise RoomError("INVALID_INPUT", f"Enter a display name up to {MAX_NAME} characters.")
        cleaned = clean_text(value)
        if not cleaned or len(cleaned) > MAX_NAME:
            raise RoomError("INVALID_INPUT", f"Enter a display name up to {MAX_NAME} characters.")
        return cleaned

    def _session(self, value: object) -> str:
        if not isinstance(value, str) or not UUID_RE.fullmatch(value):
            raise RoomError("INVALID_INPUT", "This browser session is invalid. Reload and try again.")
        return value

    def _room_name(self, value: str, display_name: str) -> str:
        cleaned = clean_text(value)
        if not cleaned:
            fallback = f"{display_name}'s room"
            return fallback[:MAX_ROOM_NAME]
        if len(cleaned) > MAX_ROOM_NAME:
            raise RoomError("INVALID_INPUT", f"Room name must be {MAX_ROOM_NAME} characters or fewer.")
        return cleaned

    def _participant(
        self,
        participant_id: str,
        session_id: str,
        display_name: str,
        role: str,
        membership: str,
        at: datetime,
    ) -> dict:
        return {
            "id": participant_id,
            "sessionId": session_id,
            "displayName": display_name,
            "role": role,
            "connectionState": "connected" if membership == "active" else "disconnected",
            "membershipStatus": membership,
            "joinedAt": at.isoformat(),
            "lastSeenAt": at.isoformat(),
            "disconnectedAt": None,
        }

    def _idle_playback(self, revision: int = 0) -> dict:
        return {
            "status": "idle",
            "positionSeconds": 0,
            "anchorServerMs": None,
            "revision": revision,
        }

    def _reindex(self, room: dict) -> None:
        for position, item in enumerate(room["queue"]):
            item["position"] = position


def _parse_time(value: object) -> datetime:
    if not isinstance(value, str):
        return datetime.min.replace(tzinfo=UTC)
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed
