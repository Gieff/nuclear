"""P2.0 evidence that the Python runner and package metadata are real.

These tests fail when the virtual environment is absent or the package was
never installed; an unprovisioned runner must never be reported as PASS.
"""

from __future__ import annotations

import re
from importlib.metadata import metadata, version

import dicom
import worker

DISTRIBUTION = "nuclear-scientific"
_SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def test_worker_packages_import_and_expose_semver() -> None:
    assert _SEMVER.match(dicom.__version__), dicom.__version__
    assert _SEMVER.match(worker.__version__), worker.__version__


def test_installed_metadata_matches_package_versions() -> None:
    installed = version(DISTRIBUTION)
    assert installed == dicom.__version__
    assert installed == worker.__version__


def test_declared_readme_resolves_into_package_metadata() -> None:
    description = metadata(DISTRIBUTION).get("Description") or ""
    assert description.strip(), "The declared readme must resolve to a non-empty description"
    assert "NuClear Scientific Worker" in description


def test_runtime_scientific_dependencies_are_importable() -> None:
    import numpy
    import pydicom
    import SimpleITK

    assert pydicom.__version__
    assert numpy.__version__
    assert SimpleITK.Version_VersionString()  # type: ignore[no-untyped-call]
