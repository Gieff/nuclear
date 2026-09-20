# AgentLog — Phase 2: Scientific DICOM Ingestion & Python Worker Bridge

## Status

- **P2.0 — COMPLETE** (2026-09-20). Python runner, declared package README,
  versioned fixture manifest and ADR-002 protocol examples established and
  verified.
- **P2.1 — COMPLETE** (2026-09-20). JSON-RPC worker envelope, handshake,
  error schema and stdio supervisor contract implemented and ratified.
- **P2.2 — COMPLETE** (2026-09-20). `nuclear.dicom.inspect` study/series
  discovery and explicit classification implemented and ratified.
- **P2.3 — COMPLETE, HARDENED BY P2.3.1** (2026-09-20). Regular-grid geometry
  extraction and compatibility evidence implemented and ratified.
- **P2.3.1 — COMPLETE** (2026-09-20). Fail-closed hardening: non-finite and
  non-positive geometry rejection, intra-series identity invariants, strict
  JSON boundary, and derived-finiteness guards.
- **P2.4 — COMPLETE, CORRECTED BY P2.4.1** (2026-09-20). PET raw metadata
  extraction and `PetQuantitationResult` SUVbw factor production implemented
  and ratified.
- **P2.4.1 — COMPLETE** (2026-09-20). DICOM extraction/interpretation
  conformance: `RadiopharmaceuticalInformationSequence`, START-only decay
  correction, date-aware acquisition timestamps, and intra-series identity
  invariants.
- **P2.4.2 — COMPLETE** (2026-09-20). DT offset-range enforcement (DICOM
  PS3.5 §6.2), `Number.isFinite` PET numeric guards, and `isImagingAsset`
  PET-metadata validation.
- **P2.5–P2.6 — NOT STARTED.** No TypeScript `ScientificWorkerBridge` code
  exists.
- This file is append-only per slice. Each future slice appends its own
  eight-point handover below; do not rewrite completed entries.

## Governing Documents

- `docs/plans/PHASE_2_SCIENTIFIC_INGESTION_PLAN.md`
- `docs/plans/PHASE_2_OPENCODE_RUNBOOK.md`
- `docs/decisions/ADR-002-scientific-worker-stdio-json-rpc.md`

---

# Handover Report — P2.0: Python Runner, Fixture Manifest & Protocol Examples

## 1. What Was Implemented

- **Provisioned Python scientific worker runner.** A native arm64 CPython
  3.14.6 virtual environment at `python/worker/.venv` (Git-ignored) with the
  editable `nuclear-scientific` distribution and its declared dependencies.
  Measured live: pydicom 3.0.2, numpy 2.5.3, SimpleITK 2.5.6, pytest 9.1.1,
  mypy 2.3.1, ruff 0.16.8.
- **Resolved PEP 621 package metadata.** Added the declared package
  `python/README.md` so `readme = "README.md"` resolves; the installed
  distribution now exposes a 3020-character long description. Previously the
  declared readme was absent and `Description` was empty.
- **Reproducible test command.** Added `npm run test:python`
  (`python/worker/.venv/bin/python -m pytest python/tests -q`) and
  `[tool.pytest.ini_options]` (`testpaths = ["tests"]`) to `pyproject.toml`.
- **Versioned fixture manifest.** `tests/fixtures/manifest.json` (schema
  version `1.0`, `phase: 2`, `protocolVersion: 1.0`) indexes 22 fixtures:
  7 `established` protocol examples and 15 `planned` P2.2–P2.4 DICOM,
  geometry and quantitation fixtures. `planned` entries carry no path and no
  expected output and are explicitly never evidence for PASS.
- **Versioned ADR-002 protocol examples.** `tests/fixtures/protocol/` holds
  one correlated request/response pair plus reserved parse/unknown-method/
  invalid-params/protocol-mismatch error records and one raw malformed
  record. All are stamped `normative: false` pending P2.1 ratification.
- **Headless regression tests.** Three pytest modules (19 tests) verifying
  the runner and metadata, manifest integrity, and ADR-002 envelope
  invariants including fail-closed negatives.

## 2. Files Changed / Created

Created:
- `python/README.md` (declared package README)
- `python/tests/conftest.py`
- `python/tests/test_package_baseline.py`
- `python/tests/test_fixture_manifest.py`
- `python/tests/test_protocol_examples.py`
- `tests/fixtures/manifest.json`
- `tests/fixtures/protocol/README.md`
- `tests/fixtures/protocol/request.handshake.json`
- `tests/fixtures/protocol/response.handshake.json`
- `tests/fixtures/protocol/error.unknown-method.json`
- `tests/fixtures/protocol/error.protocol-mismatch.json`
- `tests/fixtures/protocol/error.invalid-params.json`
- `tests/fixtures/protocol/error.parse.json`
- `tests/fixtures/protocol/malformed.request.txt`

Modified:
- `python/pyproject.toml` (`[tool.pytest.ini_options]`)
- `package.json` (`test:python` script)
- `.gitignore` (`*.egg-info/` — ignore editable-install artifacts)
- `docs/agentlog/phase-2.md` (this handover)

Not modified: `python/dicom/__init__.py`, `python/worker/__init__.py`
(pre-existing, no implementation added).

## 3. Architectural Assumptions Made

- Python stays an isolated local scientific worker (Rule 02); it has no
  Node/DOM dependency and is not a renderer or HTTP server.
- ADR-002 is the transport authority. The examples demonstrate the envelope
  only: newline-delimited JSON-RPC 2.0, `protocolVersion` on request and
  response, `nuclear.<operation>` namespace, correlated ids, mandatory
  worker provenance (`workerVersion`, `operation`, `timestamp`, `parameters`)
  on success, and structured `data.diagnostic` errors. No clinical operation
  is asserted to exist.
- Standard JSON-RPC error codes are used (`-32700`, `-32601`, `-32602`);
  the NuClear-specific protocol-mismatch code `-32001` is a reserved example
  subject to P2.1 ratification.
- No clinical tolerance is invented. P2.0 exercises exact JSON envelope
  assertions only; DICOM numeric tolerances remain undefined until P2.2–P2.4.
- The runner is pinned to the repository's native arm64 Homebrew CPython 3.14
  on macOS; Windows provisioning is out of scope for this slice.

## 4. Tests Added & Executed

- Python: `npm run test:python` → **19 passed** (non-zero collection: 4
  package baseline, 8 manifest integrity, 7 protocol envelope). Fail-closed
  negatives include: malformed record must raise `JSONDecodeError`; every
  error envelope must omit `result` and carry a diagnostic; parse error must
  use `id: null`; planned fixtures must not claim a path or expected output.
- Ruff: `python -m ruff check python` → all checks passed.
- mypy (strict): `python -m mypy python/dicom python/worker python/tests` →
  no issues in 6 source files.
- TypeScript: `npm run typecheck` → 0 errors; `npm test` → 33/33 pass
  (10 suites); `npm run build` → clean.
- File-length gate: largest new source file 160 lines (≤300).

## 5. Documentation, Agentlog & ADR Status

- `python/README.md` documents provisioning, the test command, measured
  dependency state and Phase 2 scope boundaries.
- `tests/fixtures/protocol/README.md` documents fixture status, error-code
  conventions and the P2.1 ratification boundary.
- ADR-002 already exists and was not modified. No new ADR required for this
  scaffolding slice.
- Gate status: Python/TS/build/lint gates PASS; fixture-integrity gate PASS;
  AgentLog Gate satisfied by this report.

## 6. Project Model Impact

- No clinical contract, `.ncp` schema, or `@nuclear/shared-types` type was
  changed. `ScientificWorkerMetadata` and `PetQuantitationResult` are
  referenced by description only; no TypeScript scientific logic added.
- The fixture manifest becomes the NuClear-owned index that later P2.x slices
  must update when they promote a `planned` fixture to `established`.

## 7. Known Limitations & Technical Debt

- **Non-blocking (reviewer):** `npm run test:python` hardcodes the POSIX venv
  path; Windows provisioning is deferred to the desktop phase.
- **Non-blocking (reviewer):** error examples carry request ids without
  paired request fixtures; P2.1 should pair them or document the convention
  when ratifying the envelope.
