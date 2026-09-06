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


def test_metrics_timeseries_includes_current_hour(tmp_path) -> None:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.models.base import Base
    from app.models.model import Model
    from app.services.metrics import get_metrics_timeseries

    engine = create_engine(f"sqlite:///{tmp_path / 'metrics.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    with Session() as db:
        model = Model(name="timeseries-test", task="test")
        db.add(model)
        db.commit()
        db.refresh(model)

        points = get_metrics_timeseries(db, model.id, "v1", hours=2)

    assert len(points) >= 2
    assert points[-1]["timestamp"] is not None



def test_metrics_average_latency_is_zero_without_requests() -> None:
    collector = MetricsCollector()

    assert collector.get("missing").average_latency_ms == 0.0


def test_metrics_clear_removes_all_runtime_data() -> None:
    collector = MetricsCollector()
    collector.record("1:v1", 10.0, True)

    collector.clear()

    assert collector.get("1:v1").requests == 0



def test_metrics_are_isolated_by_model_and_version(tmp_path) -> None:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.models.base import Base
    from app.models.model import Model
    from app.models.metric import InferenceMetric
    from app.services.metrics import get_persistent_metrics

    engine = create_engine(f"sqlite:///{tmp_path / 'isolation.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        a = Model(name="a", task="test", description="")
        b = Model(name="b", task="test", description="")
        db.add_all([a, b]); db.commit()
        db.add_all([
            InferenceMetric(model_id=a.id, version="v1", input_text="", prediction="1", latency_ms=10, success=True),
            InferenceMetric(model_id=a.id, version="v2", input_text="", prediction="2", latency_ms=20, success=True),
            InferenceMetric(model_id=b.id, version="v1", input_text="", prediction="3", latency_ms=30, success=True),
        ]); db.commit()
        m = get_persistent_metrics(db, a.id, "v1")
        assert m.requests == 1
        assert m.average_latency_ms == 10
    finally:
        db.close()
