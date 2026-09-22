# ADR-013: Pixel/Volume Transport for Real-Source Volume Ingestion

## Status

**Proposed** — must be ratified before slice **2B.3b** (automatic MI registration
on real volumes) and before any real-source ingestion replaces the fixture-only
authority of [ADR-004](ADR-004-fixture-only-pixel-ingestion.md). No product code
may depend on this ADR until its Status is **Accepted**. The open decisions in
§9 are **not yet met**.

## Date

2026-09-22

## Context

ADR-004 (Accepted) delivered a **fixture-only** pixel-ingestion capability: the
worker transports no voxel arrays, `AssetMetadata` and the Phase 2
`nuclear.dicom.geometry`/`inspect` results carry no pixel-format facts, and the
pixel-format authority for P3.2 is a committed test descriptor. ADR-004 recorded
the debt explicitly:

> generic pixel ingestion from real sources will require a separate, verifiable
> hydration boundary (a declared pixel-format + voxel transport contract), and
> this debt must not be hidden behind `SourceLocator`.

Phase 2B closes the Procrustes path, but the automatic **MI registration** path
(`nuclear.registration`, `mode: "rigid"`) cannot run: the worker has no way to
obtain the fixed/moving volumes (Phase 2B.3a is a pure core on `sitk.Image`, and
`mode: "rigid"` still returns `-32011`). Implementing MI end-to-end would either
require the worker to re-parse DICOM pixels — creating a **second geometry
authority** and violating the Phase 2B exclusion of DICOM parsing — or require a
transport contract that does not exist today.

Two invariants constrain the answer:

1. **No second geometry authority.** Physical geometry stays authoritative from
   the worker's accepted geometry evidence; the transport must not derive or
   correct geometry.
2. **`view-engine` is not involved in transport.** It continues to declare only
   `ResourceDemand`; byte movement lives in the worker + `@nuclear/medical-engine`
   bridge.

## Decision

The following is the proposed model. §1–§8 are the intended decision; §9 lists
the items that still require explicit ratification.

### 1. Ownership — the worker decodes pixels; TypeScript never does

- The **Python scientific worker** owns pixel decoding and voxel production for
  real sources. It may use `pydicom`/`SimpleITK` readers internally, but **all
  geometry** it reports must match the accepted worker geometry evidence
  (`WorkerGeometryComputed.assetGeometry` + `sliceNormal`); the reader's own
  derived geometry is never the authority.
- `@cornerstonejs/dicom-image-loader` and every TypeScript DICOM parser remain
  **forbidden** (ADR-004 §1 unchanged). The `medical-engine` consumes bytes, not
  DICOM.

### 2. Transport mechanism — descriptor on stdio, voxels in a binary temp file

- A new worker operation **`nuclear.dicom.volume`** validates a
  `{ locator, seriesInstanceUID }` request, decodes the series, and returns a
  **JSON transport descriptor** (no voxels in JSON — inline base64 is rejected
  for clinical volumes).
- The voxel bytes are written by the worker to a **binary temp file** in a
  NuClear-controlled temp root (the location is **[TO RATIFY]**, §9). The
  descriptor carries the file path as an opaque `handle` plus a content hash.
- A companion operation **`nuclear.volume.release`** deletes the temp file and
  invalidates the handle. The bridge owns reading the file, verifying its hash,
  and copying it into the caller's `VolumePixelPayload`.
- **Rejected for v1:** shared-memory segments (platform-specific lifecycle,
  harder headless tests) and inline base64 (memory/CPU blow-up). Shared memory
  may supersede this mechanism later under its own ADR.

### 3. Binary format — declared, never inferred

- The payload is a **dense, C-contiguous little-endian (or explicitly declared
  big-endian) scalar array** whose element type is exactly one of the
  already-accepted `VolumeScalarDataType` values:
  `int8 | uint8 | int16 | uint16 | float32` (ADR-004 P3.2.1 restriction; Cornerstone
  `createLocalVolume` byte-length support).
- The descriptor declares **dtype, `byteOrder`, `signedness`, `samplesPerPixel`,
  `bitsAllocated`/`bitsStored`/`highBit`, `photometricInterpretation`,
  `scalarDataDomain` (`stored-values | rescaled-hu | rescaled-bqml`), optional
  `rescale` slope/intercept, `dimensions [nx, ny, nz]`, `byteLength`, and
  `contentHash`** (e.g. `sha256:...`).
- TypeScript **consumes these verbatim**: it never infers a format from a
  filename, modality, or value range (ADR-004 §4). The transported fields are a
  superset-compatible subset of the existing `VolumePixelPayload` minus the
  in-memory `scalarData`, plus `byteOrder` and `byteLength`.

### 4. Geometry and orientation — reuse the accepted evidence

- The volume request/response **does not carry a new geometry**. The caller
  already holds the accepted `WorkerGeometryComputed.assetGeometry`; the
  descriptor carries the same **`geometricDigest`** the geometry operation
  produced. The bridge **fail-closes** if the transported digest differs from the
  accepted geometry evidence, before any `VolumeIngestionPlan` is built.
- `assembleCornerstoneDirection` (row direction, column direction, slice normal)
  is unchanged and stays the single orientation path. No cross product, no sign
  flip, no re-normalisation in TypeScript.

### 5. Correlation — asset / series / FoR / fingerprint