- **Pre-existing debt (reviewer):** `python/dicom/__init__.py` advertises
  `scanner`/`geometry`/`quantitation` modules that do not yet exist. Flagged
  so no later agent mistakes documented intent for implemented behaviour;
  trimming is deferred to P2.2+.
- **Environment:** the editable install leaves `python/nuclear_scientific.egg-info/`
  on disk (now Git-ignored). Reproducibility is pinned to a native arm64
  CPython 3.14; the machine also has an x86_64 MacPorts CPython 3.12 under
  Rosetta, which must not be used for this venv.

## 8. Exact Next Recommended Task

- **P2.1** (owner: `nuclear-scientific-engineer`): implement the JSON-RPC
  worker envelope, handshake, error schema and stdio supervisor contract,
  ratifying or correcting the P2.0 protocol examples and promoting them from
  `normative: false` to the implemented contract. Do not start P2.2 until
  P2.1 review and QA evidence is recorded here.

---

## Gate Review & QA Evidence (P2.0)

- `nuclear-reviewer`: **PASS** — package boundaries, ADR-002 conformance,
  fixture honesty, scope discipline, non-simplification, file length and
  hygiene all verified against the real diff; 4 non-blocking findings
  recorded in §7.
- `nuclear-qa`: **PASS** on all 10 gates — runner provisioning, metadata
  resolution (3020-char description), 19/19 Python tests, `npm run typecheck`,
  `npm test` (33/33), `npm run build`, ruff, mypy strict, file length, and
  manifest integrity (7 established / 15 planned, no false evidence). The
  AgentLog gate was the only pending item and is satisfied by this report.
- Deliberately not staged: pre-existing unrelated working-tree changes to
  `AGENTS.md`, `.opencode/agents/*`, `.opencode/commands/phase.md` and
  `CHANGELOG.md` (including a stray `## v0.1` heading), which predate this
  slice and remain for their own task.

---

# Handover Report — P2.0 Planning Integration & Changelog Consolidation

## 1. What Was Implemented

- Activated the Phase 2 plan and ADR-002 as mandatory inputs for the OpenCode
  phase command and orchestrator.
- Updated the repository baseline to show Phase 2 active with P2.0 complete.
- Removed the invalid nested `v0.1` heading so unreleased notes remain under
  the standard `Unreleased` section until an actual versioned release is
  promoted.
- Updated the sandboxed changelog-writer profile to its selected review model.

## 2. Files Changed / Created

- `AGENTS.md`
- `.opencode/agents/nuclear-changelog-writer.md`
- `.opencode/agents/nuclear-orchestrator.md`
- `.opencode/commands/phase.md`
- `CHANGELOG.md`
- `docs/agentlog/phase-2.md`

## 3. Architectural Assumptions Made

- OpenCode reads the phase plan and ADR before P2.1 delegation; this does not
  alter worker protocol or scientific behaviour.
- A semantic version header is added only during an explicit release
  promotion, not inside `Unreleased`.

## 4. Tests Added & Executed

- No runtime behaviour changed. Existing TypeScript and Python gates remain
  the applicable evidence for the unchanged implementation.

## 5. Documentation, Agentlog & ADR Status

- ADR-002 and both Phase 2 planning documents are now wired into OpenCode.
- This report records the integration as a separate append-only slice.

## 6. Project Model Impact

- None.

## 7. Known Limitations & Technical Debt

- P2.1 remains paused and unmodified; no worker envelope or handshake has
  been implemented by this consolidation.

## 8. Exact Next Recommended Task

- Resume P2.1 with `nuclear-scientific-engineer` using the mandatory Phase 2
  plan, runbook and ADR-002 inputs.

---

# Handover Report — P2.1: JSON-RPC Worker Envelope, Handshake & Stdio Supervisor

## 1. What Was Implemented

- **Versioned envelope layer** (`python/worker/protocol.py`): protocol version
  `1.0`, `nuclear.<operation>` namespace, JSON-RPC 2.0 and NuClear reserved
  error codes (`-32700`, `-32600`, `-32601`, `-32602`, `-32603`, `-32001`),
  `ProtocolError`, deterministic second-precision ISO-8601 UTC formatting and
  the success/error response builders. Error construction raises if a
  non-empty `data.diagnostic` is missing, so fail-closed is enforced by
  construction.
- **Ordered, fail-closed validation** (`python/worker/envelope.py`): parse →
  object/`jsonrpc`/`method`/`id` → `protocolVersion` → `params` → dispatch.
  Every failure returns a structured error carrying `data.diagnostic` and
  never a `result`; no fallback is emitted.
- **Method registry and handshake** (`python/worker/dispatch.py`): only
  `nuclear.protocol.handshake` is registered. It returns
  `protocolVersions`, the implemented `operations`, and `workerMetadata`
  (`workerVersion`, `operation`, `timestamp`, `parameters`). The clock is
  injectable for determinism.
- **Stdio supervisor contract** (`python/worker/stdio.py`, `__main__.py`):
  newline-delimited records, one compact JSON response per non-empty line,
  flushed; stdout is protocol-only, diagnostics and tracebacks go to stderr; a
  malformed or failing record is always answered and never terminates the
  process; EOF exits `0`. Process, serialization and write/flush are all
  inside one protective guard that emits a fail-closed `-32603` on failure.
  `python -m worker` and the `nuclear-worker` console script both run it.
- **Fixture ratification**: all P2.0 protocol examples flipped to
  `normative: true`; the handshake fixture updated to
  `operations: ["nuclear.protocol.handshake"]`; the three id-bearing error
  transactions now have correlated `request.*` fixtures, closing the P2.0
  reviewer finding.

## 2. Files Changed / Created

Created:
- `python/worker/protocol.py`, `envelope.py`, `dispatch.py`, `stdio.py`,
  `__main__.py`
- `python/tests/test_worker_envelope.py`, `test_worker_handshake.py`,
  `test_worker_stdio.py`
- `tests/fixtures/protocol/request.unknown-method.json`,
  `request.protocol-mismatch.json`, `request.invalid-params.json`

Modified:
- `python/worker/__init__.py` (exports only), `python/pyproject.toml`
  (`[project.scripts] nuclear-worker`), `python/README.md` (running the worker
  and the supervisor contract)
- `tests/fixtures/protocol/response.handshake.json`,
  `error.unknown-method.json`, `README.md`, `tests/fixtures/manifest.json`
- `docs/agentlog/phase-2.md` (this handover)

Not modified: `python/dicom/**`, `packages/**`, `apps/**`, all TypeScript.

## 3. Architectural Assumptions Made

- ADR-002 remains the transport authority; the handshake and error schema are
  now ratified, so the P2.0 examples are normative rather than illustrative.
- `protocolVersion` is checked before `params` and dispatch; a missing or
  non-`1.0` version is a NuClear mismatch (`-32001`), not an invalid request.
  A parse error cannot correlate an `id` and therefore uses `id: null`.
- `ProtocolError` maps to its declared code for explicit scientific failures;
  only unexpected exceptions become `-32603`. Tracebacks are logged to stderr
  and never leak into the protocol record.
- The worker is stateless across records and safely restartable with no
  cleanup. Restart, backoff, timeout and correlation belong to the P2.5
  TypeScript bridge, not the worker.
- Only implemented operations may appear in `operations`/`supportedMethods`;
  P2.2–P2.4 register handlers on the same registry without changing the
  envelope or stdio contracts.

## 4. Tests Added & Executed

- `npm run test:python` → **47 passed** (0 failed, 0 skipped). P2.1 adds 28
  tests over the P2.0 baseline of 19: validation order and error codes,
  handshake provenance and arbitrary-id correlation, manifest-driven
  round-trip equality for all five normative pairs (including
  `malformed → parse error`), pair-set completeness, negative-fixture
  envelope shape, stdio liveness, channel discipline, EOF exit code, and a
  real kill/restart test.
- Ruff clean; mypy strict clean (14 source files); `npm run typecheck`,
  `npm test` (33/33) and `npm run build` all green.
- File-length gate: largest P2.1 file 249 lines.

## 5. Documentation, Agentlog & ADR Status

