"""``python -m worker`` entry point for the NuClear scientific worker.

The process speaks newline-delimited JSON-RPC 2.0 over stdio. It is stateless
across records and safely restartable with no cleanup; the TypeScript bridge
owns restart, backoff, timeout and correlation.
"""

from __future__ import annotations

from .stdio import main

if __name__ == "__main__":
    raise SystemExit(main())
