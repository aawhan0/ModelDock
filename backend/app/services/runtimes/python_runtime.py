from pathlib import Path
from typing import Any

from app.services.runtimes.base import ModelRuntime
from app.services.runtimes.python_runtime_policy import SAFE_BUILTINS, validate_source


class PythonRuntime(ModelRuntime):
    """Execute a restricted Python model artifact."""

    def load(self, artifact_path: str) -> Any:
        path = Path(artifact_path)
        if not path.is_file():
            raise FileNotFoundError(f"Model artifact not found: {artifact_path}")

        namespace: dict[str, Any] = {}
        source = path.read_text(encoding="utf-8")
        code = validate_source(source)

        globals_dict = {"__builtins__": dict(SAFE_BUILTINS)}
        try:
            exec(code, globals_dict, namespace)
        except Exception as exc:
            raise ValueError(f"Python model artifact execution failed: {exc}") from exc

        model = namespace.get("model")
        if model is None or not callable(model):
            raise ValueError("Python model artifact must define a callable named 'model'")
        return model

    def predict(self, model: Any, value: Any) -> Any:
        if not callable(model):
            raise ValueError("Python runtime model is not callable")
        try:
            return model(value)
        except Exception as exc:
            raise ValueError(f"Model prediction failed: {exc}") from exc
