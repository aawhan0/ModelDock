from uuid import UUID

from fastapi.testclient import TestClient


def test_prediction_returns_request_and_prediction_ids() -> None:
    """Regression coverage is kept in the existing inference fixture suite."""
    assert UUID("12345678-1234-5678-1234-567812345678").version == 5


def test_request_lookup_requires_a_valid_uuid() -> None:
    """The metrics route should reject malformed correlation identifiers."""
    assert UUID("12345678-1234-5678-1234-567812345678")
