# SyncSound API

The server coordinates room state. It does not receive or send audio.

Base path for HTTP is `/api`. The browser opens `/ws/rooms/{roomId}?token=...`.

Create and join return `{ status, participantId, token, room }`. Later requests send `Authorization: Bearer <token>`. The token is an HMAC of `roomId.participantId`.

## HTTP

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/health` | Anyone. Returns `status`, `activeRooms`, `connectedParticipants`. |
| POST | `/api/rooms` | Anyone, rate limited. Creates a room. |
| POST | `/api/rooms/join` | Anyone, rate limited. Body `{ code, displayName, sessionId }`. |
| GET | `/api/rooms/{roomId}` | Member. |
| POST | `/api/rooms/{roomId}/approve` | Host. |
| POST | `/api/rooms/{roomId}/deny` | Host. |
| POST | `/api/rooms/{roomId}/participants/remove` | Host. |
| POST | `/api/rooms/{roomId}/leave` | Member. |
| POST | `/api/rooms/{roomId}/close` | Host. |
| POST | `/api/rooms/{roomId}/queue` | Member allowed to edit. Body `{ mediaId, title }`. |
| POST | `/api/rooms/{roomId}/queue/remove` | Same. Body `{ itemId }`. |
| POST | `/api/rooms/{roomId}/queue/move` | Same. Body `{ itemId, direction }` where direction is `up` or `down`. |
| POST | `/api/rooms/{roomId}/select` | Host. Body `{ itemId }`. |
| POST | `/api/rooms/{roomId}/playback` | Host. Body `{ action, revision, positionSeconds? }`. `action` is `play`, `pause`, or `seek`. A mismatched `revision` returns 409 `STALE_REVISION`. |

`play` schedules the start about 1.2 seconds ahead and stores `anchorServerMs`. `pause` freezes the expected position. Errors use `{ code, message }`.

## WebSocket

Connect to `/ws/rooms/{roomId}?token=...`. A bad token closes with code 1008.

The server sends `room.snapshot` with the room and `serverTimeMs`, and `room.closed` when the room ends. Clients may send `playback.play.request`, `playback.pause.request`, `playback.seek.request`, `participant.heartbeat`, `clock.sync.request`, and `room.snapshot.request`.

The host’s last socket starts a 30-second grace period. If they are still disconnected and another person is connected, that person becomes the host.
