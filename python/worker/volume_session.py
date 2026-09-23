"""Worker session-root and default volume-store lifecycle (ADR-013 §§2/7).

The worker owns a private sibling root per session. Startup sweeps stale
siblings whose lock is **provably obtainable** (the previous owner exited) and
never a live or unprobeable one; the owner lock is held for the whole worker
lifetime. This module moves that lifecycle out of :mod:`worker.dispatch` so the
method-registry composition stays below Rule 02's decomposition trigger.

This module never decodes DICOM and contains no scientific formula.
Authority: ADR-013 §2/§7.

Robustness contract (startup race, C1): every per-child filesystem step
(``is_dir`` / ``stat`` / lock probe / removal) tolerates a concurrent sibling
sweep that removes the entry first, skipping that entry rather than aborting
worker startup.

Cleanup contract (Windows partial orphan, C2): an orphan lock is acquired and
**held while non-lock entries are removed**. On any cleanup failure the lock
marker is left intact and the root is left for a later retry; the marker is
released/deleted only after the non-lock contents are gone, and a root is
reported as swept only when the root directory is actually gone. If empty-root
deletion fails *after* the marker was removed, a valid marker and the root's
stale mtime are restored so a later sweep can retry. A live owner can never be
swept.
"""

from __future__ import annotations

import atexit
import os
import secrets
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

from .session_lock import SessionLock, SessionLockUnavailable, acquire_session_lock

#: Worker-owned session parent directory name.
SESSION_PARENT_DIR_NAME = "nuclear-volume-transport"
#: Child session-root name prefix (only these are sweep candidates).
SESSION_ROOT_PREFIX = "session-"
#: A root younger than this is skipped so a just-starting owner is not raced.
STALE_SESSION_GRACE_SECONDS = 5

_DEFAULT_VOLUME_STORE: Any = None
_DEFAULT_VOLUME_STORE_LOCK: list[SessionLock] = []


def session_parent_root(parent: Path | None = None) -> Path:
    """Return the worker-owned session parent (or an injected test parent)."""
    if parent is not None:
        return parent
    return Path(tempfile.gettempdir()) / SESSION_PARENT_DIR_NAME


def ensure_private_dir(path: Path) -> None:
    """Create an owner-only directory at ``path`` if needed."""
    path.mkdir(parents=True, exist_ok=True)
    os.chmod(path, 0o700)


def _session_root_mtime(child: Path) -> float:
    """Return the root mtime; raises ``OSError`` if a sibling sweep removed it."""
    return child.stat().st_mtime


def _acquire_orphan(child: Path, lock_name: str) -> SessionLock | None:
    """Acquire ``child``'s lock when the owner is gone; ``None`` to skip it.

    ``None`` is returned for a missing marker, a live owner (contention) and any
    probe failure: each case fails closed and leaves the root untouched.
    """
    lock_path = child / lock_name
    try:
        if not lock_path.is_file():
            return None
        return acquire_session_lock(lock_path, create=False)
    except SessionLockUnavailable:
        return None
    except OSError:
        return None


def _remove_non_lock_entries(child: Path, lock_name: str) -> bool:
    """Remove every entry under ``child`` except the lock marker; ``True`` if all gone.

    A concurrent sweep that already removed an entry is tolerated
    (``FileNotFoundError`` is success for that entry). Any other failure returns
    ``False`` so the caller leaves the lock marker and root for a later retry.
    """
    try:
        entries = sorted(child.iterdir())
    except FileNotFoundError:
        return True
    except OSError:
        return False
    for entry in entries:
        if entry.name == lock_name:
            continue
        try:
            if entry.is_dir() and not entry.is_symlink():
                shutil.rmtree(entry)
            else:
                entry.unlink()
        except FileNotFoundError:
            continue  # concurrent sibling sweep already removed it
        except OSError:
            return False
    return True


def _restore_lock_marker(
    child: Path, lock_name: str, stale_mtime: float | None
) -> bool:
    """Recreate the lock marker after a failed root removal; ``False`` if gone.

    Recreating the marker bumps the directory mtime, so the original stale mtime
    is restored too; otherwise the grace window would defer the retry even
    though the root is still a confirmed orphan. A root that vanished meanwhile
    is genuinely gone (``False``); an already-recreated marker is tolerated.
    """
    lock_path = child / lock_name
    try:
        descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        pass  # a concurrent sweep already restored the marker
    except FileNotFoundError:
        return False  # the root vanished: it is genuinely gone
    else:
        os.close(descriptor)
    if stale_mtime is not None:
        try:
            os.utime(child, (stale_mtime, stale_mtime))
        except OSError:
            pass  # marker is valid; the grace window only defers the retry
    return True