- `python/README.md` documents launching the worker and the six-point
  supervisor contract; `tests/fixtures/protocol/README.md` documents the
  ratified fixtures, the request/error pairing and the `jq -c .` compaction
  note for piping.
- No new ADR was required; ADR-002 already governs the transport and its
  examples are now ratifying evidence.

## 6. Project Model Impact

- No `@nuclear/shared-types` contract, `.ncp` schema or TypeScript file was
  changed. The worker now produces the versioned envelope and provenance that
  the P2.5 `ScientificWorkerBridge` will map to NuClear contracts.

## 7. Known Limitations & Technical Debt

- `python/dicom/__init__.py` still advertises `scanner`/`geometry`/
  `quantitation` modules that do not exist (pre-existing; to be realised in
  P2.2–P2.4).
- The worker has no TypeScript bridge yet; correlation, timeouts and backoff
  are documented but are implemented in P2.5.
- `test_worker_envelope.py` is 249 lines, at the decomposition threshold
  (Rule 02); split it if it grows in P2.2+.
- The `error.parse.json` record index is 0 in the stdio round-trip; the
  bridge must not assume the index is globally stable across restarts.

## 8. Exact Next Recommended Task

- **P2.2** (owner: `nuclear-scientific-engineer`): DICOM study/series
  inspection and classification behind a newly registered
  `nuclear.*` operation, using synthetic CT/PT/unsupported fixtures with
  negative localizer, secondary-capture and missing-tag cases. Do not start
  P2.3 until P2.2 review and QA evidence is recorded here.

---

## Gate Review & QA Evidence (P2.1)

- `nuclear-reviewer` first pass: **CONCERNS** — (1) unknown-method fixture
  diagnostic drift, (2) no error round-trip net, (3) serialization outside
  the liveness guard, plus low findings. All six were corrected.
- `nuclear-reviewer` re-review: **PASS** — 5/5 fixture pairs replay
  byte-identically, liveness guard verified by probe, boundaries and file
  lengths clean.
- `nuclear-qa` re-verification: **PASS on all gates** — 47/47 Python tests,
  ruff, mypy strict, TS typecheck/tests/build, file length, fixture integrity
  (all protocol fixtures normative, P2.2–P2.4 still planned), channel
  discipline. The AgentLog gate was pending at QA time and is satisfied by
  this report.

---

# Handover Report — P2.2: DICOM Study/Series Inspection & Classification

## 1. What Was Implemented

- **`nuclear.dicom.inspect` operation**: resolves a shared-types
  `SourceLocator` (`local-folder`, `local-file-list`, `archive-entry`), reads
  DICOM **metadata only** (`stop_before_pixels=True`), groups instances by
  `StudyInstanceUID`/`SeriesInstanceUID`, and returns a deterministic study /
  series summary.
- **Explicit classification tree** (standard DICOM tags only, no free-text
  heuristics): `ct-primary` (CT + `ORIGINAL`+`PRIMARY`+`AXIAL`),
  `pt-primary` (PT + `CorrectedImage` `ATTN`), `pt-uncorrected`,
  `localizer` (CT + `LOCALIZER`), `secondary-capture` (Secondary Capture SOP
  Class or `ImageType` `SECONDARY`), and `unsupported`
  (`unsupported-modality`, `non-primary-image-type`,
  `inconsistent-series-metadata`, `missing-required-tag:<name>`). Every
  non-primary series is returned with `supported:false` and a reason; nothing
  is silently dropped.
- **Fail-closed source handling**: malformed/unknown locator -> `-32602` with
  `violations`; unresolvable/unreadable source -> the new reserved code
  `SOURCE_UNAVAILABLE = -32010` with a basename-only diagnostic and no
  plausible empty result. Non-DICOM/unparseable files are skipped, counted
  and reported as warnings without aborting inspection.
- **Protocol integration**: single composition point `build_dispatcher()`
  registers `nuclear.protocol.handshake` and `nuclear.dicom.inspect`; the
  handshake `operations` and unknown-method `supportedMethods` fixtures were
  updated to `["nuclear.dicom.inspect","nuclear.protocol.handshake"]` and are
  still reproduced exactly by the manifest-driven round-trip tests.
- **Deterministic synthetic fixtures**: `python/tests/synthetic_dicom.py`
  generates metadata-only datasets with fixed valid UIDs for CT primary, PT
  attenuation-corrected, CT localizer, secondary capture, unsupported
  modality, missing `Modality`, a non-axial CT, and a mixed folder with a
  non-DICOM file.

## 2. Files Changed / Created

Created:
- `python/dicom/metadata.py`, `classification.py`, `aggregation.py`,
  `sources.py`, `scanner.py`
- `python/tests/synthetic_dicom.py`, `python/tests/test_dicom_classification.py`
- `tests/fixtures/dicom/classification/{ct-primary, pt-attenuation-corrected,
  localizer, secondary-capture, unsupported-modality,
  missing-required-tag}.expected.json`

Modified:
- `python/dicom/__init__.py` (module layout)
- `python/worker/protocol.py` (`DICOM_INSPECT_METHOD`, `SOURCE_UNAVAILABLE`
  `-32010`), `dispatch.py` (`build_dispatcher`, `clock` property),
  `stdio.py`, `__init__.py`
- `python/tests/{test_worker_envelope, test_worker_handshake,
  test_worker_stdio, test_fixture_manifest}.py`
- `python/README.md`; `tests/fixtures/manifest.json`;
  `tests/fixtures/protocol/{response.handshake.json,
  error.unknown-method.json, README.md}`
- `docs/agentlog/phase-2.md` (this handover)

Not modified: `packages/**`, `apps/**`, any TypeScript, `python/pyproject.toml`
(`dicom*` was already packaged), `python/dicom/geometry`, `quantitation`.

## 3. Architectural Assumptions Made

- Classification is discrete and tag-based; it introduces **no tolerance** and
  no free-text `SeriesDescription` heuristic. The Primary CT rule follows the
  NuClear-owned `nuclear-dicom` runbook (`ORIGINAL`+`PRIMARY`+`AXIAL`); a
  non-axial primary CT is explicitly `unsupported` rather than silently
  accepted, with P2.3 geometry verification as the later backstop.
- The result carries no absolute machine paths and no PHI: diagnostics use
  basenames only, and `workerMetadata.parameters` reports locator kind and
  counts. An instance missing `StudyInstanceUID` is grouped under
  `studyInstanceUID: ""` and fails closed with
  `missing-required-tag:StudyInstanceUID`; no UID is invented.
- `-32010` extends the NuClear reserved server range and is ratified here with
  tests; transport envelope semantics from P2.1 are unchanged.
- The `python/dicom` modules are layered acyclically
  (`metadata` <- `classification` <- `aggregation`; `metadata` <- `sources`;
  `{aggregation, sources}` <- `scanner`), with `worker.dispatch` importing the
  scanner lazily inside `build_dispatcher()`.

## 4. Tests Added & Executed

- `npm run test:python` -> **70 passed** (0 failed, 0 skipped), up from the
  P2.1 baseline of 47. New coverage: classification tree for all six ratified
  cases, exact equality against the six committed expected files, non-axial CT
  rejection, mixed folder with non-DICOM skip, non-DICOM-only folder,
  `local-file-list` with `basePath`, `archive-entry` zip read, malformed
  locator `-32602`, five `-32010` source-failure paths, no-absolute-paths/PHI
  assertion, effective-parameter provenance, and manifest<->generator
  reconciliation.
- Ruff clean; mypy strict clean (21 source files); `npm run typecheck`,
  `npm test` (33/33), `npm run build` green.
- File-length gate: every source file <=250 lines (largest is
  `python/tests/test_worker_envelope.py` at 250).

## 5. Documentation, Agentlog & ADR Status

- `python/README.md` documents `nuclear.dicom.inspect`, the locator shapes,
  the `-32602`/`-32010` failure codes, the result shape and the full
  classification tree including the `AXIAL` requirement.
- `tests/fixtures/protocol/README.md` documents the two reserved codes
  (`-32001`, `-32010`) and the new fixture directory.
- No new ADR was required; the classification rules are NuClear-owned and
  covered by fixtures and tests.

## 6. Project Model Impact

