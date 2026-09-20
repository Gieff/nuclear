# AgentLog — Phase 2: Scientific DICOM Ingestion & Python Worker Bridge

## Status

- **P2.0 — COMPLETE** (2026-09-20). Python runner, declared package README,
  versioned fixture manifest and ADR-002 protocol examples established and
  verified.
- **P2.1–P2.6 — NOT STARTED.** No worker envelope, handshake, DICOM
  classification, geometry, quantitation or bridge code exists.
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
