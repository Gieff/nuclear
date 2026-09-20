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
│   ├── dispatch.py       # method registry and handshake operation
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
- **EOF on stdin exits `0`.** A non-zero exit is reserved for unrecoverable
  startup errors.
- **Restart, backoff, timeout and request/response correlation are owned by
  the TypeScript `ScientificWorkerBridge`** (P2.5), not by the worker.


## Environment provisioning

The worker is an isolated Python environment. Python `>=3.10` is required by
`pyproject.toml`; the repository's reproducible local runner is pinned to the
native arm64 Homebrew CPython 3.14 interpreter on macOS.

```bash
# from the repository root
/opt/homebrew/bin/python3.14 -m venv python/worker/.venv
python/worker/.venv/bin/python -m pip install -e "python[dev]"
```

`python/worker/.venv/` is ignored by Git and must never be committed.

## Test command

```bash
# from the repository root
npm run test:python
# equivalent
python/worker/.venv/bin/python -m pytest python/tests -q
```

A missing virtual environment or an unprovisioned dependency is reported as
`BLOCKED`, never as a passing test run. Zero discovered tests is not a pass.

## Measured dependency state

Recorded when the P2.0 runner was provisioned (2026-09-20). Re-run
`python/worker/.venv/bin/python -m pip freeze` to confirm the live state.

| Dependency | Constraint (`pyproject.toml`) | Installed |
| --- | --- | --- |
| CPython | `>=3.10` | 3.14.6 (native arm64) |
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