- No `@nuclear/shared-types` contract or `.ncp` schema changed. The result
  vocabulary is aligned with the shared-types `Modality` set so the P2.5
  `ScientificWorkerBridge` can map series classifications to `AssetKind`
  without re-deriving DICOM rules.

## 7. Known Limitations & Technical Debt

- Classification uses the union of `ImageType`/`CorrectedImage` tokens across
  a series; a single `AXIAL` instance in an otherwise non-axial series would
  still be `ct-primary`. Mixed-orientation volumes will be rejected by the
  P2.3 geometry verification, which is the fail-closed backstop.
- `dicom.sources` imports `worker.protocol` for the error vocabulary; a future
  shared error-vocabulary module would remove this soft inversion.
- `python/dicom/geometry.py` and `quantitation.py` remain unimplemented
  (P2.3/P2.4); `python/dicom/__init__.py` now documents them as pending.
- Archive support is read-only ZIP via `zipfile`; no other archive formats are
  promised.

## 8. Exact Next Recommended Task

- **P2.3** (owner: `nuclear-scientific-engineer`): regular-grid geometry
  extraction in LPS mm with compatibility evidence — axial and oblique
  positive cases; irregular spacing, differing `FrameOfReferenceUID` and
  inconsistent `ImageOrientationPatient` failures. Do not start P2.4 until
  P2.3 review and QA evidence is recorded here.

---

## Gate Review & QA Evidence (P2.2)

- `nuclear-reviewer` first pass: **CONCERNS** — (1) CT-primary omitted the
  documented `AXIAL` token, plus low findings on `-32010` coverage and
  manifest-generator drift. Finding 2 was determined to be a **reviewer false
  positive**: the P2.1 manifest-driven `test_normative_fixture_round_trip`
  already replays `request.unknown-method.json` against
  `error.unknown-method.json` for full equality.
- `nuclear-reviewer` re-review: **PASS** — `AXIAL` requirement verified against
  the runbook, all low findings resolved, six expected fixtures byte-identical,
  all gates green.
- `nuclear-qa` re-verification: **PASS on all gates** — 70/70 Python tests,
  ruff, mypy strict, TS typecheck/tests/build, file length, fixture integrity
  (6 P2.2 established, P2.3/P2.4 still planned, protocol fixtures normative),
  and a live stdio check of both axial (`ct-primary`) and non-axial
  (`unsupported`/`non-primary-image-type`) CT. The AgentLog gate was pending at
  QA time and is satisfied by this report.

---

# Handover Report — P2.3: Regular-Grid Geometry & Compatibility Evidence

## 1. What Was Implemented

- **`nuclear.dicom.geometry`**: resolves a `SourceLocator` plus
  `seriesInstanceUID`, reads geometry tags metadata-only, and returns a
  deterministic regular-grid result: `dimensions=[columns,rows,slices]`,
  `spacing=[colSpacing,rowSpacing,sliceSpacing]` (DICOM `PixelSpacing [row,col]`
  swapped correctly), `origin` = `ImagePositionPatient` of the normalized
  slice 0, `direction` = `ImageOrientationPatient`, `sliceNormal = row x column`,
  `slicePositionsLpsMm`, and `bounds` as the axis-aligned envelope of the eight
  oriented outer corners using the Phase 1 `calculatePhysicalBounds` formula
  verbatim. Slice ordering is normalized so increasing index follows
  `+sliceNormal`, even when instances are stored unordered.
- **Dispositions are fail-closed**: `computed` (valid grid) or `rejected`
  (`missing-required-tag:<tag>`, `irregular-slice-spacing`,
  `inconsistent-orientation`, `gantry-tilt`, `duplicate-slice-position`,
  `insufficient-slices`, `inconsistent-pixel-spacing`) or `unavailable`
  (`series-not-found`). A geometry object is never emitted for an invalid grid;
  no averaging or reordering silently repairs data.
- **`nuclear.dicom.compatibility`**: pairwise evidence where
  `compatible = frameOfReference.equal AND orientation.coplanar`; spacing,
  origin and extent are reported as evidence only (PET and CT legitimately have
  different grids). Different Frame of Reference and non-coplanar orientation
  produce named incompatibilities; a rejected side propagates `status`/`side`/
  `reason`.
- **`geometricDigest`**: a documented NuClear v1 convention (`"sha256:"` over a
  sorted-key canonical JSON with fixed six-decimal floats), deterministic and
  geometry-sensitive.
- **Named, non-clinical tolerances**: `DIRECTION_COSINE_EPSILON = 1e-4` and
  `BOUNDS_EPSILON = 1e-5` align with the Phase 1 TS validators; the remaining
  spacing/collinearity/coplanarity epsilons are explicit floating-point
  comparison tolerances for deterministic synthetic fixtures. Real-world
  tolerance policy is explicitly deferred. `MIN_SLICES = 3` is documented as a
  structural requirement (a regular grid needs >=2 spacing intervals), not a
  clinical threshold; single/two-slice handling is deferred.
- **Verification-integrity correction**: the recorded mypy gate had been
  silently bypassing `python/pyproject.toml` from the repository root. The
  config is now executable and enforced: `requires-python`/mypy target
  reconciled to `>=3.12` (numpy/SimpleITK stubs use PEP 695 syntax unparseable
  at a 3.10 target), five strict test errors fixed, and a reproducible
  `npm run typecheck:python` added that pins `--config-file`.

## 2. Files Changed / Created

Created:
- `python/dicom/locators.py`, `geometry_math.py`, `geometry_metadata.py`,
  `geometry_validation.py`, `geometry.py`, `compatibility.py`,
  `geometry_operations.py`
- `python/tests/synthetic_common.py`, `synthetic_geometry.py`,
  `synthetic_geometry_invalid.py`, `test_dicom_geometry.py`
- `tests/fixtures/dicom/geometry/{axial-exact, oblique-exact,
  irregular-spacing, frame-of-reference-mismatch,
  orientation-inconsistent}.expected.json`

Modified:
- `python/dicom/{sources,metadata,scanner,__init__}.py` (generic source reader;
  locator parsing extracted)
- `python/tests/{synthetic_dicom,test_dicom_classification,
  test_fixture_manifest,test_package_baseline,test_worker_envelope,
  test_worker_handshake}.py`
- `python/worker/{protocol,dispatch}.py`; `python/README.md`;
  `python/pyproject.toml`; root `package.json`
- `tests/fixtures/manifest.json`;
  `tests/fixtures/protocol/{response.handshake.json,
  error.unknown-method.json, README.md}`
- `docs/agentlog/phase-2.md` (this handover)

Not modified: `packages/**`, `apps/**`, any TypeScript, `tests/contracts/**`.
Unrelated harness artifacts present in the working tree (`AGENTS.md` RAG block,
`.opencode/*`, `opencode-rag.json`) were deliberately not staged.

## 3. Architectural Assumptions Made

- Geometry conventions are owned by the Phase 1 NuClear contracts; Python
  reproduces them rather than redefining them, and the bounds function is
  cross-validated against the hand-authored Phase 1 `mockObliqueGeometry` and
  `mockCtGeometry` literals within a named `1e-9` epsilon.
- Rejections are explicit domain dispositions in the result, not transport
  errors; malformed params remain `-32602` and unreadable sources `-32010`.
- The `geometricDigest` is a NuClear v1 reproducibility convention, not a
  clinical claim.
- `python/dicom/sources.py` now takes an injectable reader so P2.2 and P2.3
  share folder/file-list/archive resolution without duplication.

## 4. Tests Added & Executed

- `npm run test:python` -> **90 passed** (0 failed, 0 skipped), up from 70 at
  P2.2. P2.3 adds 20: five committed-expectation cases, Phase 1 bounds
  cross-validation, slice-ordering normalization, six rejection reasons,
  unavailable series, `-32602` params, digest determinism/sensitivity,
  compatibility true/false/spacing-evidence, compatibility unavailable side,
  and no-absolute-paths/PHI.
- `npm run typecheck:python` -> config-aware strict mypy clean over 32 source
  files (enforcement independently probed by QA/reviewer).
- Ruff clean; `npm run typecheck`, `npm test` (33/33), `npm run build` green.
- File-length gate: every source file <=250 lines (largest exactly 250).

## 5. Documentation, Agentlog & ADR Status

