"""Source-locator resolution and metadata-only DICOM reading.

Resolves a shared-types ``SourceLocator`` (``local-folder``,
``local-file-list`` or ``archive-entry``) and reads DICOM metadata only
(``pydicom.dcmread(..., stop_before_pixels=True)``).

Fail-closed rules: malformed locators raise ``INVALID_PARAMS`` (-32602) with
``violations``; unreadable sources raise ``SOURCE_UNAVAILABLE`` (-32010) with a
basename-only diagnostic; non-DICOM/unparseable files are skipped, counted and
reported as warnings and never abort the inspection.
"""

from __future__ import annotations

import zipfile
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, NamedTuple

import pydicom

from worker.protocol import (
    ERROR_MESSAGES,
    INVALID_PARAMS,
    SOURCE_UNAVAILABLE,
    ProtocolError,
)

from .metadata import (
    DIAGNOSTIC_SKIPPED_FILE,
    Diagnostic,
    InstanceMetadata,
    instance_from_dataset,
)


class SourceLocator(NamedTuple):
    """A validated shared-types locator; exactly the fields of its ``kind``."""

    kind: str
    path: str = ""
    files: tuple[str, ...] = ()
    base_path: str = ""
    archive_path: str = ""
    inner_entry_prefix: str = ""


@dataclass
class Loaded:
    """Instances and diagnostics read from one source."""

    instances: list[InstanceMetadata] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)
    skipped: int = 0
    scanned: int = 0


def _invalid_locator(violations: list[str]) -> ProtocolError:
    return ProtocolError(
        INVALID_PARAMS,
        ERROR_MESSAGES[INVALID_PARAMS],
        {"diagnostic": "Invalid locator for nuclear.dicom.inspect.", "violations": violations},
    )


def _unavailable(kind: str, detail: str, name: str) -> ProtocolError:
    return ProtocolError(
        SOURCE_UNAVAILABLE,
        ERROR_MESSAGES[SOURCE_UNAVAILABLE],
        {"diagnostic": detail, "sourceKind": kind, "sourceName": name},
    )


def parse_locator(params: Mapping[str, Any]) -> SourceLocator:
    """Validate and parse the ``params.locator`` shared-types shape.

    Args:
        params: Request parameters mapping.

    Returns:
        The parsed locator.

    Raises:
        ProtocolError: ``INVALID_PARAMS`` (-32602) with a ``violations`` list.
    """
    locator = params.get("locator")
    if not isinstance(locator, Mapping):
        raise _invalid_locator(["params.locator must be an object."])
    kind = locator.get("kind")
    if not isinstance(kind, str) or not kind:
        raise _invalid_locator(["params.locator.kind must be a non-empty string."])
    if kind not in ("local-folder", "local-file-list", "archive-entry"):
        raise _invalid_locator([f"Unsupported locator kind '{kind}'."])
    violations: list[str] = []
    path = locator.get("path")
    files = locator.get("files")
    base_path = locator.get("basePath")
    archive_path = locator.get("archivePath")
    prefix = locator.get("innerEntryPrefix")
    if kind == "local-folder" and (not isinstance(path, str) or not path):
        violations.append("params.locator.path must be a non-empty string.")
    if kind == "local-file-list":
        if not isinstance(files, list) or not files:
            violations.append("params.locator.files must be a non-empty array of paths.")
        elif any(not isinstance(item, str) or not item for item in files):
            violations.append("params.locator.files entries must be non-empty strings.")
        if base_path is not None and (not isinstance(base_path, str) or not base_path):
            violations.append("params.locator.basePath must be a non-empty string when present.")
    if kind == "archive-entry":
        if not isinstance(archive_path, str) or not archive_path:
            violations.append("params.locator.archivePath must be a non-empty string.")
        if prefix is not None and (not isinstance(prefix, str) or not prefix):
            violations.append(
                "params.locator.innerEntryPrefix must be a non-empty string when present."
            )
    if violations:
        raise _invalid_locator(violations)
    return SourceLocator(
        kind=kind,
        path=path if isinstance(path, str) else "",
        files=tuple(files) if isinstance(files, list) else (),
        base_path=base_path if isinstance(base_path, str) else "",
        archive_path=archive_path if isinstance(archive_path, str) else "",
        inner_entry_prefix=prefix if isinstance(prefix, str) else "",
    )


