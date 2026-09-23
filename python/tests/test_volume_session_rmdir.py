"""Empty-root removal failure restores the retryable lock marker (ADR-013 §7).

Covers the partial-orphan edge where ``_remove_orphan_root`` removes the lock
marker before ``rmdir`` and empty-root deletion then fails: the root must not be
reported as swept, a valid marker must be restored (so a later sweep is not left
with a lockless root it intentionally ignores), and the next sweep must retry
and actually remove the root.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from dicom.volume_store import SESSION_LOCK_NAME
from worker import volume_session
from worker.session_lock import session_lock_available


def test_empty_root_rmdir_failure_restores_marker_and_next_sweep_retries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    parent = tmp_path / "parent"
    parent.mkdir()
    root = parent / "session-rmdir-fail"
    root.mkdir()
    marker = root / SESSION_LOCK_NAME
    marker.write_bytes(b"")
    os.utime(root, (0, 0))  # stale: outside the grace window

    real_rmdir = Path.rmdir

    def _fail_on_root(self: Path) -> None:
        if self == root:
            raise OSError("empty root is busy")
        real_rmdir(self)

    monkeypatch.setattr(Path, "rmdir", _fail_on_root)
    # Fail-closed: not reported as swept, and the marker survives for a retry.
    assert volume_session.sweep_stale_session_roots(parent) == []
    assert root.exists() and marker.is_file()
    assert session_lock_available(marker) is True  # a later sweep can probe/acquire

    monkeypatch.setattr(Path, "rmdir", real_rmdir)
    assert volume_session.sweep_stale_session_roots(parent) == [root]
    assert not root.exists()
