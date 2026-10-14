from __future__ import annotations

import time
from collections import defaultdict


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], list[float]] = defaultdict(list)

    def allow(self, bucket: str, key: str, limit: int, window_seconds: float = 60) -> bool:
        now = time.monotonic()
        stamp = (bucket, key)
        recent = [hit for hit in self._hits[stamp] if now - hit < window_seconds]
        if len(recent) >= limit:
            self._hits[stamp] = recent
            return False
        recent.append(now)
        self._hits[stamp] = recent
        return True
