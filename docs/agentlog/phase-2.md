# AgentLog — Phase 2: Scientific DICOM Ingestion & Python Worker Bridge

## Status

- **P2.0 — COMPLETE** (2026-09-20). Python runner, declared package README,
  versioned fixture manifest and ADR-002 protocol examples established and
  verified.
- **P2.1 — COMPLETE** (2026-09-20). JSON-RPC worker envelope, handshake,
  error schema and stdio supervisor contract implemented and ratified.
- **P2.2 — COMPLETE** (2026-09-20). `nuclear.dicom.inspect` study/series
  discovery and explicit classification implemented and ratified.
- **P2.3–P2.6 — NOT STARTED.** No geometry extraction, quantitation or
  TypeScript bridge code exists.
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
