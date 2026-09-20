"""Newline-delimited stdio supervisor loop for the NuClear scientific worker.

Supervisor contract (P2.5 bridge ownership documented here):

- The worker is **stateless across records**. Each request is validated and
  handled independently; there is no session state and therefore nothing to
  clean up when a process is restarted.
- ``stdout`` is the protocol channel only: exactly one compact JSON-RPC
  response per non-empty request line, each followed by a single ``\\n`` and
  flushed immediately. Logs must never be written to ``stdout``.
- ``stderr`` carries every diagnostic, including handler tracebacks.
- A malformed or failing record is answered with a structured error and never
  terminates the process. EOF on ``stdin`` exits ``0``.
- Restart, backoff, timeout and request/response correlation are owned by the
  TypeScript ``ScientificWorkerBridge`` (P2.5), not by this module.
"""

from __future__ import annotations

import json
import sys
import traceback
from collections.abc import Iterable
from typing import Any, TextIO

from .dispatch import Dispatcher
from .envelope import process_record
from .protocol import ERROR_MESSAGES, INTERNAL_ERROR, error_response


def _serialize(response: dict[str, Any]) -> str:
    """Render a response as a single compact JSON line without its newline."""
    return json.dumps(response, separators=(",", ":"), ensure_ascii=False)


def _write_response(stdout: TextIO, response: dict[str, Any]) -> None:
    """Write exactly one compact JSON response line and flush it."""
    stdout.write(_serialize(response))
    stdout.write("\n")
    stdout.flush()


def _internal_error_response(
    request_id: str | int | None,
    record_index: int,
) -> dict[str, Any]:
    """Build the fail-closed internal-error envelope for a failed record."""
    return error_response(
        request_id,
        INTERNAL_ERROR,
        ERROR_MESSAGES[INTERNAL_ERROR],
        {"diagnostic": f"Record {record_index} could not be processed."},
    )


def serve(
    stdin: Iterable[str],
    stdout: TextIO,
    stderr: TextIO,
    dispatcher: Dispatcher,
) -> int:
    """Process newline-delimited requests until ``stdin`` is exhausted.

    Args:
        stdin: Iterable of raw text lines (``sys.stdin`` or a test double).
        stdout: Protocol channel; receives one compact JSON response per record.
        stderr: Diagnostic channel used only for unrecoverable record defects.
        dispatcher: Method registry used for every record.

    Returns:
        The process exit code, always ``0`` on normal end of input.
    """
    record_index = 0
    for raw_line in stdin:
        stripped = raw_line.strip()
        if not stripped:
            continue
        response: dict[str, Any] | None = None
        try:
            response = process_record(stripped, record_index, dispatcher)
            _write_response(stdout, response)
        except Exception:  # noqa: BLE001 - answer, survive, never kill the worker
            traceback.print_exc(file=stderr)
            request_id = None if response is None else response.get("id")
            _write_response(stdout, _internal_error_response(request_id, record_index))
        record_index += 1
    return 0


def main() -> int:
    """Run the stdio loop over the real process streams and return its code."""
    return serve(sys.stdin, sys.stdout, sys.stderr, Dispatcher())
