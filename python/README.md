# NuClear Scientific Worker (`nuclear-scientific`)

Local, headless Python worker for NuClear. It owns technical DICOM
interpretation, physical patient geometry verification, and quantitative
PET calibration. It is **not** an interactive GUI backend, a web server, or
a medical renderer.

The transport between this worker and `@nuclear/medical-engine` is fixed by
[ADR-002](../docs/decisions/ADR-002-scientific-worker-stdio-json-rpc.md):
newline-delimited JSON-RPC 2.0 over standard input/output with a NuClear
`protocolVersion`.

## Package layout

```text
python/
├── pyproject.toml        # PEP 621 package metadata (source of truth for deps)
├── dicom/                # DICOM parsing, geometry verification, SUVbw
├── worker/               # stdio JSON-RPC 2.0 daemon
│   ├── protocol.py       # version, error codes and envelope builders
│   ├── envelope.py       # ordered, fail-closed request validation
│   ├── dispatch.py       # method registry, composition and handshake
│   ├── stdio.py          # newline-delimited supervisor loop
│   └── __main__.py       # `python -m worker` entry point
└── tests/                # headless pytest suite for this package
```

Versioned fixture data and protocol examples live in the repository-level
`tests/fixtures/` directory and are indexed by
`tests/fixtures/manifest.json`.

## Running the worker

The worker is launched either as a module or through the registered console
script; both run the same newline-delimited JSON-RPC 2.0 loop:

```bash
# from the repository root, using the provisioned environment
python/worker/.venv/bin/python -m worker
# equivalent console entry point (after `pip install -e "python[dev]"`)
python/worker/.venv/bin/nuclear-worker
```

### Supervisor contract

- **Stateless across records.** Every request is validated and handled
  independently. The worker holds no session state, so a restarted process
  needs no cleanup or handover.
- **stdout is the protocol channel only.** Exactly one compact JSON-RPC
  response is written per non-empty request line, followed by a single `\n`
  and flushed. Logs are never written to stdout.
- **stderr carries diagnostics**, including handler tracebacks.
- **A malformed or failing record never terminates the process.** It receives
  a structured error response carrying a non-empty `data.diagnostic`.
- **Outgoing JSON is standards-valid.** Responses are serialized with
  `allow_nan=False`; a handler returning a non-finite value can never emit
  invalid JSON and is answered with a structured `-32603` response.
- **Incoming JSON is strict.** The non-standard `NaN`, `Infinity` and
  `-Infinity` constants are rejected as `-32700` parse errors rather than being
  accepted as floating-point values.
- **EOF on stdin exits `0`.** A non-zero exit is reserved for unrecoverable
  startup errors.
- **Restart, backoff, timeout and request/response correlation are owned by
  the TypeScript `ScientificWorkerBridge`** (P2.5), not by the worker.

## Operations

The single production composition point is `build_dispatcher(now=None)`. It
registers every implemented operation, and `python -m worker`, the console
script and the tests all use it. The handshake operation list and the
unknown-method `supportedMethods` list are derived from that registration, so
they can never drift from the handler set.

### `nuclear.protocol.handshake`

Returns `protocolVersions`, the sorted list of implemented `operations` and
`workerMetadata` provenance.

### `nuclear.dicom.inspect`

Reads DICOM metadata only (`pydicom.dcmread(..., stop_before_pixels=True)`,
never pixel data) from a shared-types `SourceLocator`. Request params are
`{ "locator": <SourceLocator> }`:

| Locator `kind` | Fields | Behaviour |
| --- | --- | --- |
| `local-folder` | `path` | Recursively scans the directory tree for files |
| `local-file-list` | `files`, optional `basePath` | Reads the listed files, resolved against `basePath` when relative |
| `archive-entry` | `archivePath`, optional `innerEntryPrefix` | Reads matching entries of a ZIP archive |

Malformed, missing or unknown locators fail closed with `-32602`
(`INVALID_PARAMS`) and a `violations` list. An unresolvable or unreadable
source fails closed with the NuClear-reserved `-32010` (`SOURCE_UNAVAILABLE`)
and a structured diagnostic; a plausible empty result is never emitted.
Non-DICOM or unparseable files are skipped, counted and reported with a
`dicom.skipped-file` warning diagnostic (basename only); they never abort the
inspection.

The result carries `studies`, `diagnostics` and `skippedFileCount`, plus the
standard `workerMetadata` (operation `nuclear.dicom.inspect`, effective locator
kind and counts, never a raw absolute path). Each series carries
`classification`, `supported`, `instanceCount` and a nullable `reason`.
Studies are sorted by `studyInstanceUID`, series by
`(seriesNumber or 0, seriesInstanceUID)` and diagnostics by `(code, file)`.
An instance missing `StudyInstanceUID` is grouped under `studyInstanceUID: ""`
and its series fails closed as `unsupported` with
`reason = "missing-required-tag:StudyInstanceUID"`; no study UID is invented.

#### Classification tree

