from pathlib import Path

import pytest

from app.services.artifact_store import LocalArtifactStore


def test_save_uses_unique_artifact_paths(tmp_path: Path) -> None:
    store = LocalArtifactStore(tmp_path / "artifacts")
    first = store.save("model", "v1", "model.py", b"first")
    second = store.save("model", "v1", "model.py", b"second")
    assert first != second
    assert Path(first).read_bytes() == b"first"
    assert Path(second).read_bytes() == b"second"


def test_save_removes_temporary_file_when_atomic_replace_fails(tmp_path: Path, monkeypatch) -> None:
    store = LocalArtifactStore(tmp_path / "artifacts")
    original_replace = Path.replace

    def fail_replace(self: Path, target: Path) -> Path:
        if self.name.endswith(".tmp"):
            raise OSError("simulated atomic replace failure")
        return original_replace(self, target)

    monkeypatch.setattr(Path, "replace", fail_replace)
    with pytest.raises(OSError, match="simulated atomic replace failure"):
        store.save("model", "v1", "model.py", b"artifact")
    artifact_dir = tmp_path / "artifacts" / "model" / "v1"
    assert list(artifact_dir.iterdir()) == []


def test_save_cleans_up_when_destination_replace_fails(tmp_path: Path, monkeypatch) -> None:
    store = LocalArtifactStore(tmp_path / "artifacts")
    original_replace = Path.replace

    def fail_replace(self: Path, target: Path) -> Path:
        if not self.name.endswith(".tmp"):
            raise OSError("destination replace failed")
        return original_replace(self, target)

    monkeypatch.setattr(Path, "replace", fail_replace)
    destination = tmp_path / "artifacts" / "model" / "v1"
    destination.mkdir(parents=True)
    with pytest.raises(OSError, match="destination replace failed"):
        store.save("model", "v1", "model.py", b"artifact")
    assert list(destination.iterdir()) == []


def test_resolve_rejects_paths_outside_artifact_root(tmp_path: Path) -> None:
    store = LocalArtifactStore(tmp_path / "artifacts")
    with pytest.raises(ValueError, match="Invalid artifact path"):
        store.resolve(str(tmp_path / "outside.py"))


def test_resolve_rejects_parent_traversal(tmp_path: Path) -> None:
    store = LocalArtifactStore(tmp_path / "artifacts")
    with pytest.raises(ValueError, match="Invalid artifact path"):
        store.resolve(str(store.root / "model" / "v1" / ".." / "outside.py"))


def test_delete_version_removes_version_and_empty_model_directory(tmp_path: Path) -> None:
    store = LocalArtifactStore(tmp_path / "artifacts")
    artifact = store.save("model", "v1", "model.py", b"artifact")
    store.delete_version("model", "v1")
    assert not Path(artifact).exists()
    assert not (tmp_path / "artifacts" / "model" / "v1").exists()
    assert not (tmp_path / "artifacts" / "model").exists()


def test_delete_version_rejects_invalid_model_or_version(tmp_path: Path) -> None:
    store = LocalArtifactStore(tmp_path / "artifacts")
    with pytest.raises(ValueError, match="Invalid artifact model or version"):
        store.delete_version("../model", "v1")
    with pytest.raises(ValueError, match="Invalid artifact model or version"):
        store.delete_version("model", "../v1")
