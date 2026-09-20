"""NuClear Scientific Worker — JSON-RPC 2.0 Daemon & Bridge.

This package implements the local stdio JSON-RPC 2.0 daemon communicating
with the Node.js/Electron ScientificWorkerBridge in @nuclear/medical-engine.

Protocol:
    Newline-delimited JSON-RPC 2.0 over standard I/O (stdin/stdout).
    All errors fail closed with deterministic error codes and diagnostics.

The worker is stateless across records and safely restartable with no cleanup;
the TypeScript bridge owns restart, backoff, timeout and correlation.
"""

from __future__ import annotations

from .dispatch import Dispatcher
from .envelope import process_record
from .protocol import (
    METHOD_PREFIX,
    NUCLEAR_PROTOCOL,
    PROTOCOL_VERSION,
    ProtocolError,
)

__version__ = "0.1.0"

__all__ = [
    "METHOD_PREFIX",
    "NUCLEAR_PROTOCOL",
    "PROTOCOL_VERSION",
    "Dispatcher",
    "ProtocolError",
    "__version__",
    "process_record",
]
