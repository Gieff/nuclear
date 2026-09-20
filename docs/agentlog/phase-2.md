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
- **REPOSITORY TOOLING — COMPLETE** (2026-09-20). OpenCodeRAG integration and
  `npm run bump` version-synchronization script added.
- **RELEASE v0.1.1 — COMPLETE** (2026-09-20). Monorepo synchronized to 0.1.1
  with CHANGELOG promotion and annotated tag.
- **P2.5 — COMPLETE** (2026-09-20). TypeScript `ScientificWorkerBridge` facade
  in `@nuclear/medical-engine` implemented and ratified: local worker
  lifecycle/handshake, request correlation, per-request timeout, bounded
  restart/backoff, typed provenance-preserving mapping of the five operations
  to NuClear contracts, and a no-duplicated-formula guard. Independent
  `nuclear-reviewer` PASS (after one CONCERN resolved) and `nuclear-qa` all
  applicable gates PASS.
- **P2.6 — COMPLETE** (2026-09-20). Phase-level independent review and QA
  audit closed Phase 2: all applicable gates PASS, docs generation executed,
  and this consolidated phase handover recorded.
- **RELEASE v0.1.2 — COMPLETE** (2026-09-20). Monorepo synchronized to 0.1.2,
  `CHANGELOG.md` promoted with the Phase 2 bridge capability, and the annotated
  `v0.1.2` tag created locally. Push left to the user.
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

---

# Handover Report — Repository Tooling: OpenCodeRAG & Version Bump Script

## 1. What Was Implemented

- **OpenCodeRAG integration** for NuClear: workspace config
  (`opencode-rag.json`), OpenCode plugin wrappers
  (`.opencode/plugins/rag-plugin.js`, `.opencode/plugins/rag-tui.js`), TUI
  plugin registration (`.opencode/tui.json`), the `opencode-rag` skill
  (`.opencode/skills/opencode-rag/SKILL.md`), the always-active
  "Code Navigation" block in `AGENTS.md`, and workspace-state ignores.
- **Monorepo version synchronization script** `scripts/bump-version.mjs`
  exposed as `npm run bump <version> [--dry-run]`. It updates the root and all
  workspace `package.json` files, synchronizes internal `@nuclear/*`
  dependency ranges, updates `python/pyproject.toml`,
  `python/dicom/__init__.py`, `python/worker/__init__.py`, the ratified
  `tests/fixtures/protocol/response.handshake.json` workerVersion, and the
  provisioned Python venv dist-info when present.

## 2. Files Changed / Created

Created:
- `scripts/bump-version.mjs`
- `opencode-rag.json`
- `.opencode/opencode.json`, `.opencode/tui.json`,
  `.opencode/plugins/rag-plugin.js`, `.opencode/plugins/rag-tui.js`,
  `.opencode/skills/opencode-rag/SKILL.md`

Modified:
- `package.json` (adds the `bump` script)
- `.gitignore` (OpenCode workspace-state ignores)
- `AGENTS.md` (appended Code Navigation block)
- `docs/agentlog/phase-2.md` (this handover)

## 3. Architectural Assumptions Made

- OpenCodeRAG is local developer tooling, not a product dependency: it uses a
  local Ollama endpoint (`127.0.0.1:11434`), its vector store lives in the
  ignored `.opencode/rag_db/`, and it never enters the runtime dependency graph
  of the NuClear workstation.
- The bump script is the single supported path for version changes (Rule 03),
  keeping the Python worker version and the ratified handshake fixture in lock
  step with the npm workspaces.

## 4. Verification Executed

- `node scripts/bump-version.mjs 0.1.1 --dry-run` reported the full file set
  before any write.
- Secret scan over the new config/plugin/skill files: no credentials or tokens
  (only local loopback endpoints).
- The real bump was subsequently exercised by the v0.1.1 release (see next
  handover): `dist`/`dicom`/`worker` metadata all reported 0.1.1.

## 5. Documentation, Agentlog & ADR Status

- `AGENTS.md` documents the Code Navigation workflow; `.opencode/skills/`
  carries the on-demand skill body.
- No ADR was required: this is developer tooling, not clinical or architectural
  behaviour.

## 6. Project Model Impact

- None. No contract, fixture semantics or `.ncp` schema changed.

## 7. Known Limitations & Technical Debt

- **RAG plugin provisioning gap**: `.opencode/plugins/*` import
  `opencode-rag-plugin` from the gitignored `.opencode/node_modules`, but
  `.opencode/package.json` (also gitignored) declares only
  `@opencode-ai/plugin`. A fresh clone would need the plugin installed
  manually; declaring it and committing the `.opencode` manifest/lockfile is
  the recommended follow-up.
