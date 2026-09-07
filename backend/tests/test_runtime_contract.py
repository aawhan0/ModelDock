import json
from pathlib import Path

import joblib
import pytest

from app.services.runtimes.json_runtime import JSONRuntime
from app.services.runtimes.python_runtime import PythonRuntime
from app.services.runtimes.sklearn_runtime import SklearnRuntime


class EmptyPredictionModel:
    def predict(self, values):
        return []


@pytest.mark.parametrize("runtime_cls", [JSONRuntime, PythonRuntime, SklearnRuntime])
def test_runtime_missing_artifact_is_consistent(runtime_cls, tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="Model artifact not found"):
        runtime_cls().load(str(tmp_path / "missing.model"))


def test_json_runtime_rejects_malformed_artifact(tmp_path: Path) -> None:
    artifact = tmp_path / "model.json"
    artifact.write_text('{"wrong": {}}', encoding="utf-8")
    with pytest.raises(ValueError, match="predictions"):
        JSONRuntime().load(str(artifact))


def test_json_runtime_predicts_and_rejects_unknown_input(tmp_path: Path) -> None:
    artifact = tmp_path / "model.json"
    artifact.write_text(json.dumps({"predictions": {"hello": "positive"}}), encoding="utf-8")
    runtime = JSONRuntime()
    model = runtime.get_or_load(str(artifact))
    assert runtime.predict(model, "hello") == "positive"
    with pytest.raises(ValueError, match="No prediction configured"):
        runtime.predict(model, "unknown")


def test_python_runtime_rejects_missing_model_callable(tmp_path: Path) -> None:
    artifact = tmp_path / "model.py"
    artifact.write_text("value = 1\n", encoding="utf-8")
    with pytest.raises(ValueError, match="callable named 'model'"):
        PythonRuntime().load(str(artifact))


def test_python_runtime_wraps_prediction_failure(tmp_path: Path) -> None:
    artifact = tmp_path / "model.py"
    artifact.write_text(
        "def model(value):\n"
        "    raise RuntimeError('boom')\n",
        encoding="utf-8",
    )
    runtime = PythonRuntime()
    model = runtime.load(str(artifact))
    with pytest.raises(ValueError, match="Model prediction failed: boom"):
        runtime.predict(model, "input")


def test_python_runtime_allows_safe_builtin_model_logic(tmp_path: Path) -> None:
    artifact = tmp_path / "model.py"
    artifact.write_text(
        "def model(value):\n"
        "    values = [int(value), 2, 3]\n"
        "    return sum(values)\n",
        encoding="utf-8",
    )
    runtime = PythonRuntime()
    model = runtime.load(str(artifact))
    assert runtime.predict(model, "4") == 9


@pytest.mark.parametrize(
    "source",
    [
        "import os\n\ndef model(value):\n    return os.getcwd()\n",
        "def model(value):\n    return open('forbidden.txt', 'w')\n",
    ],
)
def test_python_runtime_blocks_unsafe_builtins(tmp_path: Path, source: str) -> None:
    artifact = tmp_path / "unsafe.py"
    artifact.write_text(source, encoding="utf-8")
    with pytest.raises(ValueError, match="Python model artifact execution failed"):
        PythonRuntime().load(str(artifact))


def test_sklearn_runtime_rejects_artifact_without_predict(tmp_path: Path) -> None:
    artifact = tmp_path / "model.joblib"
    joblib.dump(object(), artifact)
    runtime = SklearnRuntime()
    model = runtime.load(str(artifact))
    with pytest.raises(ValueError, match="predict method"):
        runtime.predict(model, "input")


def test_sklearn_runtime_rejects_empty_predictions(tmp_path: Path) -> None:
    artifact = tmp_path / "empty.joblib"
    joblib.dump(EmptyPredictionModel(), artifact)
    runtime = SklearnRuntime()
    model = runtime.load(str(artifact))
    with pytest.raises(ValueError, match="no predictions"):
        runtime.predict(model, "input")
