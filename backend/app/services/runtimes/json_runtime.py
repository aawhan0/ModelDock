import json
from pathlib import Path
from typing import Any

from app.services.runtimes.base import ModelRuntime


class JSONRuntime(ModelRuntime):
    """Resolve simple JSON lookup models."""

    def load(self, artifact_path: str) -> Any:
        path = Path(artifact_path)
        if not path.is_file():
            raise FileNotFoundError(f"Model artifact not found: {artifact_path}")

        with path.open("r", encoding="utf-8") as file:
            data = json.load(file)

        if not isinstance(data, dict) or "predictions" not in data:
            raise ValueError("JSON model artifact must contain a 'predictions' object")
        if not isinstance(data["predictions"], dict):
            raise ValueError("JSON model 'predictions' must be an object")

        return data["predictions"]

    def predict(self, model: Any, value: Any) -> Any:
        key = str(value)
        if key not in model:
            raise ValueError(f"No prediction configured for input: {key}")
        return model[key]
