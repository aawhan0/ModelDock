import ast
import math
from collections import Counter

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.metric import InferenceMetric

_EPSILON = 1e-4
_NUMERIC_BINS = 10


def _parse_input(raw: str) -> object:
    try:
        return ast.literal_eval(raw)
    except (ValueError, SyntaxError):
        return raw


def _extract_features(value: object) -> dict[str, object]:
    if isinstance(value, dict):
        return {str(key): item for key, item in value.items()}
    return {"value": value}


def _is_numeric(values: list[object]) -> bool:
    return bool(values) and all(
        isinstance(value, (int, float)) and not isinstance(value, bool) for value in values
    )


def _bucket_numeric(values: list[float], breakpoints: list[float]) -> Counter:
    counts: Counter = Counter()
    for value in values:
        bucket = len(breakpoints)
        for index, breakpoint in enumerate(breakpoints):
            if value <= breakpoint:
                bucket = index
                break
        counts[bucket] += 1
    return counts


def _population_stability_index(
    ref_counts: Counter,
    cur_counts: Counter,
    ref_total: int,
    cur_total: int,
) -> float:
    psi = 0.0
    for bucket in set(ref_counts) | set(cur_counts):
        ref_pct = max(ref_counts.get(bucket, 0) / ref_total, _EPSILON)
        cur_pct = max(cur_counts.get(bucket, 0) / cur_total, _EPSILON)
        psi += (cur_pct - ref_pct) * math.log(cur_pct / ref_pct)
    return psi


def _psi_numeric(reference: list[float], current: list[float]) -> float:
    distinct = sorted(set(reference))
    bin_count = min(_NUMERIC_BINS, len(distinct)) or 1
    breakpoints = sorted(
        {distinct[int(i * (len(distinct) - 1) / bin_count)] for i in range(1, bin_count)}
    )

    ref_counts = _bucket_numeric(reference, breakpoints)
    cur_counts = _bucket_numeric(current, breakpoints)
    return _population_stability_index(ref_counts, cur_counts, len(reference), len(current))


def _psi_categorical(reference: list[object], current: list[object]) -> float:
    ref_counts = Counter(str(value) for value in reference)
    cur_counts = Counter(str(value) for value in current)
    return _population_stability_index(ref_counts, cur_counts, len(reference), len(current))


def _drift_status(psi: float) -> str:
    if psi >= settings.monitoring_drift_significant_threshold:
        return "significant_drift"
    if psi >= settings.monitoring_drift_moderate_threshold:
        return "moderate_drift"
    return "stable"


def _feature_report(
    feature: str,
    reference: list[object],
    current: list[object],
) -> dict[str, object]:
    if _is_numeric(reference) and _is_numeric(current):
        psi = _psi_numeric([float(v) for v in reference], [float(v) for v in current])
    else:
        psi = _psi_categorical(reference, current)
    return {"feature": feature, "psi": round(psi, 4), "status": _drift_status(psi)}


def compute_drift(
    db: Session,
    model_id: int,
    version: str,
    reference_size: int = 50,
    window_size: int = 50,
) -> dict[str, object]:
    records = (
        db.query(InferenceMetric.input_text, InferenceMetric.prediction)
        .filter(
            InferenceMetric.model_id == model_id,
            InferenceMetric.version == version,
            InferenceMetric.success.is_(True),
        )
        .order_by(InferenceMetric.created_at.asc(), InferenceMetric.id.asc())
        .all()
    )

    total_needed = reference_size + window_size
    if len(records) < total_needed:
        return {
            "model_id": model_id,
            "version": version,
            "status": "insufficient_data",
            "reference_count": 0,
            "current_count": len(records),
            "required_count": total_needed,
            "features": [],
            "prediction": None,
        }

    reference_records = records[-total_needed:-window_size]
    current_records = records[-window_size:]
    reference_features: dict[str, list[object]] = {}
    current_features: dict[str, list[object]] = {}

    for raw in [record[0] for record in reference_records]:
        for key, value in _extract_features(_parse_input(raw)).items():
            reference_features.setdefault(key, []).append(value)
    for raw in [record[0] for record in current_records]:
        for key, value in _extract_features(_parse_input(raw)).items():
            current_features.setdefault(key, []).append(value)

    feature_reports = [
        _feature_report(key, reference_features[key], current_features[key])
        for key in sorted(set(reference_features) & set(current_features))
    ]

    reference_predictions = [record[1] for record in reference_records if record[1] is not None]
    current_predictions = [record[1] for record in current_records if record[1] is not None]
    prediction_report = None
    if reference_predictions and current_predictions:
        prediction_report = _feature_report("prediction", reference_predictions, current_predictions)

    statuses = [feature["status"] for feature in feature_reports]
    if prediction_report is not None:
        statuses.append(prediction_report["status"])
    if "significant_drift" in statuses:
        overall_status = "significant_drift"
    elif "moderate_drift" in statuses:
        overall_status = "moderate_drift"
    else:
        overall_status = "stable"

    return {
        "model_id": model_id,
        "version": version,
        "status": overall_status,
        "reference_count": len(reference_records),
        "current_count": len(current_records),
        "required_count": total_needed,
        "features": feature_reports,
        "prediction": prediction_report,
        "thresholds": {
            "moderate": settings.monitoring_drift_moderate_threshold,
            "significant": settings.monitoring_drift_significant_threshold,
        },
    }