- `python/README.md` documents both operations, the geometry convention, the
  digest, disposition statuses, the reason list, the named tolerances,
  `MIN_SLICES`, the `sliceSpacing` mean reduction, and the config-aware
  `typecheck:python` command.
- No new ADR was required; the conventions are already fixed by the Phase 1
  contracts and the `nuclear-dicom` runbook.

## 6. Project Model Impact

- No `@nuclear/shared-types` contract or `.ncp` schema changed. The geometry
  result field names and semantics match `AssetGeometry` so the P2.5 bridge can
  map it directly, and the new pairwise compatibility evidence can populate
  `GeometryVerificationSnapshot` later.

## 7. Known Limitations & Technical Debt

- `python/tests/test_dicom_geometry.py` is exactly 250 lines and
  `test_worker_envelope.py` is 249; further growth requires decomposition.
- `requires-python` was raised to `>=3.12` in this pre-release worker because
  dependency stubs forced the mypy target; the ruff lint target remains `py310`
  and is documented as a style target only.
- Compatibility compares slice-normal orientation only; full direction-cosine
  agreement and in-plane axis ordering are deferred and will be revisited with
  registration work.
- `quantitation.py` remains unimplemented (P2.4).

## 8. Exact Next Recommended Task

- **P2.4** (owner: `nuclear-scientific-engineer`): PET raw metadata extraction
  and `PetQuantitationResult` production — BQML positive result; missing
  weight/dose/time, unsupported units and invalid decay correction failures,
  with Python-only SUVbw provenance. Do not start P2.5 until P2.4 review and QA
  evidence is recorded here.

---

## Gate Review & QA Evidence (P2.3)

- `nuclear-reviewer` first pass: **CONCERNS** — (1) `MIN_SLICES = 3` rationale
  undocumented, plus low findings (malformed-tag reason wording, untested
  compatibility`unavailable` side, undocumented `sliceSpacing` mean). All
  corrected.
- `nuclear-reviewer` second pass: **CONCERNS (blocker)** — the mypy gate
  silently bypassed `python/pyproject.toml`; corrected by reconciling the
  Python floor/mypy target to 3.12, fixing five strict test errors, and adding
  a config-pinning `typecheck:python` script.
- `nuclear-reviewer` final pass: **PASS** — order and geometry conventions
  verified, config enforcement independently probed, eleven expected fixtures
  byte-identical, all gates green.
- `nuclear-qa` final re-verification: **PASS on gates 1–7** — 90/90 Python
  tests, config-aware strict mypy clean over 32 files (with a three-way probe
  proving the config is applied), ruff clean, 33/33 TS tests, build clean, file
  lengths <=250, fixture integrity, and live stdio checks (axial computed,
  irregular rejected, compatibility unavailable side). Gate 8 (AgentLog) was
  pending at QA time and is satisfied by this report.

---

# Handover Report — P2.3.1: Geometry Fail-Closed Hardening

## 1. What Was Implemented

An independent probe of the committed P2.3 geometry path found three real
fail-closed violations plus a transport JSON-validity gap. P2.3.1 closes all
of them.

- **Numeric validity (fail-closed)**: every `ImagePositionPatient`,
  `ImageOrientationPatient` and `PixelSpacing` component must be finite;
  `Rows` and `Columns` must be positive; every `PixelSpacing` component must be
  positive. Reasons: `non-finite-geometry`, `non-positive-dimensions`,
  `non-positive-pixel-spacing`.
- **Intra-series identity invariants**: `StudyInstanceUID`,
  `FrameOfReferenceUID` and `Modality` must be identical across the series and
  every `SOPInstanceUID` must be unique. Reasons: `inconsistent-study-uid`,
  `inconsistent-frame-of-reference`, `inconsistent-modality`,
  `duplicate-sop-instance-uid`.
- **Derived-value finiteness**: slice projections, consecutive spacing
  differences, the aggregated `sliceSpacing`, and the final
  `origin`/`spacing`/`sliceNormal`/`bounds` are re-checked for finiteness; any
  non-finite derived value is rejected with the named `non-finite-geometry`
  disposition instead of escaping to a generic internal error. This catches a
  crafted huge-but-finite `ImagePositionPatient` whose dot product overflows.
- **Deterministic validation order**: match series -> missing-required-tag ->
  identity -> insufficient-slices -> numeric -> orientation ->
  grid/pixel-spacing consistency -> ordering/duplicate/gantry/irregular ->
  derived finiteness -> computed. No rejection ever carries a `geometry` key.
- **Strict JSON boundary**: the stdio serializer uses
  `json.dumps(..., allow_nan=False)`, so a non-finite value can never be
  emitted as invalid JSON; the existing guard converts the resulting
  `ValueError` into a structured `-32603` and the worker stays alive. Incoming
  `NaN`/`Infinity`/`-Infinity` constants are rejected at parse time as
  `-32700`, conforming to JSON-RPC 2.0 / RFC 8259.
- **Committed negative fixtures**: seven DICOM negative fixtures in the first
  pass plus one derived-overflow fixture, all manifest-indexed as
  `established` with generator and expected output.

## 2. Files Changed / Created

Created:
- `python/tests/test_dicom_geometry_hardening.py`,
  `python/tests/test_worker_json_validity.py`
- `tests/fixtures/dicom/geometry/{non-finite-coordinate,
  non-finite-derived, non-positive-dimensions, non-positive-pixel-spacing,
  inconsistent-study-uid, inconsistent-frame-of-reference,
  inconsistent-modality, duplicate-sop-instance-uid}.expected.json`

Modified:
- `python/dicom/{geometry,geometry_validation,geometry_metadata}.py`
- `python/worker/{stdio,envelope}.py`
- `python/tests/{synthetic_geometry_invalid,test_dicom_geometry}.py`
- `python/README.md`; `tests/fixtures/manifest.json`
- `docs/agentlog/phase-2.md` (this handover)

Not modified: `packages/**`, `apps/**`, any TypeScript; the eleven
pre-existing expected fixtures (6 classification + 5 geometry) are
byte-identical.

## 3. Architectural Assumptions Made

- `AssetGeometry` requires positive dimensions/spacing and finite values, so
  these checks belong at the geometry boundary, not only at serialization.
- All geometry rejections remain explicit domain dispositions
  (`status:"rejected"` with a named reason and diagnostic), not transport
  errors; malformed params stay `-32602` and unreadable sources `-32010`.
- Strict JSON is a transport conformance requirement, not a new protocol
  feature: JSON-RPC 2.0 forbids `NaN`/`Infinity`.
- The transport `allow_nan=False` guard is defence-in-depth; the primary
  guarantee is the domain validation.

## 4. Tests Added & Executed

- `npm run test:python` -> **105 passed** (0 failed, 0 skipped), from 90 at
  P2.3. Adds 15 tests: eight committed negative-fixture rejections
  (non-positive pixel spacing/dimensions, non-finite coordinate, non-finite
  derived, inconsistent study/FoR/modality, duplicate SOP), computed-geometry
  strict-JSON round-trip, a direct negative-spacing unit check, full
  `geometry.*` manifest reconciliation, stdio non-finite -> `-32603` survival,
  and incoming `NaN`/`Infinity`/`-Infinity` -> `-32700`.
- `npm run typecheck:python` -> strict mypy clean over 34 source files.
- Ruff clean; `npm run typecheck`, `npm test` (33/33), `npm run build` green.
- File-length gate: every source file <=250 lines.

## 5. Documentation, Agentlog & ADR Status

- `python/README.md` documents the new reasons, the deterministic validation
  order including derived finiteness, strict outgoing JSON, and incoming
  `NaN`/`Infinity` rejection.
- No new ADR: the changes enforce existing NuClear invariants and RFC 8259
  conformance.

## 6. Project Model Impact

- No contract or `.ncp` schema change. Computed geometry is now guaranteed
  finite and positive before the P2.5 bridge can map it to `AssetGeometry`.

## 7. Known Limitations & Technical Debt

- `python/tests/test_worker_envelope.py` remains at 249 lines and
  `python/dicom/geometry.py` at 239; further growth requires decomposition.
