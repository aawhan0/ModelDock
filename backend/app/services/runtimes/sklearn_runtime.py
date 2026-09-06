from typing import Any

import joblib

from app.services.runtimes.base import ModelRuntime


class SklearnRuntime(ModelRuntime):
    """Load and serve scikit-learn models serialized with joblib."""

    def load(self, artifact_path: str) -> Any:
        try:
            return joblib.load(artifact_path)
        except FileNotFoundError:
            raise
        except Exception as exc:
            raise ValueError(f"Unable to load scikit-learn model: {exc}") from exc

    def predict(self, model: Any, value: Any) -> Any:
        if not hasattr(model, "predict"):
            raise ValueError("scikit-learn artifact must expose a predict method")

        try:
            predictions = model.predict([value])
        except Exception as exc:
            raise ValueError(f"Model prediction failed: {exc}") from exc
        if hasattr(predictions, "tolist"):
            predictions = predictions.tolist()
        if not predictions:
            raise ValueError("Model returned no predictions")
        return predictions[0]
