from __future__ import annotations

import base64
import hashlib
import hmac


def issue_token(secret: str, room_id: str, participant_id: str) -> str:
    payload = f"{room_id}.{participant_id}".encode()
    signature = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return f"{encoded}.{signature}"


def read_token(secret: str, token: str) -> tuple[str, str] | None:
    try:
        encoded, signature = token.split(".", 1)
        padding = "=" * (-len(encoded) % 4)
        payload = base64.urlsafe_b64decode(encoded + padding)
        expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            return None
        room_id, participant_id = payload.decode().split(".", 1)
        if not room_id or not participant_id:
            return None
        return room_id, participant_id
    except (ValueError, UnicodeError):
        return None
