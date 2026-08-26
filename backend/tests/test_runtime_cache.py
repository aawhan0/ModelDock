from app.services.metrics import MetricsCollector
from app.services.runtimes.base import ModelRuntime


class FakeRuntime(ModelRuntime):
    def __init__(self) -> None:
        super().__init__()
        self.load_count = 0

    def load(self, artifact_path: str) -> object:
        self.load_count += 1
        return {"artifact": artifact_path}

    def predict(self, model: object, value: object) -> object:
        return value


def test_runtime_loads_an_artifact_once() -> None:
    runtime = FakeRuntime()

    first = runtime.get_or_load("model.joblib")
    second = runtime.get_or_load("model.joblib")

    assert first is second
    assert runtime.load_count == 1


def test_runtime_cache_is_separate_per_artifact() -> None:
    runtime = FakeRuntime()

    runtime.get_or_load("model-a.joblib")
    runtime.get_or_load("model-b.joblib")

    assert runtime.load_count == 2


def test_runtime_cache_can_be_cleared() -> None:
    runtime = FakeRuntime()

    runtime.get_or_load("model.joblib")
    runtime.clear_cache()
    runtime.get_or_load("model.joblib")

    assert runtime.load_count == 2
