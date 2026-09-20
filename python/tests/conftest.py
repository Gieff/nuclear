"""Shared pytest fixtures for the NuClear scientific worker test suite.

Locates repository-level fixture data without assuming the current working
directory, so the same command works from the repository root or from
``python/``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = REPO_ROOT / "tests" / "fixtures"


@pytest.fixture(scope="session")
def repo_root() -> Path:
    """Absolute path to the repository root."""
    return REPO_ROOT


@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    """Absolute path to the versioned fixture directory."""
    return FIXTURES_DIR


@pytest.fixture(scope="session")
def manifest(fixtures_dir: Path) -> dict[str, Any]:
    """Parsed ``tests/fixtures/manifest.json`` fixture index."""
    raw = (fixtures_dir / "manifest.json").read_text(encoding="utf-8")
    parsed = json.loads(raw)
    assert isinstance(parsed, dict)
    return parsed
