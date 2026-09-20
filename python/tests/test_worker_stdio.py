"""P2.1 evidence for the stdio supervisor contract.

These tests spawn real ``python -m worker`` processes, exchange newline
delimited records, and prove that malformed input is answered without killing
the process, that every stdout line is JSON, and that a killed worker restarts
with no cleanup.
"""

from __future__ import annotations

import io
import json
import queue
import subprocess
import sys
import threading
from collections.abc import Iterator, Mapping
from pathlib import Path
from typing import Any, cast

import pytest

from worker.dispatch import Dispatcher
from worker.protocol import INTERNAL_ERROR, PROTOCOL_VERSION
from worker.stdio import serve

TIMEOUT_SECONDS = 20.0
PROTOCOL_DIR = "tests/fixtures/protocol"
HANDSHAKE_REQUEST = "request.handshake.json"
MALFORMED_RECORD = "malformed.request.txt"
HANDSHAKE_METHOD = "nuclear.protocol.handshake"


class WorkerProcess:
    """Line-oriented harness around a live ``python -m worker`` process."""

    def __init__(self, repo_root: Path) -> None:
        self._process: subprocess.Popen[str] = subprocess.Popen(
            [sys.executable, "-m", "worker"],
            cwd=str(repo_root),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        self._lines: queue.Queue[str | None] = queue.Queue()
        self._reader = threading.Thread(target=self._pump, daemon=True)
        self._reader.start()

    def _pump(self) -> None:
        stdout = self._process.stdout
        if stdout is None:
            self._lines.put(None)
            return
        for line in stdout:
            self._lines.put(line)
        self._lines.put(None)

    @property
    def alive(self) -> bool:
        return self._process.poll() is None

    def send_line(self, line: str) -> None:
        stdin = self._process.stdin
        assert stdin is not None
        stdin.write(line + "\n")
        stdin.flush()

    def read_line(self, timeout: float = TIMEOUT_SECONDS) -> str:
        try:
            item = self._lines.get(timeout=timeout)
        except queue.Empty as exc:  # pragma: no cover - timeout diagnostic
            raise AssertionError("worker did not answer before timeout") from exc
        assert item is not None, "worker closed stdout without answering"
        return item

    def parse_next(self, timeout: float = TIMEOUT_SECONDS) -> dict[str, Any]:
        parsed = json.loads(self.read_line(timeout))
        assert isinstance(parsed, dict)
        return parsed

    def close_stdin(self) -> None:
        stdin = self._process.stdin
        if stdin is not None and not stdin.closed:
            stdin.close()

    def wait(self, timeout: float = TIMEOUT_SECONDS) -> int:
        return self._process.wait(timeout=timeout)

    def kill(self) -> None:
        if self._process.poll() is None:
            self._process.kill()
        self._process.wait(timeout=5)

    def close(self) -> None:
        self.close_stdin()
        try:
            self._process.wait(timeout=5)
        except subprocess.TimeoutExpired:  # pragma: no cover - teardown safety
            self._process.kill()
            self._process.wait(timeout=5)


@pytest.fixture
def worker_process(repo_root: Path) -> Iterator[WorkerProcess]:
    process = WorkerProcess(repo_root)
    try:
        yield process
    finally:
        process.close()


def _request_line(repo_root: Path, name: str) -> str:
    record = json.loads((repo_root / PROTOCOL_DIR / name).read_text(encoding="utf-8"))
    assert isinstance(record, dict)
    return json.dumps(record)


def test_handshake_returns_one_json_response(worker_process: WorkerProcess, repo_root: Path) -> None:
    worker_process.send_line(_request_line(repo_root, HANDSHAKE_REQUEST))
    response = worker_process.parse_next()
    assert response["id"] == "req-0001"
    assert response["result"]["workerMetadata"]["operation"] == HANDSHAKE_METHOD
    assert worker_process.alive


def test_blank_lines_are_skipped(worker_process: WorkerProcess, repo_root: Path) -> None:
    worker_process.send_line("")
    worker_process.send_line("   ")
    worker_process.send_line(_request_line(repo_root, HANDSHAKE_REQUEST))
    response = worker_process.parse_next()
    assert response["id"] == "req-0001"
    assert "result" in response


def test_malformed_record_is_answered_and_process_survives(
    worker_process: WorkerProcess, repo_root: Path
) -> None:
    malformed = (repo_root / PROTOCOL_DIR / MALFORMED_RECORD).read_text(encoding="utf-8").strip()
    worker_process.send_line(_request_line(repo_root, HANDSHAKE_REQUEST))
    assert "result" in worker_process.parse_next()

    worker_process.send_line(malformed)
    error = worker_process.parse_next()
    assert error["id"] is None
    assert error["error"]["code"] == -32700
    assert error["error"]["data"]["diagnostic"]
    assert worker_process.alive

    worker_process.send_line(_request_line(repo_root, HANDSHAKE_REQUEST))
    assert "result" in worker_process.parse_next()


def test_all_stdout_lines_are_json(worker_process: WorkerProcess, repo_root: Path) -> None:
    malformed = (repo_root / PROTOCOL_DIR / MALFORMED_RECORD).read_text(encoding="utf-8").strip()
    worker_process.send_line(_request_line(repo_root, HANDSHAKE_REQUEST))
    worker_process.send_line(malformed)
    for _ in range(2):
        parsed = json.loads(worker_process.read_line())
        assert isinstance(parsed, dict)


def test_stdin_eof_exits_zero(worker_process: WorkerProcess, repo_root: Path) -> None:
    worker_process.send_line(_request_line(repo_root, HANDSHAKE_REQUEST))
    assert "result" in worker_process.parse_next()
    worker_process.close_stdin()
    assert worker_process.wait() == 0


def test_killed_worker_restarts_without_cleanup(repo_root: Path) -> None:
    first = WorkerProcess(repo_root)
    second = WorkerProcess(repo_root)
    try:
        first.send_line(_request_line(repo_root, HANDSHAKE_REQUEST))
        assert "result" in first.parse_next()
        first.kill()
        assert not first.alive

        second.send_line(_request_line(repo_root, HANDSHAKE_REQUEST))
        response = second.parse_next()
        assert response["id"] == "req-0001"
        assert response["result"]["workerMetadata"]["operation"] == HANDSHAKE_METHOD
        assert second.alive
    finally:
        first.close()
        second.close()


def _unserializable_handler(params: Mapping[str, Any]) -> dict[str, Any]:
    """Return a set on purpose so JSON serialization must fail closed."""
    return cast(dict[str, Any], {1, 2, 3})


def test_non_serializable_result_is_answered_fail_closed() -> None:
    dispatcher = Dispatcher()
    dispatcher.register("nuclear.test.unserializable", _unserializable_handler)
    request = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": "req-unserializable",
            "protocolVersion": PROTOCOL_VERSION,
            "method": "nuclear.test.unserializable",
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
    assert response["id"] == "req-unserializable"
    assert response["protocolVersion"] == PROTOCOL_VERSION
    assert "result" not in response
    assert response["error"]["code"] == INTERNAL_ERROR
    assert response["error"]["data"]["diagnostic"]
    assert stderr.getvalue(), "the root-cause traceback must reach stderr"
