from dataclasses import dataclass
from threading import Lock
from time import perf_counter


@dataclass
class RuntimeMetrics:
    requests: int = 0
    successful: int = 0
    failed: int = 0
    total_latency_ms: float = 0.0

    @property
    def average_latency_ms(self) -> float:
        if self.requests == 0:
            return 0.0
        return self.total_latency_ms / self.requests


class MetricsCollector:
    """In-memory inference metrics collector for the local MVP."""

    def __init__(self) -> None:
        self._metrics: dict[str, RuntimeMetrics] = {}
        self._lock = Lock()

    def record(self, key: str, latency_ms: float, success: bool) -> None:
        with self._lock:
            metrics = self._metrics.setdefault(key, RuntimeMetrics())
            metrics.requests += 1
            metrics.total_latency_ms += latency_ms
            if success:
                metrics.successful += 1
            else:
                metrics.failed += 1

    def get(self, key: str) -> RuntimeMetrics:
        with self._lock:
            metrics = self._metrics.get(key, RuntimeMetrics())
            return RuntimeMetrics(
                requests=metrics.requests,
                successful=metrics.successful,
                failed=metrics.failed,
                total_latency_ms=metrics.total_latency_ms,
            )

    def clear(self) -> None:
        with self._lock:
            self._metrics.clear()


metrics_collector = MetricsCollector()


def timer() -> float:
    return perf_counter()
