from abc import ABC, abstractmethod
from typing import Any


class ModelRuntime(ABC):
    """Interface implemented by model execution runtimes."""

    def __init__(self) -> None:
        self._cache: dict[str, Any] = {}

    def get_or_load(self, artifact_path: str) -> Any:
        if artifact_path not in self._cache:
            self._cache[artifact_path] = self.load(artifact_path)
        return self._cache[artifact_path]

    def clear_cache(self) -> None:
        self._cache.clear()

    @abstractmethod
    def load(self, artifact_path: str) -> Any:
        raise NotImplementedError

    @abstractmethod
    def predict(self, model: Any, value: Any) -> Any:
        raise NotImplementedError