Classification uses standard tags only; `SeriesDescription` and other
free-text heuristics are never used. The required identity tags are
`SOPInstanceUID`, `StudyInstanceUID`, `SeriesInstanceUID` and `Modality`.

1. A missing required tag fails the series closed with
   `reason = "missing-required-tag:<name>"` and a
   `dicom.missing-required-tag` error diagnostic.
2. Instances of one series that disagree on `Modality` or `SOPClassUID` fail
   closed with `reason = "inconsistent-series-metadata"`.
3. Secondary Capture SOP Class (`1.2.840.10008.5.1.4.1.1.7`) or an
   `ImageType` token `SECONDARY` -> `secondary-capture`, unsupported.
4. Modality `CT`: `ImageType` `LOCALIZER` -> `localizer`, unsupported;
   `ORIGINAL`, `PRIMARY` and `AXIAL` -> `ct-primary`, supported; otherwise
   `unsupported` with `reason = "non-primary-image-type"`.
5. Modality `PT`: `CorrectedImage` `ATTN` -> `pt-primary`, supported;
   otherwise `pt-uncorrected`, unsupported with
   `reason = "attenuation-correction-missing"`.
6. Any other modality -> `unsupported` with
   `reason = "unsupported-modality"`.

Token checks are case-insensitive and consider the union of tokens across all
instances of the series. Emitted `modality` values always come from the
`@nuclear/shared-types` vocabulary (`CT`, `PT`, `MR`, `NM`, `CR`, `DX`, `SC`,
`OT`); a missing or unrecognised value becomes `OT`.

### `nuclear.dicom.geometry`

Request params are `{ "locator": <SourceLocator>, "seriesInstanceUID": str }`.
A series with no matching instance returns
`{"status":"unavailable","reason":"series-not-found"}`. A geometrically invalid
grid returns `{"status":"rejected","reason":<reason>,"diagnostics":[...]}` and
**never** emits a `geometry` object. The reasons are
`missing-required-tag:<name>`, `non-finite-geometry`,
`non-positive-dimensions`, `non-positive-pixel-spacing`,
`inconsistent-study-uid`, `inconsistent-frame-of-reference`,
`inconsistent-modality`, `duplicate-sop-instance-uid`,
`insufficient-slices`, `irregular-slice-spacing`, `inconsistent-orientation`,
`gantry-tilt`, `duplicate-slice-position` and `inconsistent-pixel-spacing`.

Validation is deterministic and fail-closed, evaluated before any ordering or
bounds computation:

1. the requested `seriesInstanceUID` must match at least one instance
   (`series-not-found` otherwise);
2. every required identity/geometry tag must be present
   (`missing-required-tag:<name>`; a present-but-unusable numeric vector is
   reported under the same disposition);
3. `StudyInstanceUID`, `FrameOfReferenceUID` and `Modality` must agree across
   the series and every `SOPInstanceUID` must be unique
   (`inconsistent-study-uid`, `inconsistent-frame-of-reference`,
   `inconsistent-modality`, `duplicate-sop-instance-uid`);
4. at least `MIN_SLICES` slices are required (`insufficient-slices`);
5. all `ImagePositionPatient`/`ImageOrientationPatient`/`PixelSpacing`
   components must be finite and `Rows`/`Columns`/`PixelSpacing` must be
   strictly positive (`non-finite-geometry`, `non-positive-dimensions`,
   `non-positive-pixel-spacing`), so `AssetGeometry` never carries `NaN`,
   `Infinity` or non-positive sampling;
6. derived values are re-checked for finiteness before a `computed` result is
   returned: slice projections, consecutive spacing differences, the aggregated
   slice spacing, and the final `origin`/`spacing`/`sliceNormal`/`bounds`. A
   per-component-finite input that overflows the projection or bounds math is
   rejected with `non-finite-geometry` rather than escaping to the transport
   layer as a generic `-32603`.

A required geometry tag that is present but is not a usable numeric vector of
the required arity (for example a wrong-length `PixelSpacing`) is reported under
the same `missing-required-tag:<Tag>` disposition as an absent tag; no separate
disposition is invented. `insufficient-slices` is structural: verifying a
*regular* grid needs at least two consecutive spacing intervals, hence at least
three slices. Single- and two-slice stacks are structurally unverifiable and
fail closed; real-world handling of single/double-slice acquisitions (for
example localizers or scouts) is explicitly deferred, not silently accepted.

A valid grid returns `{"status":"computed", ...}` with:

- `dimensions = [columns, rows, slices]`;
- `spacing = [colSpacing, rowSpacing, sliceSpacing]` mm, where
  `colSpacing = PixelSpacing[1]` and `rowSpacing = PixelSpacing[0]`;
- `origin` = `ImagePositionPatient` of normalized slice 0 (centre of voxel
  `[0,0,0]`);
- `direction` = `ImageOrientationPatient = [rx,ry,rz,cx,cy,cz]` and
  `sliceNormal = row x column`;
- `slicePositionsLpsMm` ordered so increasing index follows `+sliceNormal`;
- `bounds` = the AABB over the eight outer half-voxel corners using the Phase 1
  `calculatePhysicalBounds` formula verbatim.

