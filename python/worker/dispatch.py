"""Method registry and production composition for the NuClear worker.

:class:`Dispatcher` is a bare, stateless method registry. The single
production composition point is :func:`build_dispatcher`, which registers
every operation the worker actually implements. ``python -m worker`` and tests
that reproduce the ratified protocol fixtures both use it, so the handshake
operation list and the unknown-method ``supportedMethods`` list can never
drift from the handler set.

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
    DICOM_COMPATIBILITY_METHOD,
    DICOM_GEOMETRY_METHOD,
    DICOM_INSPECT_METHOD,
    DICOM_VOLUME_METHOD,
    ERROR_MESSAGES,
    HANDSHAKE_METHOD,
    METHOD_NOT_FOUND,
    PROTOCOL_VERSION,
    QUANTITATION_SUVBW_METHOD,
    REGISTRATION_METHOD,
    VOLUME_RELEASE_METHOD,
    ProtocolError,
    iso8601_utc,
)
from .volume_session import default_volume_store, sweep_stale_session_roots

Handler = Callable[[Mapping[str, Any]], dict[str, Any]]
Clock = Callable[[], datetime]
CapabilityProvider = Callable[[], dict[str, Any]]

__all__ = [
    "Dispatcher",
    "build_dispatcher",
    "default_volume_store",
    "sweep_stale_session_roots",
]


def _default_clock() -> datetime:
    """Return the current timezone-aware UTC instant."""
    return datetime.now(timezone.utc)


class Dispatcher:
    """Routes validated ``nuclear.*`` methods to registered handlers.

    The instance is a bare registry. Production code must obtain its dispatcher
    from :func:`build_dispatcher`; the instance is stateless across records
    (only the method registry, an injectable clock and optional handshake
    capabilities), so a restarted worker needs no cleanup.
    """

    def __init__(
        self,
        now: Clock | None = None,
        capabilities: CapabilityProvider | None = None,
    ) -> None:
        """Create an empty dispatcher.

        Args:
            now: Clock returning the current instant. Tests inject a frozen
                callable; defaults to ``datetime.now(timezone.utc)``.
            capabilities: Optional additive handshake capability provider.
        """
        self._now: Clock = now if now is not None else _default_clock
        self._capabilities = capabilities
        self._handlers: dict[str, Handler] = {}

    def register(self, method: str, handler: Handler) -> None:
        """Register ``method`` to ``handler``, replacing any existing entry."""
        self._handlers[method] = handler

    @property
    def clock(self) -> Clock:
        """The injectable clock used for provenance timestamps."""
        return self._now

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

        result: dict[str, Any] = {
            "protocolVersions": [PROTOCOL_VERSION],
            "operations": self.supported_methods,
            "workerMetadata": {
                "workerVersion": worker.__version__,
                "operation": HANDSHAKE_METHOD,
                "timestamp": iso8601_utc(self._now()),
                "parameters": {},
            },
        }
        if self._capabilities is not None:
            result["capabilities"] = self._capabilities()
        return result


def build_dispatcher(now: Clock | None = None, volume_store: Any = None) -> Dispatcher:
    """Compose the production worker by registering every operation.

    This is the single composition point shared by ``python -m worker`` and by
    tests that must reproduce the ratified protocol fixtures exactly. The
    handshake's ``operations`` list and the unknown-method error's
    ``supportedMethods`` list are derived from this registration, so they stay
    consistent automatically.

    Args:
        now: Optional clock injection for deterministic provenance timestamps.
        volume_store: Optional worker-owned payload store. Defaults to the
            memoized process store whose private temp root is advertised in the
            additive handshake ``capabilities.volumeTransport`` block.

    Returns:
        A dispatcher registering the handshake, every DICOM operation and the
        ADR-013 volume transport operations.
    """
    from dicom.geometry_operations import compatibility_operation, geometry_operation
    from dicom.quantitation_operations import suvbw_operation
    from dicom.registration_operations import registration_operation
    from dicom.scanner import inspect_source
    from dicom.volume_operations import volume_operation, volume_release_operation

    store = volume_store if volume_store is not None else default_volume_store()
    dispatcher = Dispatcher(
        now=now,
        capabilities=lambda: {"volumeTransport": store.capability()},
    )

    def inspect(params: Mapping[str, Any]) -> dict[str, Any]:
        return inspect_source(params, clock=dispatcher.clock)

    def geometry(params: Mapping[str, Any]) -> dict[str, Any]:
        return geometry_operation(params, clock=dispatcher.clock)

    def compatibility(params: Mapping[str, Any]) -> dict[str, Any]:
        return compatibility_operation(params, clock=dispatcher.clock)

    def quantitation(params: Mapping[str, Any]) -> dict[str, Any]:
        return suvbw_operation(params, clock=dispatcher.clock)

    def registration(params: Mapping[str, Any]) -> dict[str, Any]:
        return registration_operation(params, clock=dispatcher.clock)

    def volume(params: Mapping[str, Any]) -> dict[str, Any]:
        return volume_operation(params, clock=dispatcher.clock, store=store)

    def volume_release(params: Mapping[str, Any]) -> dict[str, Any]:
        return volume_release_operation(params, clock=dispatcher.clock, store=store)

    dispatcher.register(HANDSHAKE_METHOD, dispatcher._handshake)
    dispatcher.register(DICOM_INSPECT_METHOD, inspect)
    dispatcher.register(DICOM_GEOMETRY_METHOD, geometry)
    dispatcher.register(DICOM_COMPATIBILITY_METHOD, compatibility)
    dispatcher.register(QUANTITATION_SUVBW_METHOD, quantitation)
    dispatcher.register(REGISTRATION_METHOD, registration)
    dispatcher.register(DICOM_VOLUME_METHOD, volume)
    dispatcher.register(VOLUME_RELEASE_METHOD, volume_release)
    return dispatcher
