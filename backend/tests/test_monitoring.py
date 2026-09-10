from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.models.metric import InferenceMetric
from app.models.model import Model, ModelVersion
from app.services.drift import compute_drift
from app.services.metrics import compare_versions, get_monitoring_summary, get_prediction_distribution


def _db(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'monitoring.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    return Session(engine)


def _model(db: Session) -> tuple[int, str]:
    model = Model(name="monitoring-model", task="classification", description="monitoring test")
    db.add(model)
    db.flush()
    db.add_all([
        ModelVersion(model_id=model.id, version="v1", artifact_path="v1", framework="python"),
        ModelVersion(model_id=model.id, version="v2", artifact_path="v2", framework="python"),
    ])
    db.commit()
    return model.id, "v1"


def test_monitoring_summary_reports_percentiles_rates_and_alerts(tmp_path, monkeypatch) -> None:
    db = _db(tmp_path)
    try:
        model_id, version = _model(db)
        now = datetime.now(timezone.utc)
        latencies = [10.0, 20.0, 30.0, 40.0, 5000.0]
        for index, latency in enumerate(latencies):
            db.add(InferenceMetric(
                model_id=model_id,
                version=version,
                input_text=str({"value": index}),
                prediction="positive" if index < 4 else "negative",
                success=index < 4,
                latency_ms=latency,
                created_at=now - timedelta(minutes=5 * (len(latencies) - index)),
            ))
        db.commit()

        monkeypatch.setattr(settings, "monitoring_error_rate_threshold", 0.1)
        monkeypatch.setattr(settings, "monitoring_p95_latency_ms", 1000.0)
        report = get_monitoring_summary(db, model_id, version, hours=24)

        assert report["requests"] == 5
        assert report["successful"] == 4
        assert report["failed"] == 1
        assert report["success_rate"] == 0.8
        assert report["error_rate"] == 0.2
        assert report["p50_latency_ms"] == 30.0
        assert report["p95_latency_ms"] > 4000
        assert report["alerts"] == ["error_rate", "p95_latency"]
        assert report["healthy"] is False
    finally:
        db.close()


def test_prediction_distribution_is_ranked_and_normalized(tmp_path) -> None:
    db = _db(tmp_path)
    try:
        model_id, version = _model(db)
        for prediction in ["positive", "positive", "positive", "negative", "negative", "neutral"]:
            db.add(InferenceMetric(
                model_id=model_id,
                version=version,
                input_text="input",
                prediction=prediction,
                success=True,
                latency_ms=5,
            ))
        db.commit()

        report = get_prediction_distribution(db, model_id, version, hours=24)
        assert report["total_predictions"] == 6
        assert report["unique_predictions"] == 3
        assert report["distribution"][0] == {"prediction": "positive", "count": 3, "share": 0.5}
        assert sum(item["share"] for item in report["distribution"]) == 1.0
    finally:
        db.close()


def test_version_comparison_returns_metric_deltas(tmp_path) -> None:
    db = _db(tmp_path)
    try:
        model_id, _ = _model(db)
        for version, latencies in [("v1", [10.0, 20.0]), ("v2", [20.0, 40.0])]:
            for latency in latencies:
                db.add(InferenceMetric(
                    model_id=model_id,
                    version=version,
                    input_text="input",
                    prediction="positive",
                    success=True,
                    latency_ms=latency,
                ))
        db.commit()

        report = compare_versions(db, model_id, "v1", "v2", hours=24)
        assert report["baseline"]["average_latency_ms"] == 15.0
        assert report["candidate"]["average_latency_ms"] == 30.0
        assert report["delta"]["average_latency_ms"] == 15.0
        assert report["delta"]["success_rate"] == 0.0
    finally:
        db.close()


def test_drift_includes_prediction_distribution_and_configured_thresholds(tmp_path, monkeypatch) -> None:
    db = _db(tmp_path)
    try:
        model_id, version = _model(db)
        for index in range(10):
            db.add(InferenceMetric(
                model_id=model_id,
                version=version,
                input_text=str({"value": index}),
                prediction="positive",
                success=True,
                latency_ms=5,
            ))
        for index in range(10):
            db.add(InferenceMetric(
                model_id=model_id,
                version=version,
                input_text=str({"value": index + 100}),
                prediction="negative",
                success=True,
                latency_ms=5,
            ))
        db.commit()

        monkeypatch.setattr(settings, "monitoring_drift_moderate_threshold", 0.05)
        monkeypatch.setattr(settings, "monitoring_drift_significant_threshold", 0.1)
        report = compute_drift(db, model_id, version, reference_size=10, window_size=10)

        assert report["reference_count"] == 10
        assert report["current_count"] == 10
        assert report["prediction"]["feature"] == "prediction"
        assert report["prediction"]["psi"] > 0.1
        assert report["prediction"]["status"] == "significant_drift"
        assert report["thresholds"] == {"moderate": 0.05, "significant": 0.1}
        assert report["status"] == "significant_drift"
    finally:
        db.close()


def test_monitoring_api_exposes_summary_predictions_and_comparison(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "false")
    db = _db(tmp_path)
    model_id, _ = _model(db)
    for version, prediction in [("v1", "positive"), ("v2", "negative")]:
        db.add(InferenceMetric(
            model_id=model_id,
            version=version,
            input_text="input",
            prediction=prediction,
            success=True,
            latency_ms=12,
        ))
    db.commit()
    db.close()

    SessionTesting = sessionmaker(bind=create_engine(
        f"sqlite:///{tmp_path / 'monitoring.db'}",
        connect_args={"check_same_thread": False},
    ), autoflush=False, autocommit=False)

    def override_get_db():
        session = SessionTesting()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        client = TestClient(app)
        summary = client.get(f"/api/v1/metrics/{model_id}/v1/monitoring?hours=24")
        assert summary.status_code == 200
        assert summary.json()["requests"] == 1
        predictions = client.get(f"/api/v1/metrics/{model_id}/v1/predictions?hours=24")
        assert predictions.status_code == 200
        assert predictions.json()["total_predictions"] == 1
        comparison = client.get(f"/api/v1/metrics/{model_id}/compare?baseline=v1&candidate=v2&hours=24")
        assert comparison.status_code == 200
        assert comparison.json()["delta"]["success_rate"] == 0.0
    finally:
        app.dependency_overrides.clear()
