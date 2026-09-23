"""Platform-neutral session-lock, sweep and store lifecycle (ADR-013 §§2/7).

Exercises the POSIX and mocked Windows backends, the startup sweep
race/cleanup contract and the default-store lifecycle in ``volume_session``.
"""

from __future__ import annotations

import atexit
import errno
import os
import shutil
from collections.abc import Callable
from pathlib import Path

import pytest

from dicom.volume_store import SESSION_LOCK_NAME, VolumeStore
from worker import volume_session
from worker.session_lock import (
    _WindowsLockBackend,
    SessionLockUnavailable,
    acquire_session_lock,
    session_lock_available,
)


class _FakeMsvcrt:
    """Minimal ``msvcrt`` surface: byte-range lock calls record their offset."""

    LK_NBLCK = 0x01
    LK_UNLCK = 0x02

    def __init__(self) -> None:
        self.locked: list[tuple[int, int, int]] = []
        self.unlocked: list[tuple[int, int, int]] = []
        self.busy = False

    def locking(self, descriptor: int, mode: int, length: int) -> None:
        position = os.lseek(descriptor, 0, os.SEEK_CUR)
        if mode == self.LK_NBLCK:
            if self.busy:
                raise OSError(errno.EACCES, "lock violation")
            self.locked.append((descriptor, position, length))
        elif mode == self.LK_UNLCK:
            self.unlocked.append((descriptor, position, length))


def test_owner_lock_blocks_a_second_acquire_until_released(tmp_path: Path) -> None:
    lock_path = tmp_path / "session.lock"
    owner = acquire_session_lock(lock_path)
    assert lock_path.is_file() and not owner.released
    with pytest.raises(SessionLockUnavailable):
        acquire_session_lock(lock_path)
    owner.release()
    assert owner.released
    owner.release()  # idempotent
    second = acquire_session_lock(lock_path)
    second.release()


