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


def test_runtime_cache_can_clear_one_artifact() -> None:
    runtime = FakeRuntime()

    first = runtime.get_or_load("model-a.joblib")
    runtime.get_or_load("model-b.joblib")

    runtime.clear_artifact("model-a.joblib")

    second = runtime.get_or_load("model-a.joblib")
    cached_b = runtime.get_or_load("model-b.joblib")

    assert first is not second
    assert cached_b["artifact"] == "model-b.joblib"
    assert runtime.load_count == 3


def test_runtime_does_not_reload_cached_artifact_after_clear_of_another() -> None:
    runtime = FakeRuntime()

    runtime.get_or_load("model-a.joblib")
    model_b = runtime.get_or_load("model-b.joblib")

    runtime.clear_artifact("model-a.joblib")

    cached_b = runtime.get_or_load("model-b.joblib")

    assert cached_b is model_b
    assert runtime.load_count == 2
