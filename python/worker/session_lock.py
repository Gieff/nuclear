"""Cross-platform worker session lock (ADR-013 §§2/7).

The worker owns a private session root and holds a **non-blocking exclusive**
lock on ``<root>/.nuclear-session.lock`` for its whole lifetime; a startup sweep
removes only sibling session roots whose lock is provably obtainable, because
that proves the previous owner exited.

The strict semantics are identical on every supported platform:

- taking the lock never blocks and never silently degrades — contention raises
  :class:`SessionLockUnavailable`, and any other failure propagates fail-closed;
- the sweep never removes a root whose lock is held, missing, or could not be
  probed: a probe error leaves the root untouched;
- POSIX uses :mod:`fcntl`; Windows uses :mod:`msvcrt` and guarantees the lock
  byte exists with a deterministic seek to byte 0 before every lock/unlock.

Only Python standard-library platform APIs are used. Authority: ADR-013 §2/§7.
"""

from __future__ import annotations

import errno
import importlib
import os
import sys
from pathlib import Path
from typing import Any, Protocol

#: Native contention errnos for a non-blocking lock (POSIX and Windows).
_CONTENTION_ERRNOS = frozenset(
    {errno.EACCES, errno.EAGAIN, errno.EWOULDBLOCK, getattr(errno, "EDEADLK", -1)}
)


class SessionLockError(OSError):
    """The session lock could not be taken or released (fail-closed)."""


class SessionLockUnavailable(SessionLockError):
    """A live owner holds the session lock (contention, not a failure)."""


class _LockBackend(Protocol):
    """Narrow platform primitive: non-blocking exclusive lock on ``descriptor``."""

    def acquire(self, descriptor: int) -> None:
        """Take the lock or raise :class:`SessionLockUnavailable` on contention."""
        ...

    def release(self, descriptor: int) -> None:
        """Release the lock; never called twice for the same descriptor."""
        ...


def _seek_to_zero(descriptor: int) -> None:
    """Seek ``descriptor`` to byte 0 (Windows locks are offset-relative)."""
    os.lseek(descriptor, 0, os.SEEK_SET)


def _is_contention(error: OSError) -> bool:
    """Return whether ``error`` means "the lock is already held"."""
    return error.errno in _CONTENTION_ERRNOS


class _PosixLockBackend:
    """``fcntl.flock`` backend (macOS/Linux)."""

    def __init__(self, fcntl_module: Any) -> None:
        """Bind the platform ``fcntl`` module (imported by the selector)."""
        self._fcntl = fcntl_module

    def acquire(self, descriptor: int) -> None:
        """Try ``LOCK_EX | LOCK_NB``; contention becomes ``SessionLockUnavailable``."""
        try:
            self._fcntl.flock(descriptor, self._fcntl.LOCK_EX | self._fcntl.LOCK_NB)
        except OSError as exc:
            if _is_contention(exc):
                raise SessionLockUnavailable(
                    "session lock is held by a live owner"
                ) from exc
            raise

    def release(self, descriptor: int) -> None:
        """Release the whole-file lock."""
        self._fcntl.flock(descriptor, self._fcntl.LOCK_UN)


class _WindowsLockBackend:
    """``msvcrt.locking`` backend (Windows).

    ``msvcrt.locking`` locks a byte range relative to the current offset and
    cannot lock past end-of-file, so the helper first guarantees at least one
    lock byte exists and always seeks to byte 0 before locking or unlocking.
    """

    def __init__(self, msvcrt_module: Any) -> None:
        """Bind the platform ``msvcrt`` module (imported by the selector)."""
        self._msvcrt = msvcrt_module

    def _ensure_lock_byte(self, descriptor: int) -> None:
        """Append a lock byte when the file is empty (a zero-byte lock is invalid)."""
        if os.fstat(descriptor).st_size == 0:
            os.write(descriptor, b"\x00")

    def acquire(self, descriptor: int) -> None:
        """Try ``LK_NBLCK`` on byte 0; contention becomes ``SessionLockUnavailable``."""
        self._ensure_lock_byte(descriptor)
        _seek_to_zero(descriptor)
        try:
            self._msvcrt.locking(descriptor, self._msvcrt.LK_NBLCK, 1)
        except OSError as exc:
            if _is_contention(exc):
                raise SessionLockUnavailable(
                    "session lock is held by a live owner"
                ) from exc
            raise

    def release(self, descriptor: int) -> None:
        """Unlock byte 0 from a consistent offset."""
        _seek_to_zero(descriptor)
        self._msvcrt.locking(descriptor, self._msvcrt.LK_UNLCK, 1)


def _select_backend() -> _LockBackend:
    """Select the backend for the running platform; never a silent fallback."""
    if sys.platform == "win32":
        return _WindowsLockBackend(importlib.import_module("msvcrt"))
    return _PosixLockBackend(importlib.import_module("fcntl"))


_DEFAULT_BACKEND: _LockBackend = _select_backend()


class SessionLock:
    """A held non-blocking exclusive lock on a session lock file."""

    def __init__(self, path: Path, descriptor: int, backend: _LockBackend) -> None:
        """Wrap an already-acquired ``descriptor`` for the given lock ``path``."""
        self._path = path
        self._descriptor: int | None = descriptor
        self._backend = backend

    @property
    def path(self) -> Path:
        """The lock file this handle owns."""
        return self._path

    @property
    def released(self) -> bool:
        """Whether :meth:`release` already ran (release is idempotent)."""
        return self._descriptor is None

    def release(self) -> None:
        """Release the lock then close the descriptor; idempotent and fail-closed."""
        descriptor = self._descriptor
        if descriptor is None:
            return
        self._descriptor = None
        try:
            self._backend.release(descriptor)
        finally:
            try:
                os.close(descriptor)
            except OSError:  # pragma: no cover - descriptor already closed
                pass


def acquire_session_lock(
    path: Path,
    *,
    create: bool = True,
    backend: _LockBackend | None = None,
) -> SessionLock:
    """Take a non-blocking exclusive session lock held until :meth:`release`.

    Args:
        path: Lock file inside the worker-owned private session root.
        create: Create the lock file when absent (owner path). ``False`` probes
            an existing root without creating anything.
        backend: Platform primitive override; defaults to the selected backend.

    Returns:
        The held :class:`SessionLock`.

    Raises:
        SessionLockUnavailable: A live owner holds the lock.
        OSError: The lock file could not be opened or the platform primitive
            failed for any reason other than contention (fail-closed).
    """
    active = backend if backend is not None else _DEFAULT_BACKEND
    flags = os.O_RDWR | (os.O_CREAT if create else 0)
    descriptor = os.open(path, flags, 0o600)
    try:
        active.acquire(descriptor)
    except BaseException:  # any failure (incl. cancellation) must not leak a descriptor
        try:
            os.close(descriptor)
        except OSError:  # pragma: no cover - descriptor already closed
            pass
        raise
    return SessionLock(path, descriptor, active)


def session_lock_available(path: Path, *, backend: _LockBackend | None = None) -> bool:
    """Whether the lock is provably obtainable (its owner has exited).

    ``False`` means a live owner holds the lock or the lock file is absent. Any
    other failure propagates so the caller fails closed instead of sweeping a
    root it cannot prove is orphaned.
    """
    if not path.is_file():
        return False
    try:
        probe = acquire_session_lock(path, create=False, backend=backend)
    except SessionLockUnavailable:
        return False
    probe.release()
    return True
