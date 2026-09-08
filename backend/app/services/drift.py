import ast
import math
from collections import Counter

from sqlalchemy.orm import Session

from app.models.metric import InferenceMetric

_EPSILON = 1e-4
_SIGNIFICANT_DRIFT_THRESHOLD = 0.2
_MODERATE_DRIFT_THRESHOLD = 0.1
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


def _population_stability_index(ref_counts: Counter, cur_counts: Counter, ref_total: int, cur_total: int) -> float:
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
    if psi >= _SIGNIFICANT_DRIFT_THRESHOLD:
        return "significant_drift"
    if psi >= _MODERATE_DRIFT_THRESHOLD:
        return "moderate_drift"
    return "stable"


def compute_drift(
    db: Session,
    model_id: int,
    version: str,
    reference_size: int = 50,
    window_size: int = 50,
) -> dict[str, object]:
    records = (
        db.query(InferenceMetric.input_text)
        .filter(
            InferenceMetric.model_id == model_id,
            InferenceMetric.version == version,
            InferenceMetric.success.is_(True),
        )
        .order_by(InferenceMetric.created_at.asc(), InferenceMetric.id.asc())
        .all()
    )
    input_texts = [row[0] for row in records]

    total_needed = reference_size + window_size
    if len(input_texts) < total_needed:
        return {
            "model_id": model_id,
            "version": version,
            "status": "insufficient_data",
            "reference_count": 0,
            "current_count": len(input_texts),
            "required_count": total_needed,
            "features": [],
        }

    reference_inputs = input_texts[-total_needed:-window_size]
    current_inputs = input_texts[-window_size:]

    reference_features: dict[str, list[object]] = {}
    current_features: dict[str, list[object]] = {}

    for raw in reference_inputs:
        for key, value in _extract_features(_parse_input(raw)).items():
            reference_features.setdefault(key, []).append(value)

    for raw in current_inputs:
        for key, value in _extract_features(_parse_input(raw)).items():
            current_features.setdefault(key, []).append(value)

    feature_reports = []
    for key in sorted(set(reference_features) & set(current_features)):
        ref_values = reference_features[key]
        cur_values = current_features[key]

        if _is_numeric(ref_values) and _is_numeric(cur_values):
            psi = _psi_numeric([float(v) for v in ref_values], [float(v) for v in cur_values])
        else:
            psi = _psi_categorical(ref_values, cur_values)

        feature_reports.append(
            {
                "feature": key,
                "psi": round(psi, 4),
                "status": _drift_status(psi),
            }
        )

    overall_status = "stable"
    if any(feature["status"] == "significant_drift" for feature in feature_reports):
        overall_status = "significant_drift"
    elif any(feature["status"] == "moderate_drift" for feature in feature_reports):
        overall_status = "moderate_drift"

    return {
        "model_id": model_id,
        "version": version,
        "status": overall_status,
        "reference_count": len(reference_inputs),
        "current_count": len(current_inputs),
        "required_count": total_needed,
        "features": feature_reports,
    }
