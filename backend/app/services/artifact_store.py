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
