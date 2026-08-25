from abc import ABC, abstractmethod
from typing import Any


class ModelRuntime(ABC):
    """Interface implemented by model execution runtimes."""

    @abstractmethod
    def load(self, artifact_path: str) -> Any:
        raise NotImplementedError

    @abstractmethod
    def predict(self, model: Any, value: Any) -> Any:
        raise NotImplementedError
