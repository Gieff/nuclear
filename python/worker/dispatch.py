"""Method registry and dispatch for the NuClear scientific worker.

The registry is intentionally minimal for P2.1: only
``nuclear.protocol.handshake`` is registered. Later slices (P2.2-P2.4)
register DICOM inspection, geometry and quantitation handlers on the same
:class:`Dispatcher` without changing the envelope or stdio contracts.

Handlers receive the request ``params`` mapping and return a JSON-serializable
result dictionary. A handler that detects a structured failure must raise
:class:`ProtocolError`; the envelope maps that to its declared error code. Any
other exception is converted by the envelope to a fail-closed internal error.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from typing import Any

from .protocol import (
    ERROR_MESSAGES,
    HANDSHAKE_METHOD,
    METHOD_NOT_FOUND,
    PROTOCOL_VERSION,
    ProtocolError,
    iso8601_utc,
)

Handler = Callable[[Mapping[str, Any]], dict[str, Any]]
Clock = Callable[[], datetime]


def _default_clock() -> datetime:
    """Return the current timezone-aware UTC instant."""
    return datetime.now(timezone.utc)


class Dispatcher:
    """Routes validated ``nuclear.*`` methods to registered handlers.

    The instance is stateless across records: it holds only the method registry
    and an injectable clock, so a restarted worker needs no cleanup.
    """

    def __init__(self, now: Clock | None = None) -> None:
        """Create a dispatcher and register the handshake operation.

        Args:
            now: Clock returning the current instant. Tests inject a frozen
                callable; defaults to ``datetime.now(timezone.utc)``.
        """
        self._now: Clock = now if now is not None else _default_clock
        self._handlers: dict[str, Handler] = {}
        self.register(HANDSHAKE_METHOD, self._handshake)

    def register(self, method: str, handler: Handler) -> None:
        """Register ``method`` to ``handler``, replacing any existing entry."""
        self._handlers[method] = handler

    @property
    def supported_methods(self) -> list[str]:
        """Sorted names of the operations this worker actually implements."""
        return sorted(self._handlers)

    def invoke(self, method: str, params: Mapping[str, Any]) -> dict[str, Any]:
        """Invoke a registered method.

        Args:
            method: Fully qualified ``nuclear.<operation>`` method name.
            params: Validated request parameters mapping.

        Returns:
            The handler result.

        Raises:
            ProtocolError: With code ``-32601`` when ``method`` is unknown.
        """
        handler = self._handlers.get(method)
        if handler is None:
            raise ProtocolError(
                METHOD_NOT_FOUND,
                ERROR_MESSAGES[METHOD_NOT_FOUND],
                {
                    "requestedMethod": method,
                    "supportedMethods": self.supported_methods,
                    "diagnostic": f"Method '{method}' is not registered by this worker.",
                },
            )
        return handler(params)

    def _handshake(self, params: Mapping[str, Any]) -> dict[str, Any]:
        """Return protocol versions, implemented operations and provenance."""
        import worker

        return {
            "protocolVersions": [PROTOCOL_VERSION],
            "operations": self.supported_methods,
            "workerMetadata": {
                "workerVersion": worker.__version__,
                "operation": HANDSHAKE_METHOD,
                "timestamp": iso8601_utc(self._now()),
                "parameters": {},
            },
        }