def _read(stream: Any, file_name: str) -> InstanceMetadata:
    return instance_from_dataset(pydicom.dcmread(stream, stop_before_pixels=True), file_name)


def _skip(loaded: Loaded, file_name: str) -> None:
    loaded.diagnostics.append(
        Diagnostic(
            code=DIAGNOSTIC_SKIPPED_FILE,
            severity="warning",
            message="File is not a readable DICOM instance.",
            file=file_name,
        )
    )
    loaded.skipped += 1


def _load(paths: list[Path]) -> Loaded:
    loaded = Loaded(scanned=len(paths))
    for path in paths:
        try:
            instance = _read(str(path), path.name)
        except Exception:  # noqa: BLE001 - skip and record, never abort
            _skip(loaded, path.name)
        else:
            loaded.instances.append(instance)
    return loaded


def _folder(locator: SourceLocator) -> Loaded:
    root = Path(locator.path)
    if not root.is_dir():
        raise _unavailable(
            locator.kind,
            f"Local folder source '{root.name}' is not a readable directory.",
            root.name,
        )
    try:
        paths = sorted(path for path in root.rglob("*") if path.is_file())
    except OSError as exc:  # pragma: no cover - platform-dependent I/O failure
        raise _unavailable(
            locator.kind, f"Local folder source '{root.name}' could not be read.", root.name
        ) from exc
    return _load(paths)


def _file_list(locator: SourceLocator) -> Loaded:
    base = Path(locator.base_path) if locator.base_path else None
    paths: list[Path] = []
    for entry in locator.files:
        candidate = Path(entry)
        if base is not None and not candidate.is_absolute():
            candidate = base / candidate
        if not candidate.is_file():
            raise _unavailable(
                locator.kind,
                f"Listed source file '{candidate.name}' cannot be read.",
                candidate.name,
            )
        paths.append(candidate)
    return _load(sorted(paths))


def _archive(locator: SourceLocator) -> Loaded:
    archive = Path(locator.archive_path)
    if not archive.is_file():
        raise _unavailable(
            locator.kind, f"Archive source '{archive.name}' cannot be read.", archive.name
        )
    loaded = Loaded()
    try:
        with zipfile.ZipFile(archive) as bundle:
            names = sorted(name for name in bundle.namelist() if not name.endswith("/"))
            if locator.inner_entry_prefix:
                names = [name for name in names if name.startswith(locator.inner_entry_prefix)]
            loaded.scanned = len(names)
            for name in names:
                try:
                    with bundle.open(name) as handle:
                        instance = _read(handle, Path(name).name)
                except Exception:  # noqa: BLE001 - skip and record, never abort
                    _skip(loaded, Path(name).name)
                else:
                    loaded.instances.append(instance)
    except (zipfile.BadZipFile, OSError) as exc:
        raise _unavailable(
            locator.kind,
            f"Archive source '{archive.name}' is not a readable ZIP archive.",
            archive.name,
        ) from exc
    return loaded


def load_source(locator: SourceLocator) -> Loaded:
    """Read DICOM metadata for a parsed locator.

    Args:
        locator: A validated shared-types locator.

    Returns:
        Parsed instances plus skip diagnostics and counters.

    Raises:
        ProtocolError: ``SOURCE_UNAVAILABLE`` (-32010) when the source cannot
            be resolved or read.
    """
    if locator.kind == "local-folder":
        return _folder(locator)
    if locator.kind == "local-file-list":
        return _file_list(locator)
    return _archive(locator)