def _remove_orphan_root(child: Path, lock_name: str, held: SessionLock) -> bool:
    """Remove an orphan root while holding ``held``; ``True`` only if it is gone.

    The lock marker is deleted only after every non-lock entry is removed, and
    the descriptor is closed before deletion (required on Windows). When root
    deletion fails after the marker was removed, a valid marker (and the stale
    root mtime) is restored so a later sweep can retry; such a root is never
    reported as swept.
    """
    lock_path = child / lock_name
    try:
        stale_mtime: float | None = child.stat().st_mtime
    except OSError:
        stale_mtime = None
    try:
        if not _remove_non_lock_entries(child, lock_name):
            return False
        held.release()  # close the handle before deleting the marker (Windows)
        try:
            lock_path.unlink()
        except FileNotFoundError:
            pass
        try:
            child.rmdir()
        except FileNotFoundError:
            pass
        except OSError:
            # The marker was already removed: restore it so a later sweep retries.
            _restore_lock_marker(child, lock_name, stale_mtime)
            return not child.exists()
        return not child.exists()
    finally:
        held.release()  # idempotent; guarantees the descriptor is closed


def sweep_stale_session_roots(parent: Path) -> list[Path]:
    """Remove stale NuClear session roots whose owner is confirmed gone.

    Only a root whose lock is **provably obtainable** is removed; that proves the
    previous owner exited. Locked siblings, roots without a valid lock, roots
    younger than the grace window, and roots whose lock could not be probed are
    left untouched. A concurrent sibling sweep that removes an entry mid-loop is
    tolerated and skipped. A root is reported only once it is actually gone.
    """
    from dicom.volume_store import SESSION_LOCK_NAME

    swept: list[Path] = []
    now = time.time()
    try:
        children = sorted(parent.iterdir())
    except OSError:
        return swept  # parent vanished (or is unlistable): nothing to sweep
    for child in children:
        try:
            if not child.is_dir() or not child.name.startswith(SESSION_ROOT_PREFIX):
                continue
            age = now - _session_root_mtime(child)
        except OSError:
            continue  # concurrent sibling sweep removed it between listing and stat
        if age < STALE_SESSION_GRACE_SECONDS:
            continue
        held = _acquire_orphan(child, SESSION_LOCK_NAME)
        if held is None:
            continue
        try:
            if _remove_orphan_root(child, SESSION_LOCK_NAME, held):
                swept.append(child)
        except OSError:
            continue  # fail closed: leave root + marker intact for a later retry
    return swept


def _open_default_volume_store() -> Any:
    """Create and lock a fresh per-session store after sweeping stale siblings."""
    from dicom.volume_store import SESSION_LOCK_NAME, VolumeStore

    parent = session_parent_root()
    ensure_private_dir(parent)
    sweep_stale_session_roots(parent)
    root = parent / f"{SESSION_ROOT_PREFIX}{os.getpid()}-{secrets.token_hex(8)}"
    ensure_private_dir(root)
    store = VolumeStore(root)
    try:
        held = acquire_session_lock(root / SESSION_LOCK_NAME)
    except BaseException:
        shutil.rmtree(root, ignore_errors=True)
        raise
    _DEFAULT_VOLUME_STORE_LOCK.append(held)
    atexit.register(_remove_default_root)
    return store


def default_volume_store() -> Any:
    """Return the memoized per-session store, creating and locking it on first use.

    A fresh uniquely-named child root avoids collisions with other workers, and
    the startup sweep removes stale sibling roots whose owning process is gone;
    the held session lock keeps a live sibling's payloads safe from that sweep.
    """
    global _DEFAULT_VOLUME_STORE
    if _DEFAULT_VOLUME_STORE is None:
        _DEFAULT_VOLUME_STORE = _open_default_volume_store()
    return _DEFAULT_VOLUME_STORE


def _remove_default_root() -> None:
    """atexit cleanup: reset payloads, release the lock, then remove the root.

    The order is mandatory: on Windows the lock handle must be closed before the
    root directory (and its marker) can be deleted. Release and removal still run
    even if payload reset fails, so the process never leaks the lock descriptor.
    """
    global _DEFAULT_VOLUME_STORE
    store = _DEFAULT_VOLUME_STORE
    locks = list(_DEFAULT_VOLUME_STORE_LOCK)
    if store is None and not locks:
        return
    try:
        if store is not None:
            store.reset()
    finally:
        for held in locks:
            held.release()
        if store is not None:
            shutil.rmtree(store.root, ignore_errors=True)
        _DEFAULT_VOLUME_STORE_LOCK.clear()
        _DEFAULT_VOLUME_STORE = None