- A crafted extreme offset (~1e200) in the collinearity check can overflow to
  `inf` and reject as `gantry-tilt` rather than `non-finite-geometry`; the
  disposition is still fail-closed with no `geometry` key, and the input is
  unreachable in real patient-space coordinates (recorded for completeness).
- The seven first-pass fixtures carry `ownerSlice:"P2.3"` (phase-level
  convention; no `P2.x.y` slice ids exist in the manifest).

## 8. Exact Next Recommended Task

- **P2.4** (owner: `nuclear-scientific-engineer`): PET raw metadata extraction
  and `PetQuantitationResult` production — BQML positive result; missing
  weight/dose/time, unsupported units and invalid decay correction failures,
  with Python-only SUVbw provenance. Do not start P2.5 until P2.4 review and QA
  evidence is recorded here.

---

## Gate Review & QA Evidence (P2.3.1)

- `nuclear-reviewer` first pass: **CONCERNS** — (1) commit-hygiene warning to
  exclude out-of-scope working-tree tooling artifacts (honoured: strictly
  selective staging), (2) derived slice spacing not explicitly finite-guarded.
- `nuclear-reviewer` final pass: **PASS** — derived finiteness verified at all
  four stages, overflow fixture genuine, precedence unchanged, gates green.
- `nuclear-qa` first pass: **7/8 PASS**, AgentLog pending.
- `nuclear-qa` final pass: **all gates PASS** — 105/105 Python tests,
  config-aware strict mypy over 34 files, ruff clean, 33/33 TS tests, build
  clean, file lengths <=250, 19 expected fixtures (6 classification +
  13 geometry) with the 11 git-tracked ones byte-identical to 6b48763, four
  `quantitation.*` still planned, live transport checks (NaN -> `-32700`,
  process survives, stdout token-free). AgentLog was pending at QA time and is
  satisfied by this report.

---

# Handover Report — P2.4: PET Raw Metadata & `PetQuantitationResult`

## 1. What Was Implemented

- **`nuclear.quantitation.suvbw` operation**: resolves a `SourceLocator` plus
  `seriesInstanceUID`, reads PET acquisition tags metadata-only, and produces a
  Python `PetQuantitationResult` whose core fields match the Phase 1 TypeScript
  contract: `method:"suv-bw"`, `status` in `computed|invalid|unavailable`,
  `suvFactor` (g/Bq) present only when computed, `diagnostic` only when not,
  plus `workerMetadata`.
- **Authoritative formula** (nuclear-dicom runbook §C, implemented verbatim,
  no SUV value and no pixels):
  `elapsedSeconds = SeriesTime - RadiopharmaceuticalStartTime` (same day);
  `decayedDoseBq = RadionuclideTotalDose * exp(-ln2 * elapsed / RadionuclideHalfLife)`;
  `suvFactor = PatientWeightKg * 1000 / decayedDoseBq`.
- **Fail-closed dispositions**: absent required tags
  (`PatientWeight`, `RadionuclideTotalDose`, `RadionuclideHalfLife`,
  `RadiopharmaceuticalStartTime`, `SeriesTime`, `Units`, `DecayCorrection`)
  -> `unavailable`/`missing-required-tag:<Tag>`; present-but-unusable ->
  `invalid` (`unsupported-units`, `invalid-decay-correction`,
  `non-positive-patient-weight`, `non-positive-total-dose`,
  `non-positive-half-life`, `unparseable-time`, `negative-elapsed-time`,
  `inconsistent-pet-metadata`, `non-finite-pet-metadata`,
  `non-positive-decayed-dose`, `non-finite-suv-factor`); `series-not-found`
  and `not-a-pet-series` -> `unavailable`. No plausible fallback and no
  non-finite `suvFactor` is ever emitted.
- **Deterministic modality handling**: uniformly non-PT -> `not-a-pet-series`;
  disagreeing modalities within one series -> `inconsistent-pet-metadata`,
  independent of on-disk scan order.
- **Named, non-clinical tolerances**: `SUV_FACTOR_RELATIVE_TOLERANCE`,
  `ELAPSED_SECONDS_EPSILON`, `PET_METADATA_RELATIVE_TOLERANCE`.

## 2. Files Changed / Created

Created:
- `python/dicom/pet_metadata.py`, `quantitation_math.py`,
  `quantitation_validation.py`, `quantitation.py`,
  `quantitation_operations.py`
- `python/tests/synthetic_pet.py`, `test_dicom_quantitation.py`
- `tests/fixtures/dicom/quantitation/{suvbw-bqml, missing-metadata,
  unsupported-units, invalid-decay-correction}.expected.json`

Modified:
- `python/dicom/{metadata,__init__}.py`; `python/worker/{protocol,dispatch}.py`
- `python/tests/{synthetic_common,test_fixture_manifest,test_worker_envelope,
  test_worker_handshake}.py`
- `python/README.md`; `tests/fixtures/manifest.json`;
  `tests/fixtures/protocol/{response.handshake.json,
  error.unknown-method.json, README.md}`
- `docs/agentlog/phase-2.md` (this handover)

Not modified: `packages/**`, `apps/**`, any TypeScript; the 19 pre-existing
expected fixtures (6 classification + 13 geometry) are byte-identical.

## 3. Architectural Assumptions Made

- Python is authoritative for SUVbw; TypeScript performs envelope and contract
  validation only and does not duplicate the formula.
- Absent metadata is `unavailable`; present-but-unusable metadata is `invalid`.
  Both are explicit results, never a fallback.
- Elapsed time uses `SeriesTime - RadiopharmaceuticalStartTime` on a same-day
  assumption; a negative elapsed time fails closed as `invalid` and
  cross-midnight handling is explicitly deferred rather than invented.
- A decayed dose that underflows to `<= 0` is rejected with the named
  `non-positive-decayed-dose` disposition before the division, so no
  `ZeroDivisionError` can escape as a generic internal error.
- `suvFactor` is a scaling factor in g/Bq; the activity-concentration
  multiplication requires pixels and belongs outside this phase.

## 4. Tests Added & Executed

- `npm run test:python` -> **133 passed** (0 failed, 0 skipped), from 105 at
  P2.3.1. Adds 28 tests: four committed-expectation cases, decay/factor
  identities at Δt=0 (`suvFactor == weight_g/totalDose`) and Δt=T½
  (`decayed == totalDose/2`), per-tag missing cases, non-positive
  weight/dose/half-life, unparseable and negative time, unsupported units,
  invalid decay correction, inconsistent and mixed-modality series,
  non-finite input, decay underflow, denormal factor, series-not-found
  (`studyInstanceUID: null`), not-a-pet-series, `-32602` params, no absolute
  paths/PHI, strict-JSON round-trip, manifest reconciliation.
- `npm run typecheck:python` -> strict mypy clean over 41 source files.
- Ruff clean; `npm run typecheck`, `npm test` (33/33), `npm run build` green.
- File-length gate: every source file <=250 lines (`quantitation.py` reduced
  from 248 to 208 by extracting `quantitation_validation.py`).

## 5. Documentation, Agentlog & ADR Status

- `python/README.md` documents the operation, the formula with explicit g/Bq
  units, the status/reason vocabulary, the same-day deferral, the underflow
  guard, modality determinism and the named tolerances.
- No new ADR: the formula is already NuClear-owned in the `nuclear-dicom`
  runbook and the result contract exists in `@nuclear/shared-types`.

## 6. Project Model Impact

- No contract or `.ncp` schema change. The Python result is shaped so the P2.5
  `ScientificWorkerBridge` can map `method`/`status`/`suvFactor`/`diagnostic`
  and `petAcquisition` directly onto `PetQuantitationResult` and
  `PetAcquisitionMetadata`.

## 7. Known Limitations & Technical Debt

- Cross-midnight / date-aware decay correction is not implemented; negative
  elapsed time fails closed and the deferral is documented.
- Only `Units == BQML` is supported; `CNTS`/`GML` are explicit
  `unsupported-units` failures, not converted.
- `python/tests/test_worker_envelope.py` remains at 249 lines and
  `test_dicom_quantitation.py` at 247; further growth requires decomposition.
- `quantitation.py` docstring summarises the order as "modality" before the
  modality-consistency predicate; cosmetically imprecise (no behavioural
  impact), noted by the reviewer.

