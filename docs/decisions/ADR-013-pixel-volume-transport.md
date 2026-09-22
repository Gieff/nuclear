# ADR-013: Pixel/Volume Transport for Real-Source Volume Ingestion

## Status

**Proposed** — must be ratified before slice **2B.3b** (automatic MI registration
on real volumes) and before any real-source ingestion replaces the fixture-only
authority of [ADR-004](ADR-004-fixture-only-pixel-ingestion.md). No product code
may depend on this ADR until its Status is **Accepted**. §9 records which open
decisions are resolved and which remain **`[TO RATIFY]`**.

## Date

2026-09-22

## Context

ADR-004 (Accepted) delivered a **fixture-only** pixel-ingestion capability: the
worker transports no voxel arrays, `AssetMetadata` and the Phase 2
`nuclear.dicom.geometry`/`inspect` results carry no pixel-format facts, and the
pixel-format authority for P3.2 is a committed test descriptor. ADR-004 recorded
the debt explicitly — a verifiable **hydration boundary** is required, and it
must not be hidden behind `SourceLocator`.

Phase 2B closes the Procrustes path, but the automatic **MI registration** path
(`nuclear.registration`, `mode: "rigid"`) cannot run because the worker has no
way to obtain the fixed/moving volumes (`mode: "rigid"` still returns `-32011`).
Implementing MI end-to-end today would force the worker to re-parse DICOM pixels
— a **second geometry authority** — or require a transport contract that does
not exist. Two invariants constrain the answer:

1. **No second geometry authority.** Physical geometry stays authoritative from
   the worker's accepted geometry evidence.
2. **`view-engine` is not involved in transport.** It declares only
   `ResourceDemand`; byte movement lives in the worker + `@nuclear/medical-engine`.

## Decision

§1–§8 are the intended decision. §9 lists the ratification state of each open
decision. Numbers in §6/§7/§8 marked **[TO RATIFY]** are concrete proposals, not
yet accepted constants.

### 1. Ownership — the worker decodes pixels; TypeScript never does

- The **Python scientific worker** owns pixel decoding and voxel production for
  real sources. All geometry it reports MUST match the accepted worker geometry
  evidence (`WorkerGeometryComputed.assetGeometry` + `sliceNormal`); the reader's
  own derived geometry is never the authority.
- `@cornerstonejs/dicom-image-loader` and every TypeScript DICOM parser remain
  **forbidden** (ADR-004 §1 unchanged). `medical-engine` consumes bytes, not DICOM.

### 2. Transport — opaque handle on stdio, binary payload in a worker-owned temp file

**OD-A is ratified (with the constraints below).**

- A new worker operation **`nuclear.dicom.volume`** validates a
  `{ locator, seriesInstanceUID }` request, decodes the series, writes the voxel
  payload, and returns a **JSON transport descriptor** (no voxels in JSON —
  inline base64 is rejected for clinical volumes).
- The worker creates and owns a **private temp root**; descriptors carry an
  **opaque handle** and a worker-generated **file name**, never a caller-supplied
  or arbitrary path. The bridge resolves the file under the advertised root and
  validates **canonical containment** before reading.
- **Security constraints (mandatory):**
  - the handle is opaque (a token bound to a worker-side record), not a path;
  - the temp root is private and controlled (worker-created, owner-only);
  - **no symlinks / no path traversal** — the bridge rejects any resolved path
    that is not inside the root, and rejects symlink components;
  - **atomic write**: write to a temporary name → flush + `fsync` → close →
    `os.replace` (atomic rename) → **only then** emit the descriptor;
  - the descriptor is emitted only after `byteLength` and `contentHash` are
    verified against the written file;
  - **release is idempotent and single-owner**; releasing an unknown or
    already-released handle succeeds as a no-op.
- The temp root is advertised to the bridge once via an **additive, optional
  handshake capability** (`capabilities.volumeTransport.root` + protocol
  version); the handshake change is additive and must not break existing
  consumers.
- **Rejected for v1:** shared-memory segments (platform lifecycle, harder
  headless tests) and inline base64 (memory/CPU blow-up). Shared memory may
  supersede this under its own ADR.

### 3. Binary format — declared, never inferred

- The payload is a **dense, C-contiguous scalar array**. For **v1, little-endian
  only**; big-endian sources must be converted to little-endian **explicitly by
  the worker** before writing (a big-endian payload requires an explicit bridge
  conversion and is out of v1).
- Element type is exactly one of the accepted `VolumeScalarDataType` values:
  `int8 | uint8 | int16 | uint16 | float32` (ADR-004 P3.2.1; Cornerstone
  `createLocalVolume` byte-length support).
