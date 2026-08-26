from app.services.metrics import MetricsCollector


def test_metrics_record_success_and_failure() -> None:
    collector = MetricsCollector()

    collector.record("1:v1", 10.0, True)
    collector.record("1:v1", 30.0, False)

    metrics = collector.get("1:v1")

    assert metrics.requests == 2
    assert metrics.successful == 1
    assert metrics.failed == 1
    assert metrics.average_latency_ms == 20.0


def test_metrics_are_isolated_by_model_version() -> None:
    collector = MetricsCollector()

    collector.record("1:v1", 10.0, True)
    collector.record("1:v2", 20.0, True)

    assert collector.get("1:v1").requests == 1
    assert collector.get("1:v2").requests == 1


def test_unknown_metrics_start_empty() -> None:
    metrics = MetricsCollector().get("missing")

    assert metrics.requests == 0
    assert metrics.successful == 0
    assert metrics.failed == 0
    assert metrics.average_latency_ms == 0.0
