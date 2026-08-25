from pathlib import Path
from typing import Any

from app.services.runtimes.base import ModelRuntime


class PythonRuntime(ModelRuntime):
    """Execute the initial Python model artifact format."""

    def load(self, artifact_path: str) -> Any:
        path = Path(artifact_path)
        if not path.is_file():
            raise FileNotFoundError(f"Model artifact not found: {artifact_path}")

        namespace: dict[str, Any] = {}
        exec(path.read_text(encoding="utf-8"), {"__builtins__": __builtins__}, namespace)
        model = namespace.get("model")
        if model is None or not callable(model):
            raise ValueError("Python model artifact must define a callable named 'model'")
        return model

    def predict(self, model: Any, value: Any) -> Any:
        return model(value)