- **`samplesPerPixel === 1`** for the v1 scalar volume; multi-sample payloads are
  refused.
- The descriptor declares **dtype, `byteOrder`, `signedness`, `samplesPerPixel`,
  `bitsAllocated`/`bitsStored`/`highBit`, `photometricInterpretation`,
  `scalarDataDomain` (`stored-values | rescaled-hu | rescaled-bqml`), optional
  `rescale` slope/intercept, `dimensions [nx, ny, nz]`, `byteLength` and
  `contentHash`**.
- **Hash algorithm is mandatory: SHA-256** (`sha256:<hex>`).
- **`byteLength` formula is verified:**
  `byteLength = nx × ny × nz × bytesPerVoxel(dtype)`; a file **shorter or longer
  than declared** is refused (no partial read, no truncation, no padding).
- TypeScript **consumes these verbatim**; it never infers a format from a
  filename, modality or value range (ADR-004 §4).

### 4. Geometry, orientation and integrity gating

- No new geometry is carried. The descriptor carries the **`geometricDigest`**
  the geometry operation produced; the bridge **fail-closes** if it differs from
  the accepted geometry evidence.
- **The content hash and `byteLength` are verified before `VolumeIngestionPlan`
  is built**, and before any renderer/cache interaction. `assembleCornerstoneDirection`
  is unchanged and remains the single orientation path.

### 5. Correlation — asset / series / FoR / fingerprint

- The request carries the existing `SourceLocator` + `seriesInstanceUID`; the
  engine supplies its expected `SourceFingerprint`; the worker returns observed
  values. The bridge **fail-closes** on any mismatch (content digest, instance
  count, geometric digest, series/FoR), mirroring the Phase 4 provenance ↔ asset
  cross-validation (C5), before the payload reaches the renderer.

### 6. Limits (**OD-B — proposed values `[TO RATIFY]`**)

Concrete, declared limits; **no reliance on filesystem or RAM defaults**.

| Limit | Proposed value | Rationale |
| --- | --- | --- |
| `MAX_VOXELS_PER_VOLUME` | `2^28 = 268_435_456` | supports 512×512×1024 or 1024×1024×256 |
| `MAX_BYTES_PER_VOXEL` | `4` (float32) | largest accepted element type |
| `MAX_PAYLOAD_BYTES` | `2^30 = 1_073_741_824` (1 GiB) = voxel cap × 4 | derived, not filesystem/RAM |
| `MAX_REQUEST_PEAK_BYTES` | `2 GiB` | decode + serialize + hash working set ≈ 2× payload |
| `MAX_RESIDENT_PAYLOADS` | `2` | concurrent live handles per worker |
| `MAX_WORKER_AGGREGATE_BYTES` | `4 GiB` | resident payloads + in-flight decode |

**Behaviour when a limit is exceeded:** fail closed with
`VOLUME_LIMIT_EXCEEDED`, refusing **before** allocating where the grid is known
from metadata (otherwise as soon as the size is known). **Never** truncate,
downsample, subsample, or partially load.

### 7. Lifecycle, cleanup, timeout, cancellation (**OD-C — proposed values `[TO RATIFY]`**)

- **Temp root / permissions:** worker-created, owner-only (`0700`); payload files
  `0600`. The bridge reads a file only after canonical-containment validation.
- **Atomic write** (§2) then descriptor; no handle exists until the file is
  complete and hashed.
- **TTL:** `HANDLE_TTL_SECONDS = 300` (5 min). After TTL a handle is **expired**;
  a sweeper deletes the file and the bridge fails closed on use.
- **Orphan cleanup at start:** the worker deletes every payload file in its temp
  root at startup, because no handle can survive a restart.
- **Crash behaviour:** a worker crash fails any pending request; the temp root is
  cleaned at the next worker start. No handle survives a restart.
- **Release after timeout — explicitly defined:**
  - if the descriptor (and therefore the handle) was **already received**, the
    bridge calls `nuclear.volume.release { handle }` (idempotent);
  - if the timeout expires **before the descriptor exists** (handle unknown), the
    bridge **terminates and restarts the worker** (its existing supervisor
    primitive). This is the chosen cancellation model: there is no safe
    protocol-level cancel that guarantees the temp file is removed, and the
    restart triggers orphan cleanup deterministically.
- Handles are **single-owner** (the owning bridge session); use of a released or
  expired handle fails closed.

### 8. Failure taxonomy (**OD-D — proposed values `[TO RATIFY]`**)

Reserved worker error codes in `-32000..-32099`; each with a non-empty
`data.diagnostic` and **no fallback**:

