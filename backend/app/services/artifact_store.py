from pathlib import Path
from uuid import uuid4


class LocalArtifactStore:
    """Store model artifacts on the local filesystem."""

    def __init__(self, root: str | Path = "artifacts") -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, model_name: str, version: str, filename: str, content: bytes) -> str:
        safe_filename = Path(filename).name
        if not safe_filename:
            raise ValueError("Artifact filename is required")

        artifact_dir = self.root / model_name / version
        artifact_dir.mkdir(parents=True, exist_ok=True)

        destination = artifact_dir / f"{uuid4().hex}-{safe_filename}"
        destination.write_bytes(content)
        return str(destination)

    def resolve(self, artifact_path: str) -> Path:
        path = Path(artifact_path)
        root = self.root.resolve()

        if ".." in path.parts:
            raise ValueError("Invalid artifact path")

        resolved = path.resolve()

        if root != resolved and root not in resolved.parents:
            raise ValueError("Invalid artifact path")

        return resolved

    def delete_version(self, model_name: str, version: str) -> None:
        artifact_dir = self.root / Path(model_name).name / Path(version).name

        if not artifact_dir.exists():
            return

        if not artifact_dir.is_dir():
            raise OSError("Artifact version path is not a directory")

        for path in artifact_dir.iterdir():
            if path.is_file():
                path.unlink()

        artifact_dir.rmdir()
