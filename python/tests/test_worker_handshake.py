"""P2.1 evidence for the ``nuclear.protocol.handshake`` operation.

The handshake must be deterministic under an injected clock and must reproduce
the ratified fixture ``tests/fixtures/protocol/response.handshake.json``.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

import worker
from worker.dispatch import Dispatcher, build_dispatcher
from worker.envelope import process_record
from worker.protocol import (
    DICOM_COMPATIBILITY_METHOD,
    DICOM_GEOMETRY_METHOD,
    DICOM_INSPECT_METHOD,
    HANDSHAKE_METHOD,
    PROTOCOL_VERSION,
)

FROZEN_NOW = datetime(2026, 9, 20, 0, 0, 0, tzinfo=timezone.utc)
FROZEN_TIMESTAMP = "2026-09-20T00:00:00Z"


def _load(repo_root: Path, name: str) -> dict[str, Any]:
    path = repo_root / "tests" / "fixtures" / "protocol" / name
    parsed = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(parsed, dict)
    return parsed


@pytest.fixture
def dispatcher() -> Dispatcher:
    return build_dispatcher(now=lambda: FROZEN_NOW)


def test_handshake_success_carries_worker_provenance(
    dispatcher: Dispatcher, repo_root: Path
) -> None:
    request = _load(repo_root, "request.handshake.json")
    response = process_record(json.dumps(request), 0, dispatcher)

    assert response["jsonrpc"] == "2.0"
    assert response["id"] == "req-0001"
    assert response["protocolVersion"] == PROTOCOL_VERSION
    assert "error" not in response

    result = response["result"]
    assert result["protocolVersions"] == [PROTOCOL_VERSION]
    assert result["operations"] == [
        DICOM_COMPATIBILITY_METHOD,
        DICOM_GEOMETRY_METHOD,
        DICOM_INSPECT_METHOD,
        HANDSHAKE_METHOD,
    ]

    metadata = result["workerMetadata"]
    assert metadata["workerVersion"] == worker.__version__
    assert metadata["operation"] == request["method"] == HANDSHAKE_METHOD
    assert metadata["parameters"] == {}
    assert metadata["timestamp"] == FROZEN_TIMESTAMP


def test_handshake_round_trip_matches_ratified_fixture(
    dispatcher: Dispatcher, repo_root: Path
) -> None:
    request = _load(repo_root, "request.handshake.json")
    expected = _load(repo_root, "response.handshake.json")
    actual = process_record(json.dumps(request), 0, dispatcher)
    assert actual == expected, "Implemented handshake drifted from the ratified fixture"


def test_handshake_preserves_arbitrary_request_id(dispatcher: Dispatcher) -> None:
    request = {
        "jsonrpc": "2.0",
        "id": "correlation-42",
        "protocolVersion": PROTOCOL_VERSION,
        "method": HANDSHAKE_METHOD,
        "params": {},
    }
    response = process_record(json.dumps(request), 3, dispatcher)
    assert response["id"] == "correlation-42"
    assert "result" in response