Slices are normalized by sorting instances by `dot(IPP, sliceNormal)`. No
irregular grid is averaged, reordered or repaired; irregular spacing, gantry
tilt, inconsistent orientation, duplicate positions, insufficient slices and
inconsistent pixel spacing all fail closed. `spacing[2]` (slice spacing) is the
arithmetic mean of the consecutive slice-position differences, computed only
**after** the `max - min <= SPACING_EPSILON_MM` regularity check, so it is not a
silent repair: any deviation is bounded by the named tolerance.

#### `geometricDigest` v1 convention

`geometricDigest = "sha256:" + sha256(canonical_json)` over
`{frameOfReferenceUID, dimensions, spacing, origin, direction, bounds}`, where
`canonical_json` uses sorted keys and `(",", ":")` separators and every float is
rendered as a fixed six-decimal string.

#### Named comparison tolerances

These are floating-point comparison tolerances for deterministic synthetic
fixtures, **not clinical acceptance thresholds**; real-world tolerance policy is
explicitly deferred.

| Constant | Value | Role |
| --- | --- | --- |
| `DIRECTION_COSINE_EPSILON` | `1e-4` | Aligns with TS `isDirectionCosinesValid` |
| `BOUNDS_EPSILON` | `1e-5` | Aligns with TS `isAssetGeometry` |
| `SPACING_EPSILON_MM` | `1e-4` | Regular slice/pixel spacing comparison |
| `COLLINEARITY_EPSILON_MM` | `1e-4` | Slice centres on the slice-normal axis |
| `COPLANARITY_COSINE_EPSILON` | `1e-6` | `1 - abs(dot(n_left, n_right))` |

### `nuclear.dicom.compatibility`

Request params are `{ "left": { "locator": ..., "seriesInstanceUID": ... },
"right": { ... } }`. `compatible = frameOfReference.equal AND
orientation.coplanar`. Spacing, origin and extent are **evidence only**: PET and
CT legitimately differ in grid, so a spacing difference never sets
`compatible` to `false`. `incompatibilities` contains
`frame-of-reference-mismatch` and/or `orientation-not-coplanar`. If either side
is rejected or unavailable, the result is `{"status":"rejected"|"unavailable",
"side":"left"|"right","reason":<reason>}`.


## Environment provisioning

The worker is an isolated Python environment. Python `>=3.12` is required by
`pyproject.toml` and is also the mypy analysis target (`[tool.mypy]
python_version = "3.12"`): the installed numpy/SimpleITK stubs use PEP 695
syntax that cannot be parsed at a 3.10 target. The repository's reproducible
local runner is pinned to the native arm64 Homebrew CPython 3.14 interpreter on
macOS.

```bash
# from the repository root
/opt/homebrew/bin/python3.14 -m venv python/worker/.venv
python/worker/.venv/bin/python -m pip install -e "python[dev]"
```

`python/worker/.venv/` is ignored by Git and must never be committed.

## Test and type-check commands

```bash
# from the repository root
npm run test:python
# equivalent
python/worker/.venv/bin/python -m pytest python/tests -q

# configured strict mypy (must always pass --config-file; the bare
# `python -m mypy` command does not discover python/pyproject.toml from the
# repository root and would silently fall back to non-strict defaults)
npm run typecheck:python
# equivalent
python/worker/.venv/bin/python -m mypy --config-file python/pyproject.toml python/dicom python/worker python/tests
```

A missing virtual environment or an unprovisioned dependency is reported as
`BLOCKED`, never as a passing test run. Zero discovered tests is not a pass.

## Measured dependency state

Recorded when the P2.0 runner was provisioned (2026-09-20). Re-run
`python/worker/.venv/bin/python -m pip freeze` to confirm the live state.

| Dependency | Constraint (`pyproject.toml`) | Installed |
| --- | --- | --- |
| CPython | `>=3.12` | 3.14.6 (native arm64) |
| pydicom | `>=2.4.0` | 3.0.2 |
| numpy | `>=1.24.0` | 2.5.3 |
| SimpleITK | `>=2.3.0` | 2.5.6 |
| pytest | `>=8.0.0` (dev) | 9.1.1 |
| mypy | `>=1.9.0` (dev) | 2.3.1 |
| ruff | `>=0.3.0` (dev) | 0.16.8 |

## Scope boundaries

In scope for Phase 2, per
[the Phase 2 plan](../docs/plans/PHASE_2_SCIENTIFIC_INGESTION_PLAN.md):
study/series classification, regular-grid geometry extraction in LPS mm,
PET raw metadata and SUVbw eligibility, and the versioned stdio JSON-RPC
surface.

Explicitly out of scope: WebGL/Cornerstone rendering, viewer or figure UI,
DICOMweb/PACS, resampling, and registration. Failures must be explicit
structured results; no plausible fallback is emitted for missing tags,
unsupported units, or incompatible geometry.

## Documentation

Python API documentation is generated into `docs/api/python/` by
`npm run docs:python` (`scripts/build_python_docs.py`). Public modules use
Google-style docstrings and strict type hints.
