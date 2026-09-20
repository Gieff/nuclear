"""P2.0 evidence that the versioned JSON-RPC examples match ADR-002.

These tests validate the *envelope* only. They deliberately assert that no
example carries a clinical result, and that malformed input and unsupported
operations fail closed instead of producing a plausible fallback.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

PROTOCOL_VERSION = "1.0"
METHOD_PREFIX = "nuclear."
STANDARD_ERROR_CODES = frozenset({-32700, -32600, -32601, -32602, -32603})
NUCLEAR_RESERVED_CODES = frozenset(range(-32099, -31999))
_SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
PROTOCOL_DIR = "tests/fixtures/protocol/"


def _established(manifest: dict[str, Any], role: str) -> list[dict[str, Any]]:
    return [
        fixture
        for fixture in manifest["fixtures"]
        if fixture.get("kind") == "protocol-example"
        and fixture.get("status") == "established"
        and fixture.get("role") == role
    ]


def _record(repo_root: Path, fixture: dict[str, Any]) -> dict[str, Any]:
    """Read one protocol fixture using its repository-relative manifest path."""
    parsed = json.loads((repo_root / fixture["path"]).read_text(encoding="utf-8"))
    assert isinstance(parsed, dict)
    return parsed


def test_manifest_indexes_requests_responses_errors_and_malformed(
    manifest: dict[str, Any]
) -> None:
    for role in ("request", "response", "error", "malformed-record"):
        assert _established(manifest, role), role


def test_request_envelopes_are_adr002_compliant(
    manifest: dict[str, Any], repo_root: Path
) -> None:
    for fixture in _established(manifest, "request"):
        record = _record(repo_root, fixture)
        assert record["jsonrpc"] == "2.0"
        assert record["protocolVersion"] == PROTOCOL_VERSION
        assert isinstance(record["id"], str) and record["id"]
        method = record["method"]
        assert isinstance(method, str) and method.startswith(METHOD_PREFIX)
        assert method != METHOD_PREFIX
        assert isinstance(record["params"], dict)
        assert "result" not in record and "error" not in record


def test_responses_correlate_and_carry_worker_provenance(
    manifest: dict[str, Any], repo_root: Path
) -> None:
    requests = {
        record["id"]: record
        for record in (
            _record(repo_root, fixture) for fixture in _established(manifest, "request")
        )
    }
    responses = [_record(repo_root, fixture) for fixture in _established(manifest, "response")]
    assert responses
    assert {response["id"] for response in responses} == set(requests)
    for response in responses:
        request = requests[response["id"]]
        assert response["protocolVersion"] == request["protocolVersion"] == PROTOCOL_VERSION
        assert "error" not in response
        metadata = response["result"]["workerMetadata"]
        assert _SEMVER.match(metadata["workerVersion"]), metadata["workerVersion"]
        assert metadata["operation"] == request["method"]
        assert isinstance(metadata["timestamp"], str) and "T" in metadata["timestamp"]
        assert isinstance(metadata["parameters"], dict)


def test_error_envelopes_fail_closed(
    manifest: dict[str, Any], repo_root: Path
) -> None:
    entries = _established(manifest, "error")
    assert entries
    codes: set[int] = set()
    for fixture in entries:
        record = _record(repo_root, fixture)
        assert record["jsonrpc"] == "2.0"
        assert record["protocolVersion"] == PROTOCOL_VERSION
        assert "result" not in record
        error = record["error"]
        assert isinstance(error["code"], int)
        assert isinstance(error["message"], str) and error["message"]
        assert isinstance(error["data"], dict)
        assert error["data"].get("diagnostic")
        assert error["code"] in STANDARD_ERROR_CODES or error["code"] in NUCLEAR_RESERVED_CODES
        codes.add(error["code"])
    assert {-32601, -32602, -32700} <= codes


def test_parse_error_cannot_correlate_an_id(
    manifest: dict[str, Any], repo_root: Path
) -> None:
    parse_fixtures = [
        fixture for fixture in _established(manifest, "error") if "parse" in fixture["id"]
    ]
    assert parse_fixtures
    for fixture in parse_fixtures:
        assert _record(repo_root, fixture)["id"] is None


def test_protocol_mismatch_reports_requested_and_supported_versions(
    manifest: dict[str, Any], repo_root: Path
) -> None:
    mismatches = [
        fixture for fixture in _established(manifest, "error") if "mismatch" in fixture["id"]
    ]
    assert mismatches
    for fixture in mismatches:
        record = _record(repo_root, fixture)
        data = record["error"]["data"]
        assert data["requestedProtocolVersion"] != PROTOCOL_VERSION
        assert PROTOCOL_VERSION in data["supportedProtocolVersions"]
        assert record["protocolVersion"] == PROTOCOL_VERSION


def test_malformed_records_fail_to_parse(
    manifest: dict[str, Any], repo_root: Path
) -> None:
    entries = _established(manifest, "malformed-record")
    assert entries
    for fixture in entries:
        raw = (repo_root / fixture["path"]).read_text(encoding="utf-8")
        with pytest.raises(json.JSONDecodeError):
            json.loads(raw)


def test_every_protocol_file_is_indexed(
    manifest: dict[str, Any], repo_root: Path
) -> None:
    indexed = {
        (repo_root / fixture["path"]).resolve()
        for fixture in manifest["fixtures"]
        if fixture.get("status") == "established"
        and str(fixture.get("path", "")).startswith(PROTOCOL_DIR)
    }
    protocol_dir = repo_root / PROTOCOL_DIR
    on_disk = {
        path.resolve()
        for path in protocol_dir.iterdir()
        if path.is_file() and path.name != "README.md"
    }
    assert on_disk <= indexed, on_disk - indexed
