"""Source-locator resolution and metadata-only DICOM reading.

Resolves a validated :class:`~dicom.locators.SourceLocator` (``local-folder``,
``local-file-list`` or ``archive-entry``) and reads DICOM metadata only
(``pydicom.dcmread(..., stop_before_pixels=True)``).

The reader is injectable and generic over the record type: P2.2 passes the
classification instance reader, while geometry/compatibility pass their own
metadata mapper. Malformed locators raise ``INVALID_PARAMS`` (-32602);
unreadable sources raise ``SOURCE_UNAVAILABLE`` (-32010) with a basename-only
diagnostic; non-DICOM/unparseable files are skipped, counted and reported as
warnings and never abort the scan.
"""

from __future__ import annotations

import zipfile
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Generic, TypeVar, cast

import pydicom
from pydicom.dataset import Dataset

from .locators import SourceLocator, source_unavailable_error
from .metadata import DIAGNOSTIC_SKIPPED_FILE, Diagnostic, instance_from_dataset

T = TypeVar("T")
Reader = Callable[[Dataset, str], T]


@dataclass
class Loaded(Generic[T]):
    """Records and diagnostics read from one source."""

    instances: list[T] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)
    skipped: int = 0
    scanned: int = 0


def _skipped(file_name: str) -> Diagnostic:
    return Diagnostic(
        code=DIAGNOSTIC_SKIPPED_FILE,
        severity="warning",
        message="File is not a readable DICOM instance.",
        file=file_name,
    )


def _read(stream: Any, file_name: str, reader: Reader[T]) -> T:
    return reader(pydicom.dcmread(stream, stop_before_pixels=True), file_name)


def _load(paths: list[Path], reader: Reader[T]) -> Loaded[T]:
    loaded: Loaded[T] = Loaded(scanned=len(paths))
    for path in paths:
        try:
            instance = _read(str(path), path.name, reader)
        except Exception:  # noqa: BLE001 - skip and record, never abort
            loaded.diagnostics.append(_skipped(path.name))
            loaded.skipped += 1
        else:
            loaded.instances.append(instance)
    return loaded


def _folder(locator: SourceLocator, reader: Reader[T]) -> Loaded[T]:
    root = Path(locator.path)
    if not root.is_dir():
        raise source_unavailable_error(
            locator.kind,
            f"Local folder source '{root.name}' is not a readable directory.",
            root.name,
        )
    try:
        paths = sorted(path for path in root.rglob("*") if path.is_file())
    except OSError as exc:  # pragma: no cover - platform-dependent I/O failure
        raise source_unavailable_error(
            locator.kind, f"Local folder source '{root.name}' could not be read.", root.name
        ) from exc
    return _load(paths, reader)


def _file_list(locator: SourceLocator, reader: Reader[T]) -> Loaded[T]:
    base = Path(locator.base_path) if locator.base_path else None
    paths: list[Path] = []
    for entry in locator.files:
        candidate = Path(entry)
        if base is not None and not candidate.is_absolute():
            candidate = base / candidate
        if not candidate.is_file():
            raise source_unavailable_error(
                locator.kind,
                f"Listed source file '{candidate.name}' cannot be read.",
                candidate.name,
            )
        paths.append(candidate)
    return _load(sorted(paths), reader)


def _archive(locator: SourceLocator, reader: Reader[T]) -> Loaded[T]:
    archive = Path(locator.archive_path)
    if not archive.is_file():
        raise source_unavailable_error(
            locator.kind, f"Archive source '{archive.name}' cannot be read.", archive.name
        )
    loaded: Loaded[T] = Loaded()
    try:
        with zipfile.ZipFile(archive) as bundle:
            names = sorted(name for name in bundle.namelist() if not name.endswith("/"))
            if locator.inner_entry_prefix:
                names = [name for name in names if name.startswith(locator.inner_entry_prefix)]
            loaded.scanned = len(names)
            for name in names:
                try:
                    with bundle.open(name) as handle:
                        instance = _read(handle, Path(name).name, reader)
                except Exception:  # noqa: BLE001 - skip and record, never abort
                    loaded.diagnostics.append(_skipped(Path(name).name))
                    loaded.skipped += 1
                else:
                    loaded.instances.append(instance)
    except (zipfile.BadZipFile, OSError) as exc:
        raise source_unavailable_error(
            locator.kind,
            f"Archive source '{archive.name}' is not a readable ZIP archive.",
            archive.name,
        ) from exc
    return loaded


def load_source(locator: SourceLocator, reader: Reader[T] | None = None) -> Loaded[T]:
    """Read DICOM metadata for a validated locator.

    Args:
        locator: A validated shared-types locator.
        reader: Optional ``(dataset, basename) -> record`` mapper. Defaults to
            the P2.2 classification instance reader.

    Returns:
        Parsed records plus skip diagnostics and counters.

    Raises:
        ProtocolError: ``SOURCE_UNAVAILABLE`` (-32010) when the source cannot
            be resolved or read.
    """
    resolved = reader if reader is not None else cast(Reader[T], instance_from_dataset)
    if locator.kind == "local-folder":
        return _folder(locator, resolved)
    if locator.kind == "local-file-list":
        return _file_list(locator, resolved)
    return _archive(locator, resolved)