- The root `.gitignore` additions duplicate `.opencode/.gitignore` (harmless).
- `bump-version.mjs` does not update the root `package-lock.json` (synced
  manually for v0.1.1) nor the version literals used as synthetic fixture data
  in `tests/fixtures/*.ts` (cosmetic, not asserted).

## 8. Exact Next Recommended Task

- Extend `bump-version.mjs` to rewrite the root `package-lock.json` (or shell
  out to `npm install --package-lock-only`) so the release flow is one command.

---

# Handover Report — Release: Monorepo v0.1.1

## 1. What Was Implemented

- Ran the governed release flow: `npm run bump 0.1.1` synchronized every
  workspace `package.json`, internal `@nuclear/*` ranges, Python package
  versions, and the ratified handshake fixture; the root `package-lock.json`
  was reconciled with `npm install --package-lock-only`.
- Promoted `CHANGELOG.md` from the agentlog via the changelog writer, recording
  the v0.1.0 milestone and the v0.1.1 release window (P2.1–P2.4.2 and the
  repository tooling).
- Created the annotated tag `v0.1.1` after the changelog and agentlog were in
  place.

## 2. Files Changed / Created

- `package.json`, `package-lock.json`, `packages/*/package.json`
- `python/pyproject.toml`, `python/dicom/__init__.py`,
  `python/worker/__init__.py`
- `tests/fixtures/protocol/response.handshake.json`
- `CHANGELOG.md`, `docs/agentlog/phase-2.md`

## 3. Architectural Assumptions Made

- A release tag is only valid once the agentlog and changelog reflect the
  release window; the tag is created after those artifacts, not before.
- The version is the single monorepo SemVer; the Python worker versions track
  it so worker provenance and the handshake fixture stay consistent.

## 4. Tests Added & Executed

- After the bump: `npm run test:python` -> **166 passed**; strict mypy clean
  (43 files); ruff clean; `npm run typecheck` clean; `npm test` -> **35
  passed**; `npm run build` clean.
- Version consistency verified: `importlib.metadata.version('nuclear-scientific')`,
  `dicom.__version__` and `worker.__version__` all report `0.1.1`.

## 5. Documentation, Agentlog & ADR Status

- `CHANGELOG.md` promoted (see the promotion commit); `docs/agentlog/phase-2.md`
  extended with the tooling and release handovers.
- No ADR required.

## 6. Project Model Impact

- None. Only version metadata changed; no contract or schema change.

## 7. Known Limitations & Technical Debt

- The `v0.1.0` changelog section was backfilled from the previously
  `[Unreleased]` Phase 1 content because the earlier milestone was tagged
  without a promotion; future releases must run the promotion first.

## 8. Exact Next Recommended Task

- Resume **P2.5**: the TypeScript `ScientificWorkerBridge` in
  `@nuclear/medical-engine` (correlation, timeout, restart, typed mapping of
  the five operations, provenance preservation, no duplicated formula).

---

# Handover Report — P2.5: `ScientificWorkerBridge` Facade

## 1. What Was Implemented

A headless, UI-agnostic `ScientificWorkerBridge` in `@nuclear/medical-engine`,
the only TypeScript consumer of the ADR-002 worker protocol. It performs no
scientific computation; it maps worker results verbatim.

- **Lifecycle** (`worker/supervisor.ts`, `worker/process.ts`): spawns and
  supervises the local worker through `node:child_process` with a default
  command of `python/worker/.venv/bin/python -m worker` (cwd `process.cwd()`,
  overridable). `start()` is idempotent and single-flight; `stop()` ends stdin,
  waits a named grace period, then SIGKILLs. No Electron/React/DOM dependency.
  The six-point supervisor contract from `python/worker/stdio.py` is preserved:
  stateless across records, safely restartable, stdout protocol-only, stderr
  diagnostics-only.
- **Handshake** (`worker/protocol.ts`): calls `nuclear.protocol.handshake` and
  requires the envelope `protocolVersion === "1.0"`, that
  `result.protocolVersions` includes `"1.0"`, and that all four scientific
  operations (`inspect`, `geometry`, `compatibility`, `quantitation`) are
  advertised. Any mismatch or missing operation throws a structured
  `WorkerHandshakeError`, sets availability `failed`, and never falls back.
- **Correlation** (`worker/process.ts`): monotonic `req-<n>` string ids map to
  pending promises, so concurrent requests are supported. Late responses whose
  pending entry was already removed (e.g. after a timeout) are ignored rather
  than misrouted. stderr is surfaced only through an optional `onStderr`
  consumer and is never parsed as protocol.
