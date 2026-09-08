from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.base import Base
from app.models.metric import InferenceMetric
from app.models.model import Model
from app.services.drift import compute_drift


def _make_session(tmp_path, name: str):
    engine = create_engine(f"sqlite:///{tmp_path / name}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _seed_model(db) -> int:
    model = Model(name="drift-test", task="test", description="")
    db.add(model)
    db.commit()
    db.refresh(model)
    return model.id


def _seed_inputs(db, model_id: int, version: str, inputs: list[object]) -> None:
    db.add_all(
        InferenceMetric(
            model_id=model_id,
            version=version,
            input_text=str(value),
            prediction="ok",
            latency_ms=5.0,
            success=True,
        )
        for value in inputs
    )
    db.commit()


def test_drift_reports_insufficient_data_before_thresholds_met(tmp_path) -> None:
    db = _make_session(tmp_path, "insufficient.db")
    try:
        model_id = _seed_model(db)
        _seed_inputs(db, model_id, "v1", [{"amount": i} for i in range(10)])

        report = compute_drift(db, model_id, "v1", reference_size=50, window_size=50)

        assert report["status"] == "insufficient_data"
        assert report["current_count"] == 10
        assert report["features"] == []
    finally:
        db.close()


def test_drift_detects_stable_distribution_as_stable(tmp_path) -> None:
    db = _make_session(tmp_path, "stable.db")
    try:
        model_id = _seed_model(db)
        values = [{"amount": (i % 10) + 1} for i in range(40)]
        _seed_inputs(db, model_id, "v1", values)

        report = compute_drift(db, model_id, "v1", reference_size=20, window_size=20)

        assert report["status"] == "stable"
        amount_feature = next(f for f in report["features"] if f["feature"] == "amount")
        assert amount_feature["status"] == "stable"
        assert amount_feature["psi"] < 0.1
    finally:
        db.close()


def test_drift_detects_significant_numeric_shift(tmp_path) -> None:
    db = _make_session(tmp_path, "numeric_shift.db")
    try:
        model_id = _seed_model(db)
        reference_values = [{"amount": (i % 10) + 1} for i in range(20)]
        shifted_values = [{"amount": (i % 10) + 500} for i in range(20)]
        _seed_inputs(db, model_id, "v1", reference_values + shifted_values)

        report = compute_drift(db, model_id, "v1", reference_size=20, window_size=20)

        assert report["status"] == "significant_drift"
        amount_feature = next(f for f in report["features"] if f["feature"] == "amount")
        assert amount_feature["status"] == "significant_drift"
        assert amount_feature["psi"] >= 0.2
    finally:
        db.close()


def test_drift_detects_categorical_shift(tmp_path) -> None:
    db = _make_session(tmp_path, "categorical_shift.db")
    try:
        model_id = _seed_model(db)
        reference_values = [{"region": "us"} for _ in range(20)]
        shifted_values = [{"region": "eu"} for _ in range(20)]
        _seed_inputs(db, model_id, "v1", reference_values + shifted_values)

        report = compute_drift(db, model_id, "v1", reference_size=20, window_size=20)

        assert report["status"] == "significant_drift"
        region_feature = next(f for f in report["features"] if f["feature"] == "region")
        assert region_feature["status"] == "significant_drift"
    finally:
        db.close()


def test_drift_handles_non_dict_scalar_inputs(tmp_path) -> None:
    db = _make_session(tmp_path, "scalar.db")
    try:
        model_id = _seed_model(db)
        reference_values = list(range(1, 21))
        shifted_values = list(range(1000, 1020))
        _seed_inputs(db, model_id, "v1", reference_values + shifted_values)

        report = compute_drift(db, model_id, "v1", reference_size=20, window_size=20)

        assert report["status"] == "significant_drift"
        value_feature = next(f for f in report["features"] if f["feature"] == "value")
        assert value_feature["status"] == "significant_drift"
    finally:
        db.close()


def test_drift_ignores_failed_inference_records(tmp_path) -> None:
    db = _make_session(tmp_path, "failed_records.db")
    try:
        model_id = _seed_model(db)
        db.add(
            InferenceMetric(
                model_id=model_id,
                version="v1",
                input_text=str({"amount": 1}),
                prediction=None,
                error="boom",
                latency_ms=5.0,
                success=False,
            )
        )
        db.commit()

        report = compute_drift(db, model_id, "v1", reference_size=5, window_size=5)

        assert report["status"] == "insufficient_data"
        assert report["current_count"] == 0
    finally:
        db.close()