| Code | Name | Covers |
| --- | --- | --- |
| `-32013` | `VOLUME_DECODE_FAILED` | unsupported/missing pixel representation or pixel-format tag; decode error |
| `-32014` | `VOLUME_LIMIT_EXCEEDED` | any §6 limit |
| `-32015` | `VOLUME_FINGERPRINT_MISMATCH` | asset/series/FoR/content-digest/geometric-digest mismatch |
| `-32016` | `VOLUME_TRANSPORT_INTEGRITY` | hash failure, short/long file, missing file |
| `-32017` | `VOLUME_HANDLE_INVALID` | unknown, expired or already-released handle |
| `-32018` | `VOLUME_CLEANUP_FAILED` | release/cleanup failure |

Minimal diagnostics (never a path, never a payload): `{ diagnostic, reason?,
handle?, seriesInstanceUID?, expectedDigest?, observedDigest? }`. A failure never
yields a partial or synthetic plane. `mode:"rigid"` keeps returning `-32011`
until 2B.3b is implemented.

### 9. Integration and boundaries

- The transport sits **before** `buildVolumeIngestionPlan`. It produces the
  `pixels: VolumePixelPayload` that `VolumeIngestionRequest` already expects;
  `buildVolumeIngestionPlan` and `VolumeResidencyBackend` are **unchanged**
  unless a genuine field gap is found (then a `shared-types`/engine extension
  needs its own validator + fixture).
- **Residency is integrated only after hydration**, never during transport: no
  `VolumeResidencyBackend` call happens between decode and hash verification.
- **OD-E is ratified:** the transport contract is **bridge-local**
  (`medical-engine`); it moves to `shared-types` only if it must be persisted in
  `.ncp` (then with a validator + fixture).
- **OD-F is ratified:** the **worker declares** `scalarDataDomain` and `rescale`;
  the **bridge verifies** coherence with `asset.valueSemantics`; TypeScript
  never converts or infers.
- **`view-engine` is untouched** — it declares `ResourceDemand` only and never
  sees a byte, handle or temp path.
- The **`rigid` registration path (2B.3b)** consumes the same hydration boundary
  to obtain the fixed/moving `sitk.Image`s and reports the accepted
  `SpatialTransform`; it does not change the transport.

### 10. Open decisions — ratification state

| ID | Decision | State |
| --- | --- | --- |
| OD-A | transport mechanism (worker-owned temp file) + security constraints | **RATIFIED** (with §2 constraints) |
| OD-B | size/memory limits (§6) | **`[TO RATIFY]`** — concrete values proposed |
| OD-C | lifecycle/TTL/cleanup/timeout (§7) | **`[TO RATIFY]`** — concrete values proposed |
| OD-D | error taxonomy (§8) | **`[TO RATIFY]`** — concrete codes proposed |
| OD-E | contract home (bridge-local) | **RATIFIED** |
| OD-F | scalar-domain/rescale ownership | **RATIFIED** |

## Consequences

- Real-source ingestion becomes possible without a second geometry authority and
  without `view-engine` involvement; ADR-004's fixture-only authority is retained
  for tests but is no longer the only ingestion route.
- **2B.3b** (real-IPC MI registration) is unblocked once this ADR is **Accepted**
  and implemented; `mode:"rigid"` then produces evidence on real volumes.
- P4.4b **remains blocked** independently: it still needs ADR-012 **Accepted**
  (R-1..R-4) and the R11-B admission policy.

## Evidence Required for Acceptance (2B.3b)

- A **committed synthetic volume fixture** (no patient data) with a declared
  dtype/byteOrder/dimensions/scalarDomain and a known SHA-256.
- A test that the **worker** produces a descriptor + binary payload whose hash,
  `byteLength` and geometry digest match the committed expectation, with an
  atomic-write/orphan-cleanup check.
- A test that the **bridge** reads the handle, verifies hash/length/digests, and
  refuses **every** §8 failure mode fail-closed, including a containment/traversal
  attempt and an expired handle.
- A test that the **engine** builds a `VolumeIngestionPlan` that loads and exposes
  exactly the worker geometry (named tolerance), extending the P3.2 harness.
- The **raw worker → bridge → engine** chain demonstrated with no `view-engine`
  import.

## Conditions That Might Warrant a Revision

- If shared memory becomes necessary for interactive latency at clinical sizes.
- If `.ncp` persistence must embed the transport descriptor (moves OD-E).
- If a non-DICOM volume format (e.g. NIfTI/NRRD) becomes a first-class source.

## Related

- ADR-002 (worker transport), ADR-004 (fixture-only ingestion), ADR-012
  (inter-study propagation, still Proposed), `PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`
  (2B.3b).