- **Timeout**: a per-request timeout (default 30 s, per-call override) produces
  a `WorkerTimeoutError` carrying the method and timeout; the pending entry and
  its timer are cleared on every outcome (response, timeout, write failure,
  exit, contract fault, stop).
- **Restart/backoff** (`worker/supervisor.ts`): an unexpected exit rejects all
  pending with `WorkerUnavailableError`, transitions availability to
  `restarting`, and re-spawns/re-handshakes with bounded exponential backoff
  (`maxAttempts`/`baseDelayMs`/`maxDelayMs`, defaults 3/250 ms/4000 ms);
  exhaustion sets `failed`. `stop()` cancels a scheduled backoff immediately.
  Availability is exposed via a getter and `onAvailabilityChange(listener)`.
  Requests while not `ready` fail closed (never silently queued).
- **Typed mapping preserving provenance** (`worker/mapping*.ts`): pure,
  arithmetic-free translations.
  - handshake -> worker version + operations + `ScientificWorkerMetadata`.
  - inspect -> study/series inspection entries carrying modality, series UID,
    instance count, explicit `classification`, `supported` and `reason`, plus
    `toStudySeriesReference()` projecting onto the Phase 1 `StudySeriesReference`.
  - geometry -> discriminated result whose `computed` branch contains
    `assetGeometry: AssetGeometry` plus the preserved `geometricDigest`,
    `sliceNormal` and `slicePositionsLpsMm`; `rejected`/`unavailable` are typed
    results.
  - quantitation -> `PetQuantitationResult` plus `PetAcquisitionMetadata` only
    when all seven keys are present; the exact present-key map is always kept
    as `petAcquisition` and no missing field is fabricated.
  - compatibility -> bridge-local pairwise evidence (frame equality,
    coplanarity, spacing/origin/extent, incompatibilities). The Phase 1
    `GeometryVerificationSnapshot` is intentionally not used: it requires a
    per-asset `assetId` and `SourceFingerprint`, which the pairwise worker
    result does not carry, so mapping onto it would fabricate identity fields.
- **Typed errors** (`worker/errors.ts`): `WorkerError` base with `kind`, plus
  `WorkerProtocolError` (JSON-RPC code/message/diagnostic/data),
  `WorkerTimeoutError`, `WorkerHandshakeError`, `WorkerUnavailableError` and
  `WorkerContractError`. No `any`, no empty catch, no fallback.
- **Test seam**: `options.spawnWorker(attempt)` returns a stdio-piped child so
  tests can inject scripted/hanging/crashing processes; the default factory
  spawns the configured command. The only dependency change is dev-only
  `@types/node@^24` (type-only; no runtime dependency).

## 2. Files Changed / Created

Created under `packages/medical-engine/src/worker/`:
- `types.ts` (215), `errors.ts` (94), `narrowing.ts` (88), `protocol.ts` (197),
  `mapping.ts` (186), `mapping-quantitation.ts` (125),
  `mapping-compatibility.ts` (77), `process.ts` (250), `supervisor.ts` (249),
  `bridge.ts` (135), `index.ts` (17)

Created tests / test-only fixtures:
- `tests/medical/worker-lifecycle.test.ts`, `worker-mapping.test.ts`,
  `worker-real.test.ts`, `worker-source-integrity.test.ts`
- `tests/medical/fixtures/fake-worker.mjs` (scripted protocol double),
  `tests/medical/fixtures/ts-resolve-hook.mjs` (Node module resolve hook)

Modified:
- `packages/medical-engine/src/index.ts` (barrel export)
- `packages/medical-engine/package.json` (devDependencies `@types/node ^24`)
- `package-lock.json` (generated: `@types/node@24.13.6` + `undici-types@7.18.2`,
  both `dev`)
- `docs/agentlog/phase-2.md` (this handover)

Not modified: `python/**` (worker untouched), `packages/shared-types/**`,
`tests/contracts/**`, `tests/fixtures/**` (including `manifest.json`), all
`apps/**`, root `package.json` scripts, `CHANGELOG.md`.

**Justified deviation from the brief's file list:** the single-file
`bridge.ts`/`mapping.ts` naturally exceeded 250 lines, so the slice was split
by responsibility (`supervisor`/`process`, `narrowing`, two extra mapping
modules) per Rule 02's Facade/decomposition directive. The public API is
unchanged. Field naming differs cosmetically from the brief: the bridge exposes
`petAcquisition` (present-key) and `petAcquisitionMetadata` (complete contract)
instead of `acquisitionEvidence`/`acquisition`.

## 3. Architectural Assumptions Made

