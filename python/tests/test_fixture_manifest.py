"""P2.0 evidence that the versioned fixture manifest is complete and honest.

A ``planned`` fixture is never evidence. An ``established`` fixture must exist
on disk and be indexed. This suite fails if the manifest drifts from the
repository.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

VALID_STATUSES = frozenset({"established", "planned"})
VALID_ROLES = frozenset(
    {"request", "response", "error", "malformed-record", "input", "positive", "negative"}
)
VALID_SLICES = frozenset({"P2.0", "P2.1", "P2.2", "P2.3", "P2.4", "P2.5", "P2.6"})


def _fixtures(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    fixtures = manifest["fixtures"]
    assert isinstance(fixtures, list) and fixtures
    return fixtures


def test_manifest_is_versioned_and_phase_scoped(
    manifest: dict[str, Any], repo_root: Path
) -> None:
    assert manifest["schemaVersion"] == "1.0"
    assert manifest["phase"] == 2
    assert manifest["protocolVersion"] == "1.0"
    assert (repo_root / manifest["authority"]).is_file()
    assert (repo_root / manifest["plan"]).is_file()


def test_fixture_ids_are_unique(manifest: dict[str, Any]) -> None:
    ids = [fixture["id"] for fixture in _fixtures(manifest)]
    assert len(ids) == len(set(ids))


def test_every_fixture_declares_status_role_and_owner_slice(
    manifest: dict[str, Any]
) -> None:
    for fixture in _fixtures(manifest):
        assert fixture["status"] in VALID_STATUSES, fixture["id"]
        assert fixture["role"] in VALID_ROLES, fixture["id"]
        assert fixture["ownerSlice"] in VALID_SLICES, fixture["id"]
        assert fixture["kind"], fixture["id"]


def test_established_fixtures_exist_on_disk(
    manifest: dict[str, Any], repo_root: Path
) -> None:
    established = [f for f in _fixtures(manifest) if f["status"] == "established"]
    assert established
    for fixture in established:
        # Synthetic fixtures are generated at test time; their committed artifact
        # is the expected output, not a stored input file.
        path = fixture.get("path") or fixture.get("expectedPath")
        assert isinstance(path, str) and path, fixture["id"]
        assert (repo_root / path).is_file(), f"{fixture['id']} missing {path}"


def test_planned_fixtures_claim_no_evidence(manifest: dict[str, Any]) -> None:
    # After P2.4 every scientific fixture is established; if any fixture is still
    # planned it must never claim a path or an expected output.
    for fixture in _fixtures(manifest):
        if fixture["status"] != "planned":
            continue
        assert not fixture.get("path"), fixture["id"]
        assert fixture.get("expectedPath") is None, fixture["id"]
        assert fixture["ownerSlice"] != "P2.0", fixture["id"]


def test_established_synthetic_dicom_requires_expected_output(
    manifest: dict[str, Any]
) -> None:
    for fixture in _fixtures(manifest):
        if fixture["status"] == "established" and fixture["kind"] == "synthetic-dicom":
            assert fixture.get("expectedPath"), fixture["id"]


def test_scientific_fixture_slices_are_established(manifest: dict[str, Any]) -> None:
    established_slices = {
        fixture["ownerSlice"]
        for fixture in _fixtures(manifest)
        if fixture["status"] == "established"
    }
    # Classification (P2.2), geometry (P2.3) and quantitation (P2.4) are all
    # established evidence; no scientific slice is left as planned.
    assert {"P2.2", "P2.3", "P2.4"} <= established_slices
    planned_slices = {
        fixture["ownerSlice"]
        for fixture in _fixtures(manifest)
        if fixture["status"] == "planned"
    }
    assert not (planned_slices & {"P2.2", "P2.3", "P2.4"})


def test_negative_request_shaped_fixtures_are_envelope_shaped(
    manifest: dict[str, Any], repo_root: Path
) -> None:
    checked = 0
    for fixture in _fixtures(manifest):
        if fixture.get("kind") != "protocol-example" or fixture.get("role") != "negative":
            continue
        path = fixture.get("path")
        assert isinstance(path, str) and path, fixture["id"]
        record = json.loads((repo_root / path).read_text(encoding="utf-8"))
        if not isinstance(record, dict) or "method" not in record:
            continue
        checked += 1
        assert record["jsonrpc"] == "2.0", fixture["id"]
        identifier = record.get("id")
        assert (
            isinstance(identifier, (str, int)) and not isinstance(identifier, bool)
        ), fixture["id"]
        method = record["method"]
        assert isinstance(method, str) and method.startswith("nuclear."), fixture["id"]
        assert method != "nuclear.", fixture["id"]
        assert isinstance(record.get("protocolVersion"), str), fixture["id"]
    assert checked >= 3
