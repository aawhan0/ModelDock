from concurrent.futures import ThreadPoolExecutor

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


def test_runtime_framework_lookup_is_case_insensitive() -> None:
    from app.services.runtime_registry import RuntimeRegistry

    registry = RuntimeRegistry()

    assert registry.get("PYTHON").__class__.__name__ == "PythonRuntime"
    assert registry.get("SkLeArN").__class__.__name__ == "SklearnRuntime"


def test_runtime_framework_lookup_rejects_unknown_runtime() -> None:
    from app.services.runtime_registry import RuntimeRegistry

    try:
        RuntimeRegistry().get("unknown")
    except ValueError as error:
        assert str(error) == "Unsupported model framework: unknown"
    else:
        raise AssertionError("Expected unknown runtime to be rejected")


def test_runtime_caches_none_values() -> None:
    class NoneRuntime(FakeRuntime):
        def load(self, artifact_path: str) -> object:
            self.load_count += 1
            return None

    runtime = NoneRuntime()
    runtime.get_or_load("none.model")
    runtime.get_or_load("none.model")
    assert runtime.load_count == 1


def test_runtime_concurrent_loads_share_cached_result() -> None:
    runtime = FakeRuntime()

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(lambda _: runtime.get_or_load("shared.model"), range(8)))

    assert all(result is results[0] for result in results)
    assert runtime.load_count == 1
