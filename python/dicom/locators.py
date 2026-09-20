"""Shared-types ``SourceLocator`` validation and structured source errors.

Owns the validated :class:`SourceLocator` shape and the two fail-closed error
constructors used by source resolution: ``INVALID_PARAMS`` (-32602) for a
malformed locator and ``SOURCE_UNAVAILABLE`` (-32010) for an unresolvable or
unreadable source. No file access happens here.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, NamedTuple

from worker.protocol import (
    ERROR_MESSAGES,
    INVALID_PARAMS,
    SOURCE_UNAVAILABLE,
    ProtocolError,
)

SUPPORTED_LOCATOR_KINDS = ("local-folder", "local-file-list", "archive-entry")


class SourceLocator(NamedTuple):
    """A validated shared-types locator; exactly the fields of its ``kind``."""

    kind: str
    path: str = ""
    files: tuple[str, ...] = ()
    base_path: str = ""
    archive_path: str = ""
    inner_entry_prefix: str = ""


def invalid_locator_error(
    violations: list[str], method: str = "nuclear.dicom.inspect"
) -> ProtocolError:
    """Build the ``-32602`` error for a malformed locator."""
    return ProtocolError(
        INVALID_PARAMS,
        ERROR_MESSAGES[INVALID_PARAMS],
        {"diagnostic": f"Invalid locator for {method}.", "violations": violations},
    )


def source_unavailable_error(kind: str, detail: str, name: str) -> ProtocolError:
    """Build the ``-32010`` error for an unresolvable or unreadable source."""
    return ProtocolError(
        SOURCE_UNAVAILABLE,
        ERROR_MESSAGES[SOURCE_UNAVAILABLE],
        {"diagnostic": detail, "sourceKind": kind, "sourceName": name},
    )


def parse_locator(
    params: Mapping[str, Any], *, method: str = "nuclear.dicom.inspect"
) -> SourceLocator:
    """Validate and parse the ``params.locator`` shared-types shape.

    Args:
        params: Request parameters mapping containing ``locator``.
        method: Operation name used in the diagnostic message.

    Returns:
        The parsed locator.

    Raises:
        ProtocolError: ``INVALID_PARAMS`` (-32602) with a ``violations`` list.
    """
    locator = params.get("locator")
    if not isinstance(locator, Mapping):
        raise invalid_locator_error(["params.locator must be an object."], method)
    kind = locator.get("kind")
    if not isinstance(kind, str) or not kind:
        raise invalid_locator_error(["params.locator.kind must be a non-empty string."], method)
    if kind not in SUPPORTED_LOCATOR_KINDS:
        raise invalid_locator_error([f"Unsupported locator kind '{kind}'."], method)
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
        raise invalid_locator_error(violations, method)
    return SourceLocator(
        kind=kind,
        path=path if isinstance(path, str) else "",
        files=tuple(files) if isinstance(files, list) else (),
        base_path=base_path if isinstance(base_path, str) else "",
        archive_path=archive_path if isinstance(archive_path, str) else "",
        inner_entry_prefix=prefix if isinstance(prefix, str) else "",
    )
