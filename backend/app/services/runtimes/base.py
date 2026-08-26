from abc import ABC, abstractmethod
from threading import Lock
from typing import Any


class ModelRuntime(ABC):
    """Interface implemented by model execution runtimes."""

    def __init__(self) -> None:
        self._cache: dict[str, Any] = {}
        self._lock = Lock()

    def get_or_load(self, artifact_path: str) -> Any:
        with self._lock:
            cached = self._cache.get(artifact_path)
            if cached is not None:
                return cached

            model = self.load(artifact_path)
            self._cache[artifact_path] = model
            return model

    def clear_artifact(self, artifact_path: str) -> None:
        with self._lock:
            self._cache.pop(artifact_path, None)

    def clear_cache(self) -> None:
        with self._lock:
            self._cache.clear()

    @abstractmethod
    def load(self, artifact_path: str) -> Any:
        raise NotImplementedError

    @abstractmethod
    def predict(self, model: Any, value: Any) -> Any:
        raise NotImplementedError
