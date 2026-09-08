from __future__ import annotations

from dataclasses import dataclass
import logging
import time

from redis.asyncio import Redis
from redis.exceptions import RedisError

logger = logging.getLogger("modeldock.rate_limit")


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int


class RateLimiter:
    def __init__(
        self,
        redis: Redis,
        *,
        limit: int,
        window_seconds: int,
        fail_open: bool = True,
    ) -> None:
        self.redis = redis
        self.limit = limit
        self.window_seconds = window_seconds
        self.fail_open = fail_open

    async def check(self, client_key: str) -> RateLimitResult:
        bucket = int(time.time() // self.window_seconds)
        redis_key = f"modeldock:rate-limit:{bucket}:{client_key}"

        try:
            async with self.redis.pipeline(transaction=True) as pipe:
                pipe.incr(redis_key)
                pipe.expire(redis_key, self.window_seconds)
                count, _ = await pipe.execute()

            count = int(count)
            remaining = max(self.limit - count, 0)
            retry_after = self.window_seconds - (int(time.time()) % self.window_seconds)
            return RateLimitResult(
                allowed=count <= self.limit,
                limit=self.limit,
                remaining=remaining,
                retry_after=max(retry_after, 1),
            )
        except RedisError:
            logger.exception("rate limiter backend unavailable")
            if not self.fail_open:
                return RateLimitResult(
                    allowed=False,
                    limit=self.limit,
                    remaining=0,
                    retry_after=self.window_seconds,
                )
            return RateLimitResult(
                allowed=True,
                limit=self.limit,
                remaining=self.limit,
                retry_after=self.window_seconds,
            )