- ADR-002 is the transport authority; the bridge owns lifecycle, correlation,
  timeout and version compatibility, while the worker owns every DICOM,
  geometry and SUVbw computation. TypeScript maps envelopes and copies numbers
  verbatim; the no-`Math` guard plus `Object.is` fixture-identity tests enforce
  this.
- A malformed or uncorrelatable stdout record is a protocol desynchronization:
  all pending requests fail closed (`WorkerContractError`) and the process is
  restarted. There is no attempt to resynchronize a corrupt stream.
- `WorkerHandshakeError`/`WorkerContractError` are deterministic and
  non-retryable, so they set `failed` immediately; spawn/exit/timeout failures
  are transient and back off.
- The committed DICOM fixtures are payloads without top-level
  `workerMetadata`; the mapping tests inject a synthetic provenance record,
  while the real-worker test exercises genuine worker provenance
  (`workerVersion 0.1.1`). No manifest fixture was added or changed.
- The compatibility contract is bridge-local because no Phase 1 pairwise
  compatibility contract exists and `GeometryVerificationSnapshot` cannot be
  populated without fabricated identity fields (documented in
  `mapping-compatibility.ts`).
- A test-only Node resolve hook is required because Node v24 type stripping
  does not rewrite `.js` specifiers to `.ts`; the earlier `tests/contracts`
  suites were unaffected only because all their `.js` imports were `import type`
  and erased. The hook falls back only after the real `.js` resolution fails
  and rethrows the original error when neither target exists.

## 4. Tests Added & Executed

- `npm test` -> **53 passed** (14 suites), up from 35 (10 suites) at v0.1.1.
  The 18 P2.5 tests cover: 6-way concurrent correlation against the scripted
  double (reversed delays, no cross-talk, pending drains); 4-way concurrent
  mixed-outcome correlation against the **real spawned worker** (one fulfilled
  handshake, `-32601`, `-32602`, `-32010` with distinct diagnostics, pending
  drains); timeout -> `WorkerTimeoutError{method,timeoutMs}` with the bridge
  still usable; kill-mid-flight -> `WorkerUnavailableError`, bounded backoff
  re-handshake to `ready`, subsequent request succeeds; exhaustion -> `failed`
  after exactly `maxAttempts` spawns; three handshake mismatch modes -> typed
  `WorkerHandshakeError` with asserted reasons; malformed stdout ->
  `WorkerContractError` and recovery; committed-fixture mapping for inspect
  (primary/unsupported/missing-tag), geometry (computed/rejected), quantitation
  (computed/invalid/unavailable, `Object.is` identity of `suvFactor`/
  `elapsedSeconds`/`decayedDoseBq`, exact 7-key and 6-key PET key sets) and
  compatibility (`frame-of-reference-mismatch`); and the engine source
  integrity scan (no `Math.`, no enum/namespace).
- `npm run typecheck` -> clean; `tsc -b --force` -> clean;
  `npm run build` -> clean.
- `npm run test:python` -> **166 passed** (unchanged); `npm run typecheck:python`
  -> strict mypy clean over 43 source files. The Python worker was not touched.
- File-length gate: longest new file `packages/medical-engine/src/worker/process.ts`
  = 250 lines; every slice file <= 250.

## 5. Documentation, Agentlog & ADR Status

- No new ADR was required: ADR-002 already governs the transport, and the
  worker supervisor contract is documented in `python/worker/stdio.py` and now
  enforced by the bridge.
- The P2.5 status header entry and this eight-point report satisfy the AgentLog
  Gate for the slice. `CHANGELOG.md` was deliberately not touched; promotion
  remains a release-time `/promote-changelog 2` action (ADR-001).
- The reviewer/QA evidence for this slice is recorded below.

## 6. Project Model Impact

- No `@nuclear/shared-types` contract or `.ncp` schema changed. The bridge
  reuses `AssetGeometry`, `DirectionCosines` (via a validated 6-tuple),
  `BoundingBox3D`, `PetAcquisitionMetadata`, `PetQuantitationResult`,
  `ScientificWorkerMetadata`, `StudySeriesReference`, `SourceLocator`,
  `SeriesInstanceUID`, `StudyInstanceUID`, `FrameOfReferenceUID` and `Modality`.
- The bridge is now the sanctioned path from Python scientific results to
  NuClear contracts for Phase 3 rendering/residency work; `apps/desktop` will
  own process provisioning while the bridge owns the supervised lifecycle.

## 7. Known Limitations & Technical Debt

- **Non-blocking (reviewer residual):** no runtime negative test exercises
  `requireModality`'s `WorkerContractError` branch; every committed inspection
  fixture uses a valid modality. The worker normalizes modality to the
  shared-types vocabulary upstream, so the branch is defensive. A curated
  negative fixture would close the gap.
