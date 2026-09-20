"""Strict JSON boundary evidence for the NuClear worker.

Outgoing: a handler returning a non-finite float must never emit invalid JSON;
the stdio loop answers ``-32603`` and survives. Incoming: the non-standard
``NaN``/``Infinity`` constants must be rejected as ``-32700`` parse errors.
"""

from __future__ import annotations

import io
import json
from collections.abc import Mapping
from typing import Any

import pytest

from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import INTERNAL_ERROR, PARSE_ERROR
from worker.stdio import serve

NON_FINITE_METHOD = "nuclear.test.nonfinite"


def _non_finite_handler(params: Mapping[str, Any]) -> dict[str, Any]:
    """Return a NaN on purpose so serialization must fail closed."""
    return {"value": float("nan")}


def test_non_finite_result_is_answered_fail_closed() -> None:
    dispatcher = build_dispatcher()
    dispatcher.register(NON_FINITE_METHOD, _non_finite_handler)
    request = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": "req-nonfinite",
            "protocolVersion": "1.0",
            "method": NON_FINITE_METHOD,
            "params": {},
        }
    )
    stdout = io.StringIO()
    stderr = io.StringIO()

    exit_code = serve([request], stdout, stderr, dispatcher)

    assert exit_code == 0
    lines = stdout.getvalue().splitlines()
    assert len(lines) == 1, "exactly one response line must be written"
    response = json.loads(lines[0])
    assert response["jsonrpc"] == "2.0"
    assert response["id"] == "req-nonfinite"
    assert "result" not in response
    assert response["error"]["code"] == INTERNAL_ERROR
    assert response["error"]["data"]["diagnostic"]
    assert stderr.getvalue(), "the serialization failure must reach stderr"


@pytest.mark.parametrize("constant", ["NaN", "Infinity", "-Infinity"])
def test_non_standard_json_constants_are_parse_errors(constant: str) -> None:
    raw = (
        '{"jsonrpc":"2.0","id":"req-constant","protocolVersion":"1.0",'
        '"method":"nuclear.protocol.handshake","params":{"value":' + constant + "}}"
    )
    response = process_record(raw, 0, build_dispatcher())
    assert response["id"] is None
    assert response["protocolVersion"] == "1.0"
    assert response["error"]["code"] == PARSE_ERROR
    assert response["error"]["data"]["diagnostic"]
    assert "result" not in response
