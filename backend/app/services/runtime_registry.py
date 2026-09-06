from app.services.runtimes.base import ModelRuntime
from app.services.runtimes.json_runtime import JSONRuntime
from app.services.runtimes.python_runtime import PythonRuntime
from app.services.runtimes.sklearn_runtime import SklearnRuntime


class RuntimeRegistry:
    """Resolve a runtime implementation by framework name."""

    def __init__(self) -> None:
        self._runtimes: dict[str, ModelRuntime] = {
            "python": PythonRuntime(),
            "json": JSONRuntime(),
            "sklearn": SklearnRuntime(),
        }

    def get(self, framework: str) -> ModelRuntime:
        if not isinstance(framework, str) or not framework.strip():
            raise ValueError("Unsupported model framework: empty")

        normalized = framework.strip().lower()
        runtime = self._runtimes.get(normalized)
        if runtime is None:
            raise ValueError(f"Unsupported model framework: {framework}")
        return runtime


runtime_registry = RuntimeRegistry()
