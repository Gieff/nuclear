"""P2.1 evidence for the fail-closed JSON-RPC envelope validation order.

Each case asserts the exact error code, the correlated or null ``id``, a
non-empty ``data.diagnostic``, and the strict absence of a ``result`` key.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from worker.dispatch import Dispatcher, build_dispatcher
from worker.envelope import process_record
from worker.protocol import (
    DICOM_INSPECT_METHOD,
    HANDSHAKE_METHOD,
    INVALID_PARAMS,
    INVALID_REQUEST,
    METHOD_NOT_FOUND,
    NUCLEAR_RESERVED_CODES,
    PARSE_ERROR,
    PROTOCOL_VERSION,
    PROTOCOL_VERSION_MISMATCH,
    STANDARD_ERROR_CODES,
)

FROZEN_NOW = datetime(2026, 9, 20, 0, 0, 0, tzinfo=timezone.utc)
REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = REPO_ROOT / "tests" / "fixtures" / "manifest.json"


@pytest.fixture
def dispatcher() -> Dispatcher:
    return build_dispatcher(now=lambda: FROZEN_NOW)


def _base_request(**overrides: Any) -> dict[str, Any]:
    request: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": "req-test",
        "protocolVersion": PROTOCOL_VERSION,
        "method": HANDSHAKE_METHOD,
        "params": {},
    }
    request.update(overrides)
    return request


def _run(dispatcher: Dispatcher, request: Any) -> dict[str, Any]:
    return process_record(json.dumps(request), 0, dispatcher)


def _assert_error(response: dict[str, Any], code: int) -> dict[str, Any]:
    assert response["jsonrpc"] == "2.0"
    assert response["protocolVersion"] == PROTOCOL_VERSION
    assert "result" not in response, "Fail-closed responses must never carry a result"
    error = response["error"]
    assert error["code"] == code
    assert isinstance(error["message"], str) and error["message"]
    assert isinstance(error["data"], dict)
    diagnostic = error["data"].get("diagnostic")
    assert isinstance(diagnostic, str) and diagnostic
    assert error["code"] in STANDARD_ERROR_CODES or error["code"] in NUCLEAR_RESERVED_CODES
    return error


def test_malformed_json_is_parse_error_with_null_id(dispatcher: Dispatcher) -> None:
    response = process_record('{"jsonrpc": "2.0", "method": ', 0, dispatcher)
    assert response["id"] is None
    error = _assert_error(response, PARSE_ERROR)
    assert error["data"]["recordIndex"] == 0


def test_non_object_record_is_invalid_request(dispatcher: Dispatcher) -> None:
    response = process_record("[1, 2, 3]", 0, dispatcher)
    assert response["id"] is None
    _assert_error(response, INVALID_REQUEST)


def test_wrong_jsonrpc_is_invalid_request_and_echoes_id(dispatcher: Dispatcher) -> None:
    response = _run(dispatcher, _base_request(jsonrpc="1.0"))
    assert response["id"] == "req-test"
    _assert_error(response, INVALID_REQUEST)


def test_missing_id_is_invalid_request_with_null_id(dispatcher: Dispatcher) -> None:
    request = _base_request()
    del request["id"]
    response = _run(dispatcher, request)
    assert response["id"] is None
    _assert_error(response, INVALID_REQUEST)


def test_boolean_id_is_invalid_request_with_null_id(dispatcher: Dispatcher) -> None:
    response = _run(dispatcher, _base_request(id=True))
    assert response["id"] is None
    _assert_error(response, INVALID_REQUEST)


def test_non_namespaced_method_is_invalid_request(dispatcher: Dispatcher) -> None:
    response = _run(dispatcher, _base_request(method="dicom.inspect"))
    assert response["id"] == "req-test"
    _assert_error(response, INVALID_REQUEST)


def test_protocol_version_mismatch_reports_versions(dispatcher: Dispatcher) -> None:
    response = _run(dispatcher, _base_request(protocolVersion="2.0"))
    assert response["id"] == "req-test"
    error = _assert_error(response, PROTOCOL_VERSION_MISMATCH)
    assert error["data"]["requestedProtocolVersion"] == "2.0"
    assert error["data"]["supportedProtocolVersions"] == [PROTOCOL_VERSION]


def test_missing_protocol_version_reports_null_requested(dispatcher: Dispatcher) -> None:
    request = _base_request()
    del request["protocolVersion"]
    response = _run(dispatcher, request)
    error = _assert_error(response, PROTOCOL_VERSION_MISMATCH)
    assert error["data"]["requestedProtocolVersion"] is None
    assert error["data"]["supportedProtocolVersions"] == [PROTOCOL_VERSION]


def test_array_params_is_invalid_params(dispatcher: Dispatcher) -> None:
    response = _run(dispatcher, _base_request(params=[]))
    error = _assert_error(response, INVALID_PARAMS)
    violations = error["data"]["violations"]
    assert isinstance(violations, list) and violations


def test_unknown_method_is_method_not_found_without_result(dispatcher: Dispatcher) -> None:
    response = _run(dispatcher, _base_request(method="nuclear.unknown.operation"))
    assert response["id"] == "req-test"
    error = _assert_error(response, METHOD_NOT_FOUND)
    assert error["data"]["requestedMethod"] == "nuclear.unknown.operation"
    assert error["data"]["supportedMethods"] == [DICOM_INSPECT_METHOD, HANDSHAKE_METHOD]


def test_every_failure_has_diagnostic_and_no_result(dispatcher: Dispatcher) -> None:
    cases: list[tuple[str, int]] = [
        ('{"jsonrpc": "2.0"', PARSE_ERROR),
        ("[1, 2]", INVALID_REQUEST),
        (json.dumps(_base_request(jsonrpc="1.0")), INVALID_REQUEST),
        (json.dumps(_base_request(id=False)), INVALID_REQUEST),
        (json.dumps(_base_request(protocolVersion="3.0")), PROTOCOL_VERSION_MISMATCH),
        (json.dumps(_base_request(params=[])), INVALID_PARAMS),
        (json.dumps(_base_request(method="nuclear.missing")), METHOD_NOT_FOUND),
    ]
    for raw_line, expected_code in cases:
        _assert_error(process_record(raw_line, 0, dispatcher), expected_code)


def _load_manifest() -> dict[str, Any]:
    parsed = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    assert isinstance(parsed, dict)
    return parsed


_MANIFEST = _load_manifest()


def _protocol_examples(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        fixture
        for fixture in manifest["fixtures"]
        if fixture.get("kind") == "protocol-example"
        and fixture.get("status") == "established"
        and isinstance(fixture.get("path"), str)
    ]


def _read_text(fixture: dict[str, Any]) -> str:
    return (REPO_ROOT / fixture["path"]).read_text(encoding="utf-8")


def _read_record(fixture: dict[str, Any]) -> dict[str, Any]:
    parsed = json.loads(_read_text(fixture))
    assert isinstance(parsed, dict)
    return parsed


def _round_trip_specs() -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Pair every request-shaped fixture with its expected response or error."""
    fixtures = _protocol_examples(_MANIFEST)
    expected_by_id: dict[Any, dict[str, Any]] = {}
    for fixture in fixtures:
        if fixture.get("role") in {"response", "error"}:
            record = _read_record(fixture)
            if record.get("id") is not None:
                expected_by_id[record["id"]] = fixture

    specs: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for fixture in fixtures:
        if fixture.get("role") not in {"request", "negative"}:
            continue
        record = _read_record(fixture)
        if "method" not in record:
            continue
        expected = expected_by_id.get(record["id"])
        assert expected is not None, f"Unpaired request fixture: {fixture['id']}"
        specs.append((fixture, expected))

    parse_errors = [
        fixture
        for fixture in fixtures
        if fixture.get("role") == "error" and _read_record(fixture).get("id") is None
    ]
    assert len(parse_errors) == 1, "Exactly one id-less parse error fixture is required"
    for fixture in fixtures:
        if fixture.get("role") == "malformed-record":
            specs.append((fixture, parse_errors[0]))
    return specs


_ROUND_TRIP_SPECS = _round_trip_specs()


@pytest.mark.parametrize(
    ("request_fixture", "expected_fixture"),
    [
        pytest.param(request, expected, id=request["id"])
        for request, expected in _ROUND_TRIP_SPECS
    ],
)
def test_normative_fixture_round_trip(
    request_fixture: dict[str, Any],
    expected_fixture: dict[str, Any],
    dispatcher: Dispatcher,
) -> None:
    expected = _read_record(expected_fixture)
    actual = process_record(_read_text(request_fixture), 0, dispatcher)
    assert actual == expected, f"{request_fixture['id']} drifted from its fixture"


def test_round_trip_pair_set_is_complete() -> None:
    fixtures = _protocol_examples(_MANIFEST)
    request_like = {
        fixture["id"]
        for fixture in fixtures
        if fixture.get("role") in {"request", "malformed-record"}
        or (fixture.get("role") == "negative" and "method" in _read_record(fixture))
    }
    expected_like = {
        fixture["id"] for fixture in fixtures if fixture.get("role") in {"response", "error"}
    }
    assert {request["id"] for request, _ in _ROUND_TRIP_SPECS} == request_like
    assert {expected["id"] for _, expected in _ROUND_TRIP_SPECS} == expected_like
