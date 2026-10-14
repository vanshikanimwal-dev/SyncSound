from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.services.room_hub import MemoryStore, RoomHub


def settings() -> Settings:
    return Settings(
        app_env="development",
        session_secret="test-secret",
        database_url="sqlite://",
        cors_origins=["http://localhost:5173"],
        room_max_participants=20,
        room_ttl_minutes=240,
        create_limit=5,
        join_limit=20,
        disconnect_grace_seconds=30,
    )


def client() -> TestClient:
    return TestClient(create_app(MemoryStore(), settings()))


def create_payload(**overrides):
    body = {
        "displayName": "Ava",
        "roomName": "Listening",
        "source": "youtube",
        "isPublic": True,
        "requireApproval": False,
        "queueEditing": "everyone",
        "maxParticipants": 4,
        "ttlMinutes": 240,
        "sessionId": "11111111-1111-4111-8111-111111111111",
    }
    body.update(overrides)
    return body


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_health_hides_secrets():
    response = client().get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "secret" not in response.text


def test_create_join_limit_and_unknown_code():
    api = client()
    created = api.post("/api/rooms", json=create_payload())
    assert created.status_code == 201
    body = created.json()
    assert len(body["room"]["code"]) == 6
    assert body["room"]["participants"][0]["role"] == "host"

    missing = api.post(
        "/api/rooms/join",
        json={"code": "ABC234", "displayName": "Bea", "sessionId": "22222222-2222-4222-8222-222222222222"},
    )
    assert missing.status_code == 404
    assert missing.json()["code"] == "ROOM_NOT_FOUND"

    invalid = api.post("/api/rooms", json=create_payload(displayName="  "))
    assert invalid.status_code == 400


def test_room_full_and_unauthorized_playback():
    api = client()
    created = api.post("/api/rooms", json=create_payload(maxParticipants=2)).json()
    room_id = created["room"]["id"]
    first = api.post(
        "/api/rooms/join",
        json={"code": created["room"]["code"], "displayName": "Bea", "sessionId": "22222222-2222-4222-8222-222222222222"},
    )
    assert first.status_code == 200
    third = api.post(
        "/api/rooms/join",
        json={"code": created["room"]["code"], "displayName": "Cam", "sessionId": "33333333-3333-4333-8333-333333333333"},
    )
    assert third.status_code == 409
    assert third.json()["code"] == "ROOM_FULL"

    play = api.post(
        f"/api/rooms/{room_id}/playback",
        headers=auth(first.json()["token"]),
        json={"action": "play", "revision": 0},
    )
    assert play.status_code == 403
    assert play.json()["code"] == "UNAUTHORIZED"


