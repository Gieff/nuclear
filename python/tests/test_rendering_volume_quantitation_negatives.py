"""Negative controls for the committed PT volume-fixture quantitation evidence.

The positive evidence lives in ``test_rendering_volume_fixtures.py``. Here a
committed co-registered PET acquisition is mutated so the real worker must fail
closed instead of emitting a plausible SUVbw factor (ADR-004): replacing the
``START`` decay correction with ``ADMIN`` references a different event, and
removing the radiopharmaceutical sequence leaves the injected dose unknown.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any, cast

import pydicom
import synthetic_pixel_volume as spv
from pydicom.dataset import Dataset

from worker.dispatch import build_dispatcher
from worker.envelope import process_record
from worker.protocol import QUANTITATION_SUVBW_METHOD

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_ROOT = REPO_ROOT / "tests" / "rendering" / "fixtures" / "volumes"
COREG_NAME = "pt-axial-coreg"

Mutator = Callable[[Dataset], None]


def _series_uid() -> str:
    raw = json.loads((FIXTURES_ROOT / COREG_NAME / "fixture.json").read_text(encoding="utf-8"))
    assert isinstance(raw, dict)
    return cast(str, raw["seriesInstanceUID"])


def _quantitation(directory: Path) -> dict[str, Any]:
    request = {
        "jsonrpc": "2.0",
        "id": "req-p32-quantitation-negative",
        "protocolVersion": "1.0",
        "method": QUANTITATION_SUVBW_METHOD,
        "params": {
            "locator": {"kind": "local-folder", "path": str(directory)},
            "seriesInstanceUID": _series_uid(),
        },
    }
    dispatcher = build_dispatcher(now=lambda: spv.FROZEN_NOW)
    response = process_record(json.dumps(request), 0, dispatcher)
    assert "result" in response, response
    return cast(dict[str, Any], response["result"])


def _mutated_instances(tmp_path: Path, mutate: Mutator) -> Path:
    """Copy the co-registered PT slices and apply ``mutate`` to every dataset."""
    target = tmp_path / "instances"
    target.mkdir()
    for path in sorted((FIXTURES_ROOT / COREG_NAME / "instances").glob("*.dcm")):
        dataset = pydicom.dcmread(str(path))
        mutate(dataset)
        dataset.save_as(str(target / path.name), enforce_file_format=True)
    return target


def _diagnostic_codes(result: dict[str, Any]) -> set[str]:
    return {str(item["code"]) for item in result["diagnostics"]}


def _unsupported_admin(dataset: Dataset) -> None:
    dataset.DecayCorrection = "ADMIN"


def _drop_radiopharmaceutical(dataset: Dataset) -> None:
    del dataset.RadiopharmaceuticalInformationSequence


def test_admin_decay_correction_does_not_compute_a_factor(tmp_path: Path) -> None:
    """Negative control: DecayCorrection ADMIN must not yield a plausible factor."""
    result = _quantitation(_mutated_instances(tmp_path, _unsupported_admin))
    assert result["status"] == "invalid"
    assert "suvFactor" not in result
    assert "dicom.quantitation.unsupported-decay-correction" in _diagnostic_codes(result)


def test_missing_radiopharmaceutical_dose_does_not_compute_a_factor(tmp_path: Path) -> None:
    """Negative control: an absent dose sequence must not yield a plausible factor."""
    result = _quantitation(_mutated_instances(tmp_path, _drop_radiopharmaceutical))
    assert result["status"] == "unavailable"
    assert "suvFactor" not in result
    expected = "dicom.quantitation.missing-required-tag:RadiopharmaceuticalInformationSequence"
    assert expected in _diagnostic_codes(result)
