"""NuClear worker protocol constants, error schema and response envelopes.

This module is transport-only. It defines the NuClear protocol version, the
JSON-RPC 2.0 error codes used by the worker, the structured
:class:`ProtocolError` raised by scientific handlers, and the response builders
shared by the envelope and stdio layers. It contains no DICOM, geometry or
quantitation logic.

Transport authority:
    ``docs/decisions/ADR-002-scientific-worker-stdio-json-rpc.md``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

PROTOCOL_VERSION = "1.0"
NUCLEAR_PROTOCOL = PROTOCOL_VERSION
METHOD_PREFIX = "nuclear."
HANDSHAKE_METHOD = "nuclear.protocol.handshake"
DICOM_INSPECT_METHOD = "nuclear.dicom.inspect"
DICOM_GEOMETRY_METHOD = "nuclear.dicom.geometry"
DICOM_COMPATIBILITY_METHOD = "nuclear.dicom.compatibility"
QUANTITATION_SUVBW_METHOD = "nuclear.quantitation.suvbw"
REGISTRATION_METHOD = "nuclear.registration"
SUPPORTED_PROTOCOL_VERSIONS: tuple[str, ...] = (PROTOCOL_VERSION,)

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603
PROTOCOL_VERSION_MISMATCH = -32001
SOURCE_UNAVAILABLE = -32010
OPERATION_NOT_IMPLEMENTED = -32011
#: Refused registration: a scientific validation (same Frame of Reference,
#: degenerate landmarks, improper/reflection fit) failed fail-closed. Ratified
#: by the phase owner on 2026-09-22 (2B.0 R10).
REGISTRATION_INVALID = -32012

STANDARD_ERROR_CODES = frozenset(
    {PARSE_ERROR, INVALID_REQUEST, METHOD_NOT_FOUND, INVALID_PARAMS, INTERNAL_ERROR}
)
NUCLEAR_RESERVED_CODES = frozenset(
    {
        PROTOCOL_VERSION_MISMATCH,
        SOURCE_UNAVAILABLE,
        OPERATION_NOT_IMPLEMENTED,
        REGISTRATION_INVALID,
    }
)

ERROR_MESSAGES: dict[int, str] = {
    PARSE_ERROR: "Parse error",
    INVALID_REQUEST: "Invalid request",
    METHOD_NOT_FOUND: "Method not found",
    INVALID_PARAMS: "Invalid params",
    INTERNAL_ERROR: "Internal error",
    PROTOCOL_VERSION_MISMATCH: "Protocol version mismatch",
    SOURCE_UNAVAILABLE: "Source unavailable",
    OPERATION_NOT_IMPLEMENTED: "Operation not implemented",
    REGISTRATION_INVALID: "Registration invalid",
}


class ProtocolError(Exception):
    """A structured, serializable JSON-RPC error raised by a handler.

    Attributes:
        code: JSON-RPC or NuClear reserved numeric error code.
        message: Short human-readable error label.
        data: Structured payload; must contain a non-empty ``diagnostic``.
    """

    def __init__(self, code: int, message: str, data: dict[str, Any]) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data


def iso8601_utc(moment: datetime) -> str:
    """Format an instant as second-precision ISO-8601 UTC ending in ``Z``.

    Args:
        moment: A timezone-aware datetime (naive values are treated as local).

    Returns:
        A string such as ``2026-09-20T00:00:00Z``.

    Examples:
        >>> from datetime import datetime, timezone
        >>> iso8601_utc(datetime(2026, 9, 20, tzinfo=timezone.utc))
        '2026-09-20T00:00:00Z'
    """
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def success_response(request_id: str | int, result: dict[str, Any]) -> dict[str, Any]:
    """Build a JSON-RPC 2.0 success envelope with the NuClear protocol version.

    Args:
        request_id: The correlated request identifier.
        result: JSON-serializable operation result.

    Returns:
        A response dictionary carrying ``result`` and never ``error``.
    """
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "protocolVersion": PROTOCOL_VERSION,
        "result": result,
    }


def error_response(
    request_id: str | int | None,
    code: int,
    message: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Build a JSON-RPC 2.0 error envelope with a mandatory diagnostic.

    Args:
        request_id: Correlated id, or ``None`` when it cannot be determined.
        code: JSON-RPC or NuClear reserved error code.
        message: Short human-readable error label.
        data: Structured error payload containing a non-empty ``diagnostic``.

    Returns:
        A response dictionary carrying ``error`` and never ``result``.

    Raises:
        ValueError: If ``data`` lacks a non-empty string ``diagnostic``. This
            keeps the fail-closed contract enforceable by construction.
    """
    diagnostic = data.get("diagnostic")
    if not isinstance(diagnostic, str) or not diagnostic:
        raise ValueError("Protocol errors require a non-empty data.diagnostic")
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "protocolVersion": PROTOCOL_VERSION,
        "error": {"code": code, "message": message, "data": data},
    }
