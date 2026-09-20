"""NuClear Scientific Worker — JSON-RPC 2.0 Daemon & Bridge.

This package implements the local stdio JSON-RPC 2.0 daemon communicating
with the Node.js/Electron ScientificWorkerBridge in @nuclear/medical-engine.

Protocol:
    Newline-delimited JSON-RPC 2.0 over standard I/O (stdin/stdout).
    All errors fail closed with deterministic error codes and diagnostics.
"""

__version__ = "0.1.0"
