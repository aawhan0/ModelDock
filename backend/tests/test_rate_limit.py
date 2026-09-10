from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient
from redis.exceptions import RedisError

from app.core.rate_limit import RateLimiter
from app.main import create_app


class FakePipeline:
    def __init__(self, redis: "FakeRedis") -> None:
        self.redis = redis

    async def __aenter__(self) -> "FakePipeline":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    def incr(self, key: str) -> "FakePipeline":
        self.redis.pending_key = key
        return self

    def expire(self, key: str, seconds: int) -> "FakePipeline":
        return self

    async def execute(self) -> tuple[int, bool]:
        key = self.redis.pending_key
        self.redis.counts[key] = self.redis.counts.get(key, 0) + 1
        return self.redis.counts[key], True


class FakeRedis:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.pending_key = ""

    def pipeline(self, transaction: bool = True) -> FakePipeline:
        assert transaction is True
        return FakePipeline(self)

    async def aclose(self) -> None:
        return None


class FailingRedis(FakeRedis):
    def pipeline(self, transaction: bool = True) -> FakePipeline:
        raise RedisError("redis unavailable")


def test_rate_limiter_blocks_after_limit() -> None:
    limiter = RateLimiter(FakeRedis(), limit=2, window_seconds=60)

    first = asyncio.run(limiter.check("client"))
    second = __import__("asyncio").run(limiter.check("client"))
    third = __import__("asyncio").run(limiter.check("client"))

    assert first.allowed is True
    assert first.remaining == 1
    assert second.allowed is True
    assert second.remaining == 0
    assert third.allowed is False
    assert third.retry_after > 0


def test_rate_limiter_fails_open_when_redis_is_unavailable() -> None:
    limiter = RateLimiter(FailingRedis(), limit=2, window_seconds=60, fail_open=True)

    result = __import__("asyncio").run(limiter.check("client"))

    assert result.allowed is True
    assert result.remaining == 2


def test_rate_limiter_can_fail_closed_when_configured() -> None:
    limiter = RateLimiter(FailingRedis(), limit=2, window_seconds=60, fail_open=False)

    result = __import__("asyncio").run(limiter.check("client"))

    assert result.allowed is False
    assert result.remaining == 0


def test_api_rate_limit_and_security_headers(monkeypatch) -> None:
    monkeypatch.setattr("app.main.settings.rate_limit_enabled", True)

    fake_redis = FakeRedis()
    app = create_app(fake_redis)
    app.state.rate_limiter = RateLimiter(fake_redis, limit=1, window_seconds=60)

    with TestClient(app) as client:
        first = client.get("/api/v1/models")
        second = client.get("/api/v1/models")
        health = client.get("/health")

    assert first.status_code == 401
    assert second.status_code == 429
    assert second.headers["X-RateLimit-Limit"] == "1"
    assert second.headers["X-RateLimit-Remaining"] == "0"
    assert int(second.headers["Retry-After"]) > 0
    assert second.headers["X-Content-Type-Options"] == "nosniff"
    assert second.headers["X-Frame-Options"] == "DENY"
    assert second.headers["Referrer-Policy"] == "no-referrer"
    assert health.status_code == 200
