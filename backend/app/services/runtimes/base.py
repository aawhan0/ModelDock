from abc import ABC, abstractmethod
from threading import Condition
from typing import Any


class ModelRuntime(ABC):
    """Interface implemented by model execution runtimes."""

    def __init__(self) -> None:
        self._cache: dict[str, Any] = {}
        self._loading: set[str] = set()
        self._invalidated: set[str] = set()
        self._condition = Condition()

    def get_or_load(self, artifact_path: str) -> Any:
        with self._condition:
            while True:
                if artifact_path in self._cache:
                    return self._cache[artifact_path]
                if artifact_path not in self._loading:
                    self._loading.add(artifact_path)
                    break
                self._condition.wait()

        try:
            model = self.load(artifact_path)
        except Exception:
            with self._condition:
                self._loading.discard(artifact_path)
                self._condition.notify_all()
            raise

        with self._condition:
            self._loading.discard(artifact_path)
            if artifact_path in self._invalidated:
                self._invalidated.discard(artifact_path)
            else:
                self._cache[artifact_path] = model
            self._condition.notify_all()
            return model

    def clear_artifact(self, artifact_path: str) -> None:
        with self._condition:
            self._cache.pop(artifact_path, None)
            if artifact_path in self._loading:
                self._invalidated.add(artifact_path)

    def clear_cache(self) -> None:
        with self._condition:
            self._cache.clear()

    @abstractmethod
    def load(self, artifact_path: str) -> Any:
        raise NotImplementedError

    @abstractmethod
    def predict(self, model: Any, value: Any) -> Any:
        raise NotImplementedError
