"""JSON-RPC request validation and response construction for the worker.

Validation is strictly ordered and fail-closed, exactly as required by ADR-002
and the P2.1 contract:

1. Invalid JSON -> ``-32700`` with ``id: null``.
2. Not an object / bad ``jsonrpc`` / bad ``method`` / bad ``id`` -> ``-32600``.
3. Missing or unsupported ``protocolVersion`` -> NuClear reserved ``-32001``.
4. ``params`` present but not an object -> ``-32602``.
5. Unknown method -> ``-32601``.
6. Handler raising an unexpected exception -> ``-32603``.

Every failure returns an error envelope with a non-empty ``data.diagnostic``
and never a ``result``; no plausible fallback is ever emitted.
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any

from .dispatch import Dispatcher
from .protocol import (
    ERROR_MESSAGES,
    INTERNAL_ERROR,
    INVALID_PARAMS,
    INVALID_REQUEST,
    METHOD_PREFIX,
    PARSE_ERROR,
    PROTOCOL_VERSION,
    PROTOCOL_VERSION_MISMATCH,
    SUPPORTED_PROTOCOL_VERSIONS,
    ProtocolError,
    error_response,
    success_response,
)

RequestId = str | int


def _determinable_id(payload: Any) -> RequestId | None:
    """Return a correlatable id, or ``None`` when none can be established."""
    if not isinstance(payload, dict):
        return None
    candidate = payload.get("id")
    if isinstance(candidate, bool):
        return None
    if isinstance(candidate, (str, int)):
        return candidate
    return None


def _has_valid_id(payload: dict[str, Any]) -> bool:
    """Return whether ``id`` is a JSON-RPC correlatable string or integer."""
    value = payload.get("id")
    return isinstance(value, (str, int)) and not isinstance(value, bool)


def _invalid_request(request_id: RequestId | None, diagnostic: str) -> dict[str, Any]:
    """Build a ``-32600`` response for a malformed request envelope."""
    return error_response(
        request_id,
        INVALID_REQUEST,
        ERROR_MESSAGES[INVALID_REQUEST],
        {"diagnostic": diagnostic},
    )


def process_record(raw_line: str, record_index: int, dispatcher: Dispatcher) -> dict[str, Any]:
    """Validate and process one newline-delimited JSON-RPC record.

    Args:
        raw_line: One raw request line, without its trailing newline.
        record_index: Zero-based index of this record among non-empty lines.
        dispatcher: Registry used to invoke ``nuclear.*`` methods.

    Returns:
        A JSON-RPC response envelope. Every failure returns an error envelope;
        this function never raises for malformed or failing input.
    """
    try:
        payload: Any = json.loads(raw_line)
    except json.JSONDecodeError:
        return error_response(
            None,
            PARSE_ERROR,
            ERROR_MESSAGES[PARSE_ERROR],
            {"recordIndex": record_index, "diagnostic": "Record is not valid JSON."},
        )

    request_id = _determinable_id(payload)
    if not isinstance(payload, dict):
        return _invalid_request(None, "Request record must be a JSON object.")
    if payload.get("jsonrpc") != "2.0":
        return _invalid_request(request_id, "Request must declare jsonrpc '2.0'.")
    method = payload.get("method")
    if not isinstance(method, str) or not method.startswith(METHOD_PREFIX):
        return _invalid_request(
            request_id,
            f"Method must be a non-empty string starting with '{METHOD_PREFIX}'.",
        )
    if not _has_valid_id(payload):
        return _invalid_request(request_id, "Request id must be a string or an integer.")

    protocol_version = payload.get("protocolVersion")
    if protocol_version != PROTOCOL_VERSION:
        return error_response(
            request_id,
            PROTOCOL_VERSION_MISMATCH,
            ERROR_MESSAGES[PROTOCOL_VERSION_MISMATCH],
            {
                "requestedProtocolVersion": protocol_version,
                "supportedProtocolVersions": list(SUPPORTED_PROTOCOL_VERSIONS),
                "diagnostic": f"Worker speaks NuClear protocol {PROTOCOL_VERSION} only.",
            },
        )

    params = payload.get("params", {})
    if not isinstance(params, dict):
        return error_response(
            request_id,
            INVALID_PARAMS,
            ERROR_MESSAGES[INVALID_PARAMS],
            {
                "diagnostic": "Expected an object for params.",
                "violations": [f"params must be a JSON object for {method}"],
            },
        )

    try:
        result = dispatcher.invoke(method, params)
    except ProtocolError as exc:
        return error_response(request_id, exc.code, exc.message, dict(exc.data))
    except Exception:  # noqa: BLE001 - structured fail-closed response, never a crash
        traceback.print_exc(file=sys.stderr)
        return error_response(
            request_id,
            INTERNAL_ERROR,
            ERROR_MESSAGES[INTERNAL_ERROR],
            {"diagnostic": f"Handler for {method} failed with an unexpected error."},
        )

    assert request_id is not None  # guaranteed by the validated-id check above
    return success_response(request_id, result)
