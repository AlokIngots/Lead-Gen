import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._events = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.time()
        q = self._events[key]
        while q and (now - q[0]) > self.window_seconds:
            q.popleft()
        if len(q) >= self.max_attempts:
            return False
        q.append(now)
        return True