- **Non-blocking (reviewer LOW):** an uncorrelatable but well-formed response
  (e.g. a numeric id the bridge never issues) is currently ignored rather than
  faulted; late responses after timeout are correctly discarded, so no
  misrouting exists.
- **Non-blocking (reviewer LOW):** the stdout line buffer is unbounded; a
  runaway worker could grow host memory. Hardening only; ADR-002 trusts the
  local worker.
- **Non-blocking (reviewer LOW):** a concurrent second `stop()` returns before
  the first teardown completes (final availability is still truthful `stopped`,
  and no restart-after-stop path exists).
- **Non-blocking (reviewer LOW):** public `request<TResult>` performs an
  unchecked cast; all internal callers use `request<unknown>` plus a validating
  mapper.
- `DEFAULT_WORKER_COMMAND` depends on `process.cwd()` matching the repository
  root; consumers must pass an explicit `command`/`cwd` (the tests do).
- `tsc -b` type-checks `packages/**` only; `tests/**` runs through Node type
  stripping, so test-file type errors surface at runtime, not at typecheck
  (pre-existing repository property).

## 8. Exact Next Recommended Task

- **P2.6** (owner: `nuclear-reviewer` + `nuclear-qa`): phase-level independent
  review and verification of the consolidated Phase 2 evidence, then the final
  phase handover. Do not start Phase 3 (Cornerstone/WebGL/residency) until
  P2.6 is recorded and accepted.

---

## Gate Review & QA Evidence (P2.5)

- `nuclear-reviewer` first pass: **CONCERNS** — (1) the runtime modality
  vocabulary list in `mapping.ts` could drift from the shared-types `Modality`
  union without a compile-time signal; (2) the P2.5 AgentLog handover was not
  yet appended (resolved by this report); (3) `opencode.json` is an unrelated
  harness artifact that must be excluded from staging. Three further LOW
  hardening notes (uncorrelatable response, unbounded buffer, concurrent stop,
  public `request` cast) were recorded as non-blocking.
- `nuclear-reviewer` focused re-review after the fix: **PASS** — the vocabulary
  is now `Readonly<Record<Modality, true>>`, empirically proven to fail
  `tsc` when a `Modality` member is added or removed, with `hasOwnProperty`
  runtime semantics and no `any`/non-erasable syntax; the three handshake
  mismatch tests now assert the exact `WorkerHandshakeError.reason` fragments
  produced by `mapWorkerHandshake`, non-tautologically.
- `nuclear-qa` audit: **11 PASS / 1 FAIL / 1 NOT YET APPLICABLE** — PASS on
  typecheck, 53/53 tests, forced build, 166/166 Python tests, strict mypy (43
  files), file length, fixture integrity (`python/**`, `tests/contracts/**`,
  `tests/fixtures/**` untouched; manifest unchanged), dependency boundary
  (dev-only `@types/node`, runtime deps unchanged), independent reproduction of
  rejected/unavailable/computed dispositions plus real-worker `-32010` and
  4-way mixed-outcome correlation, and diff scope. FAIL on the AgentLog gate at
  audit time (no P2.5 handover); satisfied by this report. `CHANGELOG.md`
  promotion is NOT YET APPLICABLE for this slice.
- Orchestrator post-review fix: `MODALITY_SET: Readonly<Record<Modality, true>>`
  and strengthened handshake-reason assertions; re-verified `npm run typecheck`
  clean, `npm test` 53/53, `tsc -b --force` clean, Python gates unchanged.
- Deliberately not staged: the pre-existing unrelated `opencode.json` harness
  change (`"plugin": ["opencode-snip@latest"]`).

---

# Handover Report — P2.6: Phase 2 Closure (Independent Review, Gates & Consolidated Handover)

## 1. What Was Implemented

No new product code was written in this slice. P2.6 closes Phase 2 through
phase-level verification and documentation:

- **Phase-level independent review** (`nuclear-reviewer`): **PASS**. The
  consolidated Phase 2 state was re-audited against ADR-002, the Phase 2 plan's
  In Scope / Excluded / Invariants / Completion Gates, Rules 01–03 and the v3
  blueprint. No blocking or concern-level finding; four record-only/low
  findings (F-1…F-4) and four carried Phase 3 risks were recorded below.
- **Phase-level QA gate audit** (`nuclear-qa`): **all applicable gates PASS**
  (12/12 command/evidence gates; `npm test` 53/53 in 14 suites, `test:python`
  166/166, strict mypy 43 files, `typecheck`/`build`/forced rebuild clean,
  file-length, fixture integrity, dependency boundary, git hygiene). The
  auditor independently reproduced one positive and one fail-closed negative
  for each of the five operations against the real spawned Python worker,
  matching committed fixtures within the declared 1e-9 float tolerance and
  exactly for enums, digests and ids (12 fixture-matched transactions, 0
  failures).