def test_queue_order_invalid_media_and_stale_revision():
    api = client()
    created = api.post("/api/rooms", json=create_payload()).json()
    room_id = created["room"]["id"]
    headers = auth(created["token"])
    bad = api.post(f"/api/rooms/{room_id}/queue", headers=headers, json={"mediaId": "nope", "title": "Bad"})
    assert bad.status_code == 400
    assert bad.json()["code"] == "INVALID_MEDIA"

    first = api.post(f"/api/rooms/{room_id}/queue", headers=headers, json={"mediaId": "aaaaaaaaaaa", "title": "A"}).json()
    second = api.post(f"/api/rooms/{room_id}/queue", headers=headers, json={"mediaId": "bbbbbbbbbbb", "title": "B"}).json()
    third = api.post(f"/api/rooms/{room_id}/queue", headers=headers, json={"mediaId": "ccccccccccc", "title": "C"}).json()
    assert [item["title"] for item in third["queue"]] == ["A", "B", "C"]
    duplicate = api.post(f"/api/rooms/{room_id}/queue", headers=headers, json={"mediaId": "aaaaaaaaaaa", "title": "Again"})
    assert duplicate.json()["code"] == "DUPLICATE_MEDIA"

    moved = api.post(
        f"/api/rooms/{room_id}/queue/move",
        headers=headers,
        json={"itemId": third["queue"][2]["id"], "direction": "up"},
    ).json()
    assert [item["title"] for item in moved["queue"]] == ["A", "C", "B"]
    selected = api.post(
        f"/api/rooms/{room_id}/select",
        headers=headers,
        json={"itemId": second["queue"][1]["id"]},
    ).json()
    assert selected["currentMediaId"] == "bbbbbbbbbbb"
    stale = api.post(
        f"/api/rooms/{room_id}/playback",
        headers=headers,
        json={"action": "play", "revision": 0},
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "STALE_REVISION"
    started = api.post(
        f"/api/rooms/{room_id}/playback",
        headers=headers,
        json={"action": "play", "revision": selected["playback"]["revision"]},
    )
    assert started.status_code == 200
    assert started.json()["playback"]["status"] == "playing"
    assert first["queue"][0]["addedByParticipantId"] == created["participantId"]


def test_host_leave_transfers_and_empty_room_closes():
    api = client()
    created = api.post("/api/rooms", json=create_payload()).json()
    room_id = created["room"]["id"]
    joined = api.post(
        "/api/rooms/join",
        json={"code": created["room"]["code"], "displayName": "Bea", "sessionId": "22222222-2222-4222-8222-222222222222"},
    ).json()
    left = api.post(f"/api/rooms/{room_id}/leave", headers=auth(created["token"]))
    assert left.status_code == 200
    assert left.json()["room"]["hostParticipantId"] == joined["participantId"]
    closed = api.post(f"/api/rooms/{room_id}/leave", headers=auth(joined["token"]))
    assert closed.json()["closed"] is True
    missing = api.get(f"/api/rooms/{room_id}", headers=auth(joined["token"]))
    assert missing.status_code == 404


def test_expired_room_is_removed():
    clock = {"now": datetime(2026, 10, 13, 12, 0, tzinfo=UTC)}
    hub = RoomHub(MemoryStore(), now=lambda: clock["now"])
    app = create_app(MemoryStore(), settings())
    app.state.hub = hub
    api = TestClient(app)
    created = api.post("/api/rooms", json=create_payload(ttlMinutes=60))
    assert created.status_code == 201
    room_id = created.json()["room"]["id"]
    clock["now"] = clock["now"] + timedelta(hours=2)
    expired = api.get(f"/api/rooms/{room_id}", headers=auth(created.json()["token"]))
    assert expired.status_code == 410
    assert expired.json()["code"] == "ROOM_EXPIRED"


def test_host_disconnect_grace_transfers_host():
    clock = {"now": datetime(2026, 10, 13, 12, 0, tzinfo=UTC)}
    hub = RoomHub(MemoryStore(), now=lambda: clock["now"], grace_seconds=30)
    created, host_id = hub.create(create_payload())
    _status, room, listener_id = hub.join(
        {"code": created["code"], "displayName": "Bea", "sessionId": "22222222-2222-4222-8222-222222222222"}
    )
    hub.set_connection(room["id"], listener_id, True)
    hub.set_connection(room["id"], host_id, False)
    assert hub.sweep_disconnects() == []
    clock["now"] = clock["now"] + timedelta(seconds=31)
    changed = hub.sweep_disconnects()
    assert changed[0]["hostParticipantId"] == listener_id


def test_rate_limit_blocks_mass_room_creation():
    api = client()
    statuses = [api.post("/api/rooms", json=create_payload(displayName=f"Person{index}", sessionId=f"11111111-1111-4111-8111-11111111111{index}")).status_code for index in range(6)]
    assert statuses[-1] == 429


def test_four_clients_receive_the_same_playback_command():
    from contextlib import ExitStack

    api = client()
    created = api.post("/api/rooms", json=create_payload()).json()
    room_id = created["room"]["id"]
    code = created["room"]["code"]
    members = [created]
    for index, name in enumerate(("Bea", "Cam", "Dee"), start=2):
        joined = api.post(
            "/api/rooms/join",
            json={
                "code": code,
                "displayName": name,
                "sessionId": f"22222222-2222-4222-8222-22222222222{index}",
            },
        )
        assert joined.status_code == 200
        members.append(joined.json())
    assert len(members) == 4

    queued = api.post(
        f"/api/rooms/{room_id}/queue",
        headers=auth(created["token"]),
        json={"mediaId": "dQw4w9WgXcQ", "title": "Shared"},
    ).json()
    selected = api.post(
        f"/api/rooms/{room_id}/select",
        headers=auth(created["token"]),
        json={"itemId": queued["queue"][0]["id"]},
    ).json()

    with ExitStack() as stack:
        sockets = [
            stack.enter_context(api.websocket_connect(f"/ws/rooms/{room_id}?token={member['token']}"))
            for member in members
        ]
        for socket in sockets:
            snapshot = _until(socket, lambda message: len(message["room"]["participants"]) == 4)
            assert snapshot["type"] == "room.snapshot"
        started = api.post(
            f"/api/rooms/{room_id}/playback",
            headers=auth(created["token"]),
            json={"action": "play", "revision": selected["playback"]["revision"]},
        )
        assert started.status_code == 200
        revisions = set()
        for socket in sockets:
            message = _until(socket, lambda item: item["room"]["playback"]["status"] == "playing")
            assert message["room"]["currentMediaId"] == "dQw4w9WgXcQ"
            revisions.add(message["room"]["playback"]["revision"])
        assert len(revisions) == 1


def _until(socket, predicate, limit: int = 8):
    last = None
    for _ in range(limit):
        last = socket.receive_json()
        if predicate(last):
            return last
    raise AssertionError(last)


def test_invalid_socket_message_does_not_crash():
    api = client()
    created = api.post("/api/rooms", json=create_payload()).json()
    with api.websocket_connect(f"/ws/rooms/{created['room']['id']}?token={created['token']}") as socket:
        socket.receive_json()
        socket.send_json({"type": "not.a.command"})
        error = socket.receive_json()
        assert error["code"] == "INVALID_INPUT"
        health = api.get("/api/health")
        assert health.status_code == 200