- The request carries the existing `SourceLocator` + `seriesInstanceUID`. The
  bridge/engine passes its expected `SourceFingerprint`
  (`studyInstanceUID`, `seriesInstanceUID`, `instanceCount`, `contentDigest`,
  optional `sopInstanceUIDsHash`, optional `geometricDigest`, optional
  `totalBytes`), and the worker returns its **observed** corresponding values in
  the descriptor.
- The bridge **fail-closes** on any mismatch (content digest, instance count,
  geometric digest, series/FoR), mirroring the Phase 4 provenance ↔ asset
  cross-validation (C5), **before** the payload reaches the renderer.

### 6. Lifecycle, cleanup, timeout, cancellation

- The worker creates the temp root on demand and deletes payload files on
  `nuclear.volume.release`, on worker restart, and on a **TTL** (§9). Orphan
  cleanup runs at worker start.
- The bridge applies its existing per-request **timeout** to
  `nuclear.dicom.volume`; a timeout rejects the caller and triggers a release.
- **Cancellation:** the bridge's process lifecycle (restart) is the cancellation
  primitive; a cancelled/aborted request must never leave a reachable handle.
- Handles are **single-owner**: reading a released/expired handle fails closed.

### 7. Failure taxonomy — explicit, never a plausible fallback

New reserved worker error codes (range `-32000..-32099`, **[TO RATIFY]** §9)
and/or structured `reason` strings, covering at least:

- unsupported pixel representation / missing pixel-format tag;
- unsupported classification or missing geometry evidence;
- size/memory limit exceeded;
- digest / geometry / series / FoR mismatch;
- handle unavailable, expired, or already released;
- transport read failure (missing/short/corrupt file);
- cleanup failure.

A failure never yields a partial or synthetic plane. `mode:"rigid"` keeps
returning `-32011` until 2B.3b is implemented.

### 8. Integration with `VolumeIngestionPlan` / `VolumeResidencyBackend`

- The transport sits **before** `buildVolumeIngestionPlan`. It produces the
  `pixels: VolumePixelPayload` that `VolumeIngestionRequest` already expects;
  `buildVolumeIngestionPlan` and the residency backend are **unchanged** unless a
  genuine field gap is found (then a `shared-types`/engine extension needs its
  own validator + fixture).
- The registration path (`2B.3b`) consumes the same hydration boundary to obtain
  the fixed/moving `sitk.Image`s; it reports the accepted `SpatialTransform` and
  does **not** change the transport.
- `view-engine` is untouched: it declares `ResourceDemand` only and never sees a
  byte, a handle, or a temp path.

### 9. Open decisions (require ratification before Acceptance)

- **OD-A — Transport mechanism:** worker-written temp file (§2) vs a
  bridge-provided path vs shared memory. Recommendation: worker-written temp file
  under a NuClear-controlled root.
- **OD-B — Max volume size / memory:** a hard voxel-byte and resident-volume
  ceiling. Candidate values **[TO RATIFY]**.
- **OD-C — Handle TTL / cleanup:** the expired-handle timeout and orphan-cleanup
  policy. Candidate value **[TO RATIFY]**.
- **OD-D — Error taxonomy:** the exact reserved codes vs `reason` strings.
- **OD-E — Contract home:** whether the transport descriptor stays bridge-local
  (`medical-engine`) or becomes a `shared-types` contract (needed only if it must
  be persisted in `.ncp`). Recommendation: bridge-local until persistence is
  scoped.
- **OD-F — Scalar domain ownership:** whether the worker or the caller declares
  `scalarDataDomain`/`rescale` (recommendation: the worker declares, the caller
  verifies against `asset.valueSemantics`; no conversion in TypeScript).

## Consequences

- Real-source ingestion becomes possible without a second geometry authority and
  without `view-engine` involvement; ADR-004's fixture-only authority is retained
  for tests and is no longer the only ingestion route.
- **2B.3b** (real-IPC MI registration) is unblocked once this ADR is Accepted and
  implemented; `mode:"rigid"` then produces evidence on real volumes.
- P4.4b **remains blocked** independently: it still needs ADR-012 **Accepted**
  (R-1..R-4) and the 2B.4/R11-B admission policy, not merely this transport.
- Determinism/evidence obligations (R4) extend to the transport: the same
  synthetic fixture must be reproducible, and the worker→bridge→engine chain must
  be independently verifiable headlessly.

## Evidence Required for Acceptance (2B.3b)

- A **committed synthetic volume fixture** (no patient data) with a declared
  dtype/byteOrder/dimensions/scalarDomain and a known content hash.
- A test that the **worker** produces a descriptor + binary payload whose hash,
  size and geometry digest match the committed expectation.
- A test that the **bridge** reads the handle, verifies the hash/digests, and
  refuses every failure mode in §7 fail-closed.
- A test that the **engine** builds a `VolumeIngestionPlan` that loads and exposes
  exactly the worker geometry (named tolerance), extending the P3.2 harness.
- The **raw worker → bridge → engine** chain demonstrated, with no `view-engine`
  import.

## Conditions That Might Warrant a Revision

- If shared memory becomes necessary for interactive latency at clinical volume
  sizes.
- If `.ncp` persistence must embed the transport descriptor (would move OD-E to
  `shared-types` with a validator and fixture).
- If a non-DICOM volume format (e.g. NIfTI/NRRD) becomes a first-class source.

## Related

- ADR-002 (worker transport), ADR-004 (fixture-only ingestion; superseded for
  real sources by this ADR once Accepted), ADR-012 (inter-study propagation,
  still Proposed), `PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md` (2B.3b).
