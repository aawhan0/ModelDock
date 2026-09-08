from pathlib import Path
from uuid import uuid4
import os


class LocalArtifactStore:
    """Store model artifacts on the local filesystem."""

    def __init__(self, root: str | Path = "artifacts") -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, model_name: str, version: str, filename: str, content: bytes) -> str:
        safe_filename = Path(filename).name
        if not safe_filename:
            raise ValueError("Artifact filename is required")

        safe_model = Path(model_name).name
        safe_version = Path(version).name
        if safe_model != model_name or safe_version != version or not safe_model or not safe_version:
            raise ValueError("Invalid artifact model or version")

        artifact_dir = self.root / safe_model / safe_version
        artifact_dir.mkdir(parents=True, exist_ok=True)

        destination = artifact_dir / f"{uuid4().hex}-{safe_filename}"
        temporary = artifact_dir / f".{destination.name}.tmp"
        try:
            temporary.write_bytes(content)
            temporary.replace(destination)
        except Exception:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass
            raise
        return str(destination)

    def resolve(self, artifact_path: str) -> Path:
        relative_path = Path(artifact_path)
        if not os.fspath(artifact_path) or ".." in relative_path.parts:
            raise ValueError("Invalid artifact path")

        root = os.path.realpath(self.root)

        if relative_path.is_absolute():
            candidate = os.fspath(relative_path)
        else:
            candidate = os.path.join(root, os.fspath(relative_path))

        resolved = os.path.realpath(candidate)

        try:
            if os.path.commonpath((root, resolved)) != root:
                raise ValueError("Invalid artifact path")
        except ValueError as exc:
            raise ValueError("Invalid artifact path") from exc

        return Path(resolved)

    def delete_version(self, model_name: str, version: str) -> None:
        safe_model = Path(model_name).name
        safe_version = Path(version).name
        if safe_model != model_name or safe_version != version or not safe_model or not safe_version:
            raise ValueError("Invalid artifact model or version")

        artifact_dir = self.root / safe_model / safe_version

        if not artifact_dir.exists():
            return

        if not artifact_dir.is_dir():
            raise OSError("Artifact version path is not a directory")

        for path in artifact_dir.iterdir():
            if path.is_file():
                path.unlink()

        artifact_dir.rmdir()

        model_dir = artifact_dir.parent
        try:
            model_dir.rmdir()
        except OSError:
            pass