## 8. Exact Next Recommended Task

- **P2.5** (owner: `nuclear-engine-engineer` per the runbook, after P2.1–P2.4
  protocol responses are accepted): implement the TypeScript
  `ScientificWorkerBridge` facade in `@nuclear/medical-engine` — correlation,
  timeout, restart, typed mapping of the four operations to NuClear contracts,
  provenance preservation, and a test proving no formula is duplicated in
  TypeScript. Do not start P2.6 until P2.5 review and QA evidence is recorded
  here.

---

## Gate Review & QA Evidence (P2.4)

- `nuclear-reviewer` first pass: **CONCERNS** — (1) HIGH: decay underflow to
  zero divided by zero and surfaced as a generic `-32603` instead of the named
  `invalid` disposition; (2) LOW: mixed-modality series was scan-order
  dependent; (3) INFO: `series-not-found` emitted `studyInstanceUID: ""`.
  All corrected.
- `nuclear-reviewer` final pass: **PASS** — underflow guard precedes division
  with the named `non-positive-decayed-dose` reason, the denormal
  `non-finite-suv-factor` path is reachable and tested, modality resolution is
  order-independent, formula fidelity and the `suvFactor`-only-when-computed
  contract are unaffected.
- `nuclear-qa` first pass: **7/8 PASS**, AgentLog pending.
- `nuclear-qa` final pass: **all gates PASS** — 133/133 Python tests,
  config-aware strict mypy over 41 files, ruff clean, 33/33 TS tests, build
  clean, file lengths <=250, 33 established / 0 planned fixtures with the 19
  pre-existing expected fixtures byte-identical, protocol 5-operation list, and
  live reproduction of the BQML positive (independently recomputed within
  1e-12), missing-metadata, unsupported-units, invalid-decay, underflow,
  mixed-modality and series-not-found cases. AgentLog was pending at QA time
  and is satisfied by this report.

---

# Handover Report — P2.4.1: PET DICOM Extraction/Interpretation Conformance

## 1. What Was Implemented

A DICOM-conformance review rejected the committed P2.4 extraction: the numeric
and fail-closed work was sound, but dose/half-life/administration time were read
from the dataset root instead of `RadiopharmaceuticalInformationSequence`
(0054,0016); `ADMIN` used the same formula as `START`; `SeriesTime` was treated
as acquisition start; and intra-series Study/SOP invariants were missing. The
synthetic fixtures encoded the wrong structure, so green tests certified the
wrong path. P2.4.1 corrects extraction and interpretation; the arithmetic in
`quantitation_math.py` is unchanged.

- **Sequence-located extraction** (DICOM PS3.3 C.8.9.2): `RadionuclideTotalDose`
  (0018,1074), `RadionuclideHalfLife` (0018,1075) and
  `RadiopharmaceuticalStartDateTime` (0018,1078) are read only from a single
  item of `RadiopharmaceuticalInformationSequence` (0054,0016). Root-level
  placement does not satisfy the requirement; absent/empty sequence ->
  `unavailable`/`missing-required-tag:RadiopharmaceuticalInformationSequence`;
  more than one item -> `invalid`/`ambiguous-radiopharmaceutical-information`
  (no silent selection).
- **START-only decay correction** (C.8.9.1.1.5): `START` decays to the
  acquisition start time; `ADMIN` decays to administration time and is a
  different reference event, so v1 rejects it explicitly with
  `unsupported-decay-correction`. `NONE`/other -> `invalid-decay-correction`.
- **Date-aware acquisition timestamp**: `AcquisitionDateTime` (0008,002A), else
  `AcquisitionDate` (0008,0022) + `AcquisitionTime` (0008,0032). `Series
  Date/Time` are never used as acquisition start (C.8.9.1.1.2: implementation
  dependent). Administration uses `RadiopharmaceuticalStartDateTime`; the
  deprecated time-only `RadiopharmaceuticalStartTime` is not used.
  `elapsedSeconds = acquisitionStart - administration`.
- **Time-base fail-closed**: a mix of offset-aware and offset-less DT values is
  ambiguous and rejected as `invalid`/`ambiguous-time-base`, closing a fail-open
  path that otherwise produced a wrong computed factor.
- **Intra-series invariants**: consistent `StudyInstanceUID`
  (`inconsistent-study-uid`), missing `StudyInstanceUID`
  (`missing-required-tag:StudyInstanceUID`, `studyInstanceUID: null`), unique
  `SOPInstanceUID` (`duplicate-sop-instance-uid`), plus the existing
  modality/units/decay/timing/numeric consistency.
- **Contract correction**: `PetAcquisitionMetadata` now declares
  `radiopharmaceuticalStartDateTime`, `acquisitionDateTime` and
  `patientWeightKg` (the exact SUVbw input), removing the incorrect
  `radiopharmaceuticalStartTime`/`seriesTime` fields; the authoritative
  `nuclear-dicom` runbook §C was corrected to match.
- **Conformant fixtures**: the synthetic PET writers build a one-item
  `RadiopharmaceuticalInformationSequence`; 13 committed quantitation expected
  outputs (4 regenerated + 9 new negatives/fallback).

## 2. Files Changed / Created

Created:
- `python/tests/test_dicom_quantitation_conformance.py`,
  `python/tests/test_dicom_quantitation_negatives.py`
- `tests/fixtures/dicom/quantitation/{missing-sequence,
  ambiguous-radiopharmaceutical-information, missing-dose, missing-half-life,
  missing-start-datetime, unsupported-decay-correction, inconsistent-study-uid,
  duplicate-sop-instance-uid, suvbw-datetime-fallback}.expected.json`

Modified:
- `python/dicom/{pet_metadata,quantitation_math,quantitation_validation,
  quantitation}.py`; `python/tests/{synthetic_common,synthetic_pet,
  test_dicom_quantitation}.py`
- `python/README.md`; `tests/fixtures/manifest.json`;
  four regenerated `tests/fixtures/dicom/quantitation/*.expected.json`
- `packages/shared-types/src/asset.ts`; `tests/contracts/validators.ts`;
  `tests/fixtures/clinical-contracts.fixture.ts`
- `.agents/skills/nuclear-dicom/SKILL.md` §C
- `docs/agentlog/phase-2.md` (this handover)

Not modified: `apps/**`, any rendering code; the 19 classification/geometry
expected fixtures are byte-identical.

## 3. Architectural Assumptions Made

- DICOM PS3.3 C.8.9 is the interpretation authority; where the previous runbook
  contradicted it, the runbook was corrected rather than preserving the defect.
- v1 supports exactly one radiopharmaceutical information item and only
  `START`; alternatives fail closed with named dispositions, not silent
  selection or a reused formula.
- `Series Date/Time` are not a real-world event and are never used for
  acquisition timing.
- Weight is recorded in `PetAcquisitionMetadata` as the exact factor input, in
  addition to `PatientReference.patientWeightKg`, for reproducibility.
- `PatientWeight` remains the only accepted body-weight basis in v1 (SUVbw).

## 4. Tests Added & Executed

- `npm run test:python` -> **164 passed** (0 failed, 0 skipped), from 133 at
  P2.4. Adds: conformant-positive field/unit checks, root-only regression,
  ambiguous sequence, missing dose/half-life/StartDateTime, SeriesTime-only
  exclusion, deprecated time-only exclusion, legacy root tags ignored,
  `ADMIN` rejection, DA+TM fallback, mixed timezone rejection, offset-aware
  computing, missing StudyInstanceUID, mixed Study UID, duplicate SOP UID,
  DT fractional/offset parsing, and decay identities at Δt=0 and Δt=T½ using
  acquisition − administration.
- `npm run typecheck:python` -> strict mypy clean over 43 source files.
- Ruff clean; `npm run typecheck`, `npm test` (33/33), `npm run build` green.
- File-length gate: every source file <=250 lines.

## 5. Documentation, Agentlog & ADR Status

- `python/README.md` documents sequence location, the exact-one-item rule, the
  START-only policy and ADMIN deferral, timestamp sources, the same-time-base
  rule, the new reasons and the result field names.
- `.agents/skills/nuclear-dicom/SKILL.md` §C now matches DICOM PS3.3 and the
  implementation, so future agents cannot re-import the corrected behaviour.
