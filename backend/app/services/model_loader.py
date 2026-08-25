from pathlib import Path
from threading import Lock
from typing import Any


class ModelLoader:
    """Load and cache simple Python model artifacts in memory."""

    def __init__(self) -> None:
        self._cache: dict[str, Any] = {}
        self._lock = Lock()

    def load(self, artifact_path: str) -> Any:
        path = Path(artifact_path)
        if not path.is_file():
            raise FileNotFoundError(f"Model artifact not found: {artifact_path}")

        cache_key = str(path.resolve())
        with self._lock:
            if cache_key in self._cache:
                return self._cache[cache_key]

            # Model artifacts are Python source files for the initial MVP.
            namespace: dict[str, Any] = {}
            exec(path.read_text(encoding="utf-8"), {"__builtins__": __builtins__}, namespace)
            model = namespace.get("model")
            if model is None or not callable(model):
                raise ValueError("Model artifact must define a callable named 'model'")

            self._cache[cache_key] = model
            return model

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