- **Docs generation executed**: `npm run docs:ts` generated TypeDoc HTML under
  `docs/api/ts` (exit 0); `npm run docs:python` generated the Python
  specification page and the master portal (exit 0), honestly reporting that
  `pdoc` is absent and the structured fallback was used.
- **Consolidated phase handover** (this report), the phase completion-gate
  table, and the `AGENTS.md` baseline update from "Phase 2 Active" to
  "Phase 2 Complete".

## 2. Files Changed / Created

Modified:
- `docs/agentlog/phase-2.md` (P2.5 status/header already present; P2.6 status
  flipped to COMPLETE and this phase-level handover appended)
- `AGENTS.md` (baseline heading and Fase 2 bullet updated to Phase 2 complete)

Generated but Git-ignored (not staged): `docs/api/**`.

Not modified: `python/**`, `packages/**`, `apps/**` (none exist yet),
`tests/**`, `tests/fixtures/**`, `package.json`/`package-lock.json`,
`CHANGELOG.md`, `opencode.json`, `opencode-rag.json`.

## 3. Architectural Assumptions Made

- **F-2 interpretation (recorded per reviewer requirement):** the plan's DICOM
  gate wording "declared source fingerprint evidence" is satisfied in Phase 2
  by fixture provenance declaration (`manifest.json` `generator`/`expectedPath`,
  reconciliation-tested) plus the geometry `geometricDigest`; Phase 2 does
  **not** produce a content-hash `SourceFingerprint`. Content hashing, locator
  persistence and offline fingerprint verification belong to
  `@nuclear/project-model` and later phases. This gate must not be read as a
  claim of a `SourceFingerprint` capability that does not yet exist.
- **Fixture count correction:** the manifest holds **42 established / 0 planned**
  (10 protocol + 6 classification + 13 geometry + 13 quantitation). Earlier
  evidence citing "33" was a P2.4-era snapshot; the repository at HEAD is the
  authority.
- **Docs fallback is honest:** `docs:python` degrading to the structured
  specification page because `pdoc` is not installed is reported as such; it is
  not presented as pdoc output.
- **Changelog promotion is a release action (ADR-001):** P2.6 leaves
  `CHANGELOG.md` untouched; `/promote-changelog 2` and any tag are performed
  only on an explicit release request.

## 4. Tests Added & Executed

No tests were added in P2.6; the full configured suite was re-run at HEAD
`09c0567` by the orchestrator, reviewer and QA:

- `npm run typecheck` → clean (0 errors).
- `npm test` → **53 passed** (14 suites, 0 failed/skipped).
- `npm run build` → clean; `npx tsc -b --force` → clean (full, non-cached).
- `npm run test:python` → **166 passed**.
- `npm run typecheck:python` → strict mypy clean over 43 source files.
- `npm run docs:ts` → exit 0 (`docs/api/ts` generated).
- `npm run docs:python` → exit 0 (structured fallback; `pdoc` absent).
- File-length gate: longest source file `packages/shared-types/src/figure.ts`
  = 266 lines (pre-existing, within the 250–300 band, under the 300 cap);
  longest Phase 2 file `packages/medical-engine/src/worker/process.ts` = 250.
- QA independent reproduction: 5 operations × (1 positive + 1 negative)
  through the real worker, fixture/tolerance 1e-9, 0 failures.

## 5. Documentation, Agentlog & ADR Status

- The AgentLog Gate is satisfied for the phase: P2.6 status + this eight-point
  report plus the phase gate table and the reviewer/QA evidence below.
- No new ADR is required. ADR-002 (transport) and ADR-001 (two-tier
  changelog/agentlog) are unchanged and conformed to.
- `AGENTS.md` now reflects the Phase 2 baseline truthfully.

## 6. Project Model Impact

None. No `@nuclear/shared-types` contract, `.ncp` schema, fixture or protocol
version changed in this slice. The Phase 2 `.ncp` surface remains a future
`project-model` concern; the `ScientificWorkerBridge` is the sanctioned bridge
for Phase 3.

## 7. Known Limitations & Technical Debt

- **F-1 (MINOR):** public `request<TResult>` performs an unchecked cast; Phase 3
  must consume only the typed queries (`inspect`/`geometry`/`compatibility`/
  `quantitation`).