def test_acquire_failure_closes_its_descriptor(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    closed: list[int] = []
    real_close = os.close

    def close_spy(descriptor: int) -> None:
        closed.append(descriptor)
        real_close(descriptor)

    monkeypatch.setattr(os, "close", close_spy)

    class _RejectingBackend:
        def acquire(self, descriptor: int) -> None:
            raise OSError(errno.ENOLCK, "no locks available")

        def release(self, descriptor: int) -> None:
            raise AssertionError("release must not run after a failed acquire")

    with pytest.raises(OSError):
        acquire_session_lock(tmp_path / "x.lock", backend=_RejectingBackend())
    assert len(closed) == 1  # the opened descriptor is closed exactly once


def test_probe_reports_unavailable_while_held_and_available_after(tmp_path: Path) -> None:
    lock_path = tmp_path / "session.lock"
    assert session_lock_available(lock_path) is False  # absent lock is never touched
    owner = acquire_session_lock(lock_path)
    try:
        assert session_lock_available(lock_path) is False
    finally:
        owner.release()
    assert session_lock_available(lock_path) is True


def test_windows_backend_writes_lock_byte_and_seeks_to_zero(tmp_path: Path) -> None:
    module = _FakeMsvcrt()
    backend = _WindowsLockBackend(module)
    lock_path = tmp_path / "session.lock"
    lock = acquire_session_lock(lock_path, backend=backend)
    assert lock_path.read_bytes() == b"\x00"  # msvcrt cannot lock past end-of-file
    assert module.locked and module.locked[0][1:] == (0, 1)
    lock.release()
    assert module.unlocked and module.unlocked[0][1:] == (0, 1)


def test_windows_backend_maps_lock_violation_to_unavailable(tmp_path: Path) -> None:
    module = _FakeMsvcrt()
    module.busy = True
    backend = _WindowsLockBackend(module)
    lock_path = tmp_path / "session.lock"
    with pytest.raises(SessionLockUnavailable):
        acquire_session_lock(lock_path, backend=backend)
    assert lock_path.is_file() and lock_path.stat().st_size == 1


def _stale_root(parent: Path, name: str = "session-stale") -> Path:
    root = parent / name
    root.mkdir()
    (root / SESSION_LOCK_NAME).write_bytes(b"")
    os.utime(root, (0, 0))
    return root


def test_session_sweep_removes_stale_roots_but_not_live_siblings(tmp_path: Path) -> None:
    parent = tmp_path / "parent"
    parent.mkdir()
    stale = _stale_root(parent)
    live = parent / "session-live"
    lockless = parent / "session-lockless"
    other = parent / "not-nuclear"
    for path in (live, lockless, other):
        path.mkdir()
    live_lock = live / SESSION_LOCK_NAME
    live_lock.write_bytes(b"")
    os.utime(live, (0, 0))
    os.utime(lockless, (0, 0))
    os.utime(other, (0, 0))
    held = acquire_session_lock(live_lock)  # held for the live owner's lifetime
    try:
        swept = volume_session.sweep_stale_session_roots(parent)
    finally:
        held.release()
    assert swept == [stale] and not stale.exists()
    assert live.exists() and lockless.exists() and other.exists()


def test_sweep_ignores_missing_lock_within_grace_and_unprobeable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    parent = tmp_path / "parent"
    parent.mkdir()
    lockless = parent / "session-lockless"
    lockless.mkdir()
    os.utime(lockless, (0, 0))
    fresh = parent / "session-fresh"
    fresh.mkdir()
    (fresh / SESSION_LOCK_NAME).write_bytes(b"")  # within the grace window
    unprobeable = _stale_root(parent, "session-unprobeable")

    def _raise(*args: object, **kwargs: object) -> None:
        raise OSError("probe failed")

    monkeypatch.setattr(volume_session, "acquire_session_lock", _raise)
    assert volume_session.sweep_stale_session_roots(parent) == []
    assert lockless.exists() and fresh.exists() and unprobeable.exists()


def test_sweep_tolerates_root_removed_between_listing_and_stat(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    parent = tmp_path / "parent"
    parent.mkdir()
    raced = _stale_root(parent, "session-raced")

    def _vanish(child: Path) -> float:
        shutil.rmtree(child)  # a concurrent sibling sweep wins the race
        raise FileNotFoundError(str(child))

    monkeypatch.setattr(volume_session, "_session_root_mtime", _vanish)
    assert volume_session.sweep_stale_session_roots(parent) == []
    assert not raced.exists()


def test_sweep_tolerates_lock_removed_before_probe(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    parent = tmp_path / "parent"
    parent.mkdir()
    raced = _stale_root(parent, "session-lock-raced")

    def _vanish(path: Path, **kwargs: object) -> None:
        (raced / SESSION_LOCK_NAME).unlink()
        raise FileNotFoundError(str(path))

    monkeypatch.setattr(volume_session, "acquire_session_lock", _vanish)
    assert volume_session.sweep_stale_session_roots(parent) == []
    assert raced.exists()  # lockless now: fail-closed, left for inspection


def test_sweep_tolerates_subtree_removed_by_concurrent_sweeper(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    parent = tmp_path / "parent"
    parent.mkdir()
    raced = _stale_root(parent, "session-subtree-raced")
    subtree = raced / "payloads"
    subtree.mkdir()
    os.utime(raced, (0, 0))
    real_rmtree = shutil.rmtree

    def _vanish(path: str | os.PathLike[str], *args: object, **kwargs: object) -> None:
        real_rmtree(path)  # a concurrent sibling sweep removes it first
        raise FileNotFoundError(str(path))

    monkeypatch.setattr(shutil, "rmtree", _vanish)
    assert volume_session.sweep_stale_session_roots(parent) == [raced]
    assert not raced.exists()


def test_sweep_cleanup_failure_keeps_marker_and_a_later_sweep_retries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    parent = tmp_path / "parent"
    parent.mkdir()
    root = _stale_root(parent, "session-busy")
    payload = root / "payloads"
    payload.mkdir()
    (payload / "p.bin").write_bytes(b"x")
    os.utime(root, (0, 0))
    real_rmtree = shutil.rmtree

    def _fail(path: str | os.PathLike[str], *args: object, **kwargs: object) -> None:
        raise OSError("payload is busy")

    monkeypatch.setattr(shutil, "rmtree", _fail)
    # Fail-closed: not reported, and the lock marker must survive for a retry.
    assert volume_session.sweep_stale_session_roots(parent) == []
    assert root.exists() and (root / SESSION_LOCK_NAME).exists()
    assert payload.exists()

    monkeypatch.setattr(shutil, "rmtree", real_rmtree)
    assert volume_session.sweep_stale_session_roots(parent) == [root]
    assert not root.exists()


def test_remove_default_root_orders_reset_release_then_removal(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "root"
    store = VolumeStore(root)
    payload = root / "payload.bin"
    payload.write_bytes(b"data")
    held = acquire_session_lock(root / SESSION_LOCK_NAME)
    events: list[tuple[object, ...]] = []
    real_reset = store.reset

    def reset_spy() -> None:
        events.append(("reset", payload.exists()))
        real_reset()

    monkeypatch.setattr(store, "reset", reset_spy)
    monkeypatch.setattr(volume_session, "_DEFAULT_VOLUME_STORE", store)
    monkeypatch.setattr(volume_session, "_DEFAULT_VOLUME_STORE_LOCK", [held])
    real_rmtree = shutil.rmtree

    def rmtree_spy(path: str | os.PathLike[str], ignore_errors: bool = False) -> None:
        events.append(("remove", held.released, payload.exists()))
        real_rmtree(path, ignore_errors=ignore_errors)

    monkeypatch.setattr(shutil, "rmtree", rmtree_spy)
    volume_session._remove_default_root()
    assert events == [("reset", True), ("remove", True, False)]
    assert held.released and not root.exists()
    assert volume_session._DEFAULT_VOLUME_STORE is None


def test_default_volume_store_wires_private_root_lock_and_atexit_cleanup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    parent_dir = tmp_path / "parent"
    monkeypatch.setattr(volume_session, "_DEFAULT_VOLUME_STORE", None)
    monkeypatch.setattr(volume_session, "_DEFAULT_VOLUME_STORE_LOCK", [])
    monkeypatch.setattr(
        volume_session, "session_parent_root", lambda parent=None: parent_dir
    )
    registered: list[Callable[[], None]] = []
    monkeypatch.setattr(atexit, "register", registered.append)

    store = volume_session.default_volume_store()
    assert store.root.parent == parent_dir and store.root.name.startswith("session-")
    assert (store.root / SESSION_LOCK_NAME).is_file()
    assert len(volume_session._DEFAULT_VOLUME_STORE_LOCK) == 1
    assert volume_session._DEFAULT_VOLUME_STORE_LOCK[0].released is False
    assert registered == [volume_session._remove_default_root]

    registered[0]()  # run the registered atexit cleanup
    assert not store.root.exists()  # lock closed before root deletion
    assert volume_session._DEFAULT_VOLUME_STORE_LOCK == []
