"""Run registry + provenance hashing.

Writes an append-only JSONL of every completed run. Each row captures enough
metadata that the run can be bit-for-bit re-traced (up to LLM non-determinism).
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path


def _sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_of(path: str | Path) -> str:
    return _sha256_of_file(Path(path))


def sha256_of_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def git_sha(repo_root: str | Path = ".") -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
    except Exception:
        return "unknown"


def git_branch(repo_root: str | Path = ".") -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(repo_root), "rev-parse", "--abbrev-ref", "HEAD"],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
    except Exception:
        return "unknown"


def git_dirty(repo_root: str | Path = ".") -> bool:
    try:
        out = subprocess.check_output(
            ["git", "-C", str(repo_root), "status", "--porcelain"],
            stderr=subprocess.DEVNULL,
        ).decode()
        return bool(out.strip())
    except Exception:
        return True


@dataclass
class RunManifest:
    run_id: str
    timestamp_utc: str
    git_sha: str
    git_branch: str
    git_dirty: bool
    config_path: str
    config_sha256: str
    model_student: str
    model_grader: str = "claude-opus-4-7"
    dataset_path: str = ""
    dataset_sha256: str = ""
    ground_truth_path: str = ""
    ground_truth_sha256: str = ""
    prompt_hashes: dict[str, str] = field(default_factory=dict)
    classifier_variant: str = ""
    deid_variant: str = ""
    taxonomy_variant: str = ""
    n_emails: int = 0
    cost_usd: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0
    wall_clock_seconds: float = 0.0
    seed_sampling: int | None = None
    notes: str = ""
    status: str = "started"   # started | completed | interrupted | failed


def now_utc_iso() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def append_registry_row(registry_path: Path, manifest: RunManifest) -> None:
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    with registry_path.open("a") as f:
        f.write(json.dumps(asdict(manifest)) + "\n")


def build_run_id(condition_id: str) -> str:
    ts = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    return f"{condition_id}-{ts}"