- **F-4 (LOW, carried from P2.5 §7):** no runtime negative test for
  `requireModality`'s fail-closed branch; an uncorrelatable well-formed
  response is silently discarded; the stdout line buffer is unbounded; a
  concurrent second `stop()` returns early; `DEFAULT_WORKER_COMMAND` resolves
  against `process.cwd()`.
- **Evidence asymmetry:** no committed positive `nuclear.dicom.compatibility`
  fixture; the positive path is covered by pytest and the QA reproduction, not
  by a committed fixture file. Adding one is an optional evidence-hygiene task.
- **`figure.ts` = 266 lines:** pre-existing, within the 250–300 band; decompose
  on next touch per Rule 02.
- **`docs:python`:** runs without `pdoc`; publication-grade Python API docs
  require installing `pdoc` in the docs environment.
- **Test typechecking:** `tsc -b` covers `packages/**` only; `tests/**` runs via
  Node type stripping, so test type errors surface at runtime.

## 8. Exact Next Recommended Task

- **Phase 3** (owner `nuclear-engine-engineer`): headless medical engine —
  Cornerstone adapter, volume loading, residency manager and offscreen
  `RenderTarget`, consuming the bridge through its typed queries only. Before
  Phase 3 begins, evaluate the carried risks: the worker provisioning contract
  (`command`/`cwd` for `apps/desktop`), timeout/restart policy under concurrent
  volume requests, whether compatibility evidence must become a persisted
  contract, and adding `tests/**` to typechecking.
- **Release (separate, explicit user action):** run `/promote-changelog 2` and
  tag only when a release is requested; P2.6 did not touch `CHANGELOG.md`.

---

## Phase 2 Completion Gate Table (final)

| Gate | Phase 2 evidence | Verdict |
| --- | --- | --- |
| AgentLog | Eight-point handovers per slice (P2.0–P2.5) plus this consolidated P2.6 report and the reviewer/QA phase evidence | PASS |
| Protocol | `-32700`/`-32600`/`-32601`/`-32602`/`-32603` + reserved `-32001`/`-32010`; mandatory `data.diagnostic`; normative fixtures replayed byte-identically; bridge verifies envelope `protocolVersion` and handshake compatibility | PASS |
| DICOM | Explicit CT/PT/localizer/secondary-capture/unsupported classification with reasons; `-32010` source failure; 6 committed classification fixtures; positive + fail-closed negative reproduced by QA through the real worker | PASS |
| Geometry | Axial and oblique positives with exact `geometricDigest`; irregular spacing, gantry tilt, duplicate slice, inconsistent identity/orientation, non-finite/non-positive rejected; 13 committed geometry fixtures; QA reproduced positive and rejected through the real worker | PASS |
| Quantitation | Python-only SUVbw with provenance; `suvFactor` only when `computed`; DICOM PS3.3/PS3.5-conformant extraction and DT offsets; 13 committed quantitation fixtures; QA reproduced `computed` to 1e-9 and `invalid` fail-closed | PASS |
| Bridge | Correlation, timeout, bounded restart/backoff, typed mapping, provenance preservation, no duplicated formula, no UI dependency; tested against the real spawned worker; `nuclear-reviewer` PASS | PASS |
| Quality | `typecheck`/`build`/forced build clean; 53/53 TS; 166/166 Python; strict mypy 43 files; docs generation exit 0; file lengths within the 250–300 band; no new runtime dependency | PASS |
| Review | Per-slice reviewer + QA evidence P2.0–P2.5; phase-level `nuclear-reviewer` PASS and `nuclear-qa` PASS recorded below | PASS |

## Gate Review & QA Evidence (P2.6)

- `nuclear-reviewer` phase-level review: **PASS**. Re-ran the gates at HEAD and
  inspected the consolidated code against ADR-002, the plan invariants and Rule
  02 boundaries; confirmed protocol conformance end-to-end, Python-only science
  authority, no duplicated formula, fail-closed dispositions, fixture policy
  (42 established / 0 planned, no silent change), excluded scope untouched, and
  no `any`/`@ts-ignore` in the engine. Required only documentation-level
  closure actions (this handover, the F-2 interpretation, the 42-count note),
  all executed above. Carried findings F-1…F-4 and four Phase 3 risks.
- `nuclear-qa` phase audit: **all applicable gates PASS** (12/12) — typecheck,
  53/53 tests, build + forced rebuild, 166/166 Python, strict mypy, file
  length, fixture integrity, dependency boundary, git hygiene, and independent
  real-worker reproduction of one positive and one fail-closed negative per
  operation (12 fixture-matched transactions, 0 failures). Declared caveats:
  `docs:python` uses the structured fallback because `pdoc` is absent; the
  manifest is 42/0; `figure.ts` is 266 lines; no committed positive
  compatibility fixture; desktop/Electron gates are `NOT YET APPLICABLE`
  because `apps/` does not exist.