- `PetAcquisitionMetadata` was corrected; no `.ncp` schema version exists yet
  and no persisted projects exist, so no migration is required. Recorded here
  as a pre-release contract correction.

## 6. Project Model Impact

- The Python `petAcquisition` evidence key set now exactly equals the
  TypeScript `PetAcquisitionMetadata` key set (7 keys), so the P2.5 bridge can
  map it without silent drops. No `.ncp` schema file changed.

## 7. Known Limitations & Technical Debt

- The deprecated time-only `RadiopharmaceuticalStartTime` reconstruction is
  deferred; such datasets return `unavailable`.
- `ADMIN` decay correction is explicitly unsupported in v1.
- Negative elapsed time (cross-midnight in the negative direction) remains
  deferred and fails closed; date-aware DT parsing handles positive
  cross-midnight spans.
- `python/tests/test_worker_envelope.py` remains at 249 lines; further growth
  requires decomposition.
- `emit_diagnostics` remains duplicated between `pet_metadata.py` and
  `geometry_metadata.py` (pre-existing); a shared helper is future cleanup.

## 8. Exact Next Recommended Task

- **P2.5** (owner: `nuclear-engine-engineer` per the runbook, after P2.1–P2.4.1
  protocol responses are accepted): implement the TypeScript
  `ScientificWorkerBridge` facade in `@nuclear/medical-engine` — correlation,
  timeout, restart, typed mapping of the five operations to NuClear contracts,
  provenance preservation, and a test proving no formula is duplicated in
  TypeScript. Do not start P2.6 until P2.5 review and QA evidence is recorded
  here.

---

## Gate Review & QA Evidence (P2.4.1)

- `nuclear-reviewer` first pass: **CONCERNS** — (1) MEDIUM fail-open mixed
  timezone conventions produced a wrong computed factor; (2) MEDIUM the
  authoritative runbook still contradicted the code; low findings on confounded
  exclusion tests, untested DA+TM fallback / dead helpers, missing
  `StudyInstanceUID` handling, and stale wording/asserts. All corrected.
- `nuclear-reviewer` final pass: **PASS** — every finding resolved and the
  full pipeline re-verified; contract parity exact.
- `nuclear-qa` first pass: **7/8 PASS**, AgentLog pending, with the
  `patientWeightKg` contract-parity finding.
- `nuclear-qa` final pass: **all gates PASS** — 164/164 Python tests,
  config-aware strict mypy over 43 files, ruff clean, 33/33 TS tests, build
  clean, file lengths <=250, 13 quantitation fixtures established, the 19
  classification/geometry fixtures byte-identical, no planned fixtures, and a
  live dispatcher reproduction of all ten conformant/negative scenarios with
  the independent formula match within 1e-12. The AgentLog gate was pending at
  QA time and is satisfied by this report.

---

# Handover Report — P2.4.2: DT Offset, PET Finiteness and Type-Guard Gaps

## 1. What Was Implemented

A micro corrective slice closing three consistency gaps identified after
P2.4.1, so the P2.5 bridge does not inherit them.

- **DICOM DT offset range** (`python/dicom/quantitation_math.py`): offset-less
  values remain interpreted in a single deterministic time base, but an
  explicit `&ZZXX` suffix is now validated per DICOM PS3.5 §6.2 — minutes
  `00`-`59`; positive hours `00`-`14` (hours `14` only with minutes `00`);
  negative hours `00`-`12` (hours `12` only with minutes `00`); `-0000` is
  forbidden; `+0000` is the UTC offset. An invalid suffix invalidates the whole
  DT, surfacing as `invalid`/`unparseable-time`.
- **PET numeric finiteness** (`tests/contracts/validators.ts`):
  `isPetAcquisitionMetadata` now requires `Number.isFinite` (in addition to
  `> 0`) for `radionuclideHalfLifeSeconds`, `radionuclideTotalDoseBq` and
  `patientWeightKg`, rejecting `Infinity`/`NaN`.
- **Asset-level PET validation** (`tests/contracts/validators.ts`):
  `isImagingAsset` now validates `metadata.pet` through
  `isPetAcquisitionMetadata` when present, alongside the existing
  `petQuantitation` check.

## 2. Files Changed / Created

Modified:
- `python/dicom/quantitation_math.py` (offset validation + docstring)
- `python/tests/test_dicom_quantitation_conformance.py` (offset boundary
  accept/reject cases, pipeline-level invalid-offset -> `unparseable-time`
  test, and an explicit expected-warning assertion for the intentionally
  non-conformant DT)
- `tests/contracts/validators.ts` (finite guards; `isImagingAsset` pet check)
- `tests/contracts/clinical-data-contracts.test.ts` (two new tests)
- `docs/agentlog/phase-2.md` (this handover)

Not modified: the PET contract (`packages/shared-types/src/asset.ts`), the
`PetQuantitationResult` guard, and all expected fixtures.

## 3. Architectural Assumptions Made

- DICOM PS3.5 §6.2 is the authority for the DT offset range; the parser fails
  closed on any non-conformant suffix rather than normalising it.
- `Infinity`/`NaN` are never valid physical PET inputs, so structural guards
  must reject them even though JavaScript comparisons like `Infinity > 0` pass.
- `isImagingAsset` is the platform-level type guard for a persisted asset;
  a malformed nested `pet` block must not type-guard true.

## 4. Tests Added & Executed

- `npm run test:python` -> **166 passed** (0 failed, 0 skipped), up from 165:
  expanded offset reject boundaries (`+2300`, `+1401`, `+0560`, `-0000`,
  `-1300`, `-1230`) and a pipeline-level invalid-offset test asserting
  `invalid`/`unparseable-time` with no `suvFactor`.
- `npm test` -> **35 passed** (up from 33): rejects `Infinity`/`NaN` for all
  three PET numeric fields, and rejects an `ImagingAsset` whose
  `metadata.pet.patientWeightKg` is non-finite while accepting the valid
  fixture.
- `npm run typecheck:python` strict clean (43 files); ruff clean;
  `npm run typecheck` and `npm run build` clean.
- File-length gate: all Python source files <=250 lines;
  `clinical-data-contracts.test.ts` is at 294/300 (watch item).

## 5. Documentation, Agentlog & ADR Status

- The DT offset rule is documented in the `quantitation_math.py` docstring with
  the DICOM PS3.5 §6.2 citation and in the runbook §C context.
- No new ADR: these are conformance fixes to existing rules.

## 6. Project Model Impact

- None. No contract, fixture or `.ncp` schema changed; only validation
  strictness increased.

## 7. Known Limitations & Technical Debt

- `tests/contracts/clinical-data-contracts.test.ts` is at 294 lines; the next
  added test requires decomposing that suite (Rule 02).
- Offset-less and offset-aware DTs are still reconciled through the explicit
  `ambiguous-time-base` rejection rather than inferred local time zones; that
  convention is unchanged and documented.

## 8. Exact Next Recommended Task

- **P2.5** (owner: `nuclear-engine-engineer` per the runbook, after P2.1–P2.4.2
  protocol responses are accepted): implement the TypeScript
  `ScientificWorkerBridge` facade in `@nuclear/medical-engine` — correlation,
  timeout, restart, typed mapping of the five operations to NuClear contracts,
  provenance preservation, and a test proving no formula is duplicated in
  TypeScript. Do not start P2.6 until P2.5 review and QA evidence is recorded
  here.

---

## Gate Review & QA Evidence (P2.4.2)

- `nuclear-reviewer`: **PASS** — offset range and sign/limit branches verified
  against PS3.5 §6.2, both TS guards verified, scope bounded to three fixes,
  no new dependency, fixtures untouched. Two non-blocking evidence gaps
  (missing `-13xx`/`+05xx` reject cases and no pipeline-level invalid-offset
  test) were closed by the orchestrator with additive Python-only tests.
- `nuclear-qa`: **all executable gates PASS** — 166/166 Python tests, strict
  mypy over 43 files, ruff clean, 35/35 TS tests, typecheck and build clean,
  file lengths within limits, DT boundaries and TS guards independently
  reproduced, all expected fixtures unchanged. AgentLog was pending at QA time
  and is satisfied by this report.
