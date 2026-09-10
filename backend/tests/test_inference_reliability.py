import asyncio
import time

import pytest

from app.api.inference import _run_prediction
from app.core.config import settings


class SlowRuntime:
    def predict(self, model, value):
        time.sleep(0.05)
        return value


@pytest.mark.parametrize("timeout", [0.001, 0.01])
def test_prediction_timeout_is_bounded(monkeypatch, timeout: float) -> None:
    monkeypatch.setattr(settings, "inference_timeout_seconds", timeout)

    with pytest.raises(asyncio.TimeoutError):
        asyncio.run(_run_prediction(SlowRuntime(), object(), "value"))