- **Changelog Gate:** `NOT YET APPLICABLE` — no `CHANGELOG.md` change in P2.6;
  promotion is a separate release action.
- Deliberately not staged: the pre-existing unrelated harness changes
  `opencode.json` and `opencode-rag.json`.

---

# Handover Report — Release: Monorepo v0.1.2

## 1. What Was Implemented

- **Harness housekeeping committed** (`5416b6e`): enabled the `opencode-snip`
  plugin and pinned the OpenCodeRAG `vectorDimension` to 1024 as a separate
  tooling commit, so the working tree was clean before the release.
- **Ran the governed release flow**: `npm run bump 0.1.2` synchronized every
  workspace `package.json`, all internal `@nuclear/*` ranges, the Python
  package (`pyproject.toml`, `dicom/__init__.py`, `worker/__init__.py`) and the
  ratified `tests/fixtures/protocol/response.handshake.json` workerVersion; the
  root `package-lock.json` was reconciled with `npm install --package-lock-only`
  (the bump script does not update the lockfile).
- **Promoted `CHANGELOG.md`** from the agentlog via the sandboxed
  `nuclear-changelog-writer`: a `[0.1.2] - 2026-09-20` section with two
  distilled capability bullets (the headless scientific worker bridge and its
  verbatim provenance-preserving result mapping). Internal release engineering
  and harness tooling were excluded from the release notes per the style
  contract.
- **Created the annotated tag `v0.1.2`** on the release commit. Nothing was
  pushed; the branch is left for the user to push.

## 2. Files Changed / Created

- Version metadata: root `package.json`, `package-lock.json`,
  `packages/*/package.json` (7 workspaces), `python/pyproject.toml`,
  `python/dicom/__init__.py`, `python/worker/__init__.py`,
  `tests/fixtures/protocol/response.handshake.json`
- `CHANGELOG.md` (new `[0.1.2]` section)
- `docs/agentlog/phase-2.md` (this release handover and status header)
- `opencode.json`, `opencode-rag.json` (harness tooling, committed separately as
  `5416b6e`)

Not modified: any Phase 2 source, test, contract or fixture semantics (only the
handshake version literal changed); no scientific behaviour changed.

## 3. Architectural Assumptions Made

- A release is the explicit user action that authorizes `/promote-changelog`
  and tagging; P2.6 phase closure deliberately left `CHANGELOG.md` untouched and
  this release is a separate step (ADR-001).
- The single monorepo SemVer is the authority; the Python worker version and the
  ratified handshake fixture track it so worker provenance and protocol fixtures
  stay consistent.
- The bump script intentionally does not rewrite `package-lock.json`; the lock
  was synchronized manually this release (recorded as debt in the tooling
  handover).

## 4. Tests Added & Executed

No tests were added. The full configured suite was run on the bumped tree:

- `npm run typecheck` -> clean; `npm run build` -> clean.
- `npm test` -> **53 passed** (14 suites, 0 failed/skipped).
- `npm run test:python` -> **166 passed**; `npm run typecheck:python` -> strict
  mypy clean over 43 source files.
- Version consistency verified: all workspace `package.json` files,
  `package-lock.json`, `worker.__version__`, `dicom.__version__`,
  `importlib.metadata.version('nuclear-scientific')` and the handshake fixture
  all report `0.1.2`.

## 5. Documentation, Agentlog & ADR Status

- `CHANGELOG.md` `[0.1.2]` was compiled by the dedicated changelog writer and
  audited for forbidden content (no paths, hashes, task codes or code
  identifiers); `[Unreleased]` remains present and empty.
- This release handover completes the release-side evidence; ADR-001 and
  ADR-002 are unchanged.

## 6. Project Model Impact

- None. Only version metadata and documentation changed; no contract, fixture
  semantics or `.ncp` schema was touched.

## 7. Known Limitations & Technical Debt

- `bump-version.mjs` still does not rewrite the root `package-lock.json`
  (reconciled manually here); extending it to shell out to
  `npm install --package-lock-only` remains the recommended follow-up.
- The provisioned venv dist-info rename is local and Git-ignored; a fresh
  environment must reinstall the editable package to observe the new version.
- P2.5 residuals and Phase 3 risks recorded in the P2.6 handover remain open.

## 8. Exact Next Recommended Task

- **Push `v0.1.2`** (user-owned) and proceed to **Phase 3** (headless medical
  engine: Cornerstone adapter, volume loading, residency manager, offscreen
  `RenderTarget`), consuming the bridge through its typed queries only.
