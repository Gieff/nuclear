# ADR-013: Pixel/Volume Transport for Real-Source Volume Ingestion

## Status

**Accepted** — phase owner ratification received 2026-09-22 for ADR-013 and
OD-B, OD-C and OD-D. This ADR is now authoritative for slice **2B.3b**
(automatic MI registration on real volumes) and real-source ingestion alongside
[ADR-004](ADR-004-fixture-only-pixel-ingestion.md). The optional
`sopInstanceUIDsHash` canonicalization in §5 was additionally ratified on
2026-09-23.

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

§1–§8 are the accepted decision. The former open decisions are ratified as
recorded in §10. Values in §6/§7/§8 are accepted v1 deployment-profile
constraints, not universal clinical constants.

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
  `{ locator, seriesInstanceUID, expectedFingerprint, expectedFrameOfReferenceUID }`
  request, decodes the series, writes the voxel payload, and returns a **JSON
  transport descriptor** (no voxels in JSON — inline base64 is rejected for
  clinical volumes). The engine supplies the expected fingerprint and FoR from
  the registered asset; the worker checks them before payload publication.
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
  `contentHash`**. It also declares `publishedAt`, an absolute UTC RFC 3339
  timestamp for the publication instant used by the handle TTL.
- **Hash algorithm is mandatory: SHA-256** (`sha256:<hex>`).
- The descriptor's voxel **`contentHash` is distinct from** the source-series
  `SourceFingerprint.contentDigest`. The worker computes the latter from the
  raw DICOM instance bytes before pixel decoding, rescaling, or other mutation.
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
  engine supplies its expected `SourceFingerprint` and expected
  `FrameOfReferenceUID`; the worker returns observed values. The worker and
  bridge **fail-close** on any mismatch (content digest, instance count,
  geometric digest, study/series/FoR), mirroring the Phase 4 provenance ↔ asset
  cross-validation (C5), before the payload reaches the renderer. A mismatch
  returns `VOLUME_FINGERPRINT_MISMATCH` (`-32015`) with its closed reason.
- **Normative `contentDigest` canonization (owner-ratified 2026-09-22).** Read
  the exact original raw byte sequence of every DICOM instance belonging to the
  requested series, before rewriting or pixel conversion. Every instance must
  have a present, unique `SOPInstanceUID`; missing or duplicate UIDs refuse the
  operation and never produce a partial digest. Sort records lexicographically
  by the ASCII SOP Instance UID. For each sorted instance, append this record to
  the digest input, with every variable-length field length-delimited using an
  unsigned 64-bit big-endian byte count:

  ```text
  uint64be(len(domain)) || domain
  || uint64be(len(uidUtf8)) || uidUtf8
  || uint64be(rawByteLength)
  || sha256(rawInstanceBytes)[32]
  ```

  `domain` is the ASCII byte string `NuClear-DICOM-Series-Content-v1` and is
  included in **every** record. `uidUtf8` is the exact UTF-8 encoding of the
  validated SOP Instance UID. `rawByteLength` is the length of the original
  DICOM instance bytes. The series `contentDigest` is
  `sha256(concat(sortedRecords))`, formatted as `sha256:<64 lowercase hex>`.
  This source-series digest is never substituted with the scalar payload's
  separate `contentHash`.

  The descriptor's `correlation` carries the computed
  `SourceFingerprint` fields (`studyInstanceUID`, `seriesInstanceUID`,
  `instanceCount`, `contentDigest`, `geometricDigest`, `sopInstanceUIDsHash`,
  and `totalBytes`) plus the observed
  `frameOfReferenceUID`. If an optional expected fingerprint field is present,
  it is compared exactly; the worker never supplies a default for an absent
  expected value. The worker computes the observed SOP UID digest for every
  selected series, whether or not the caller supplied an expected value.

  **Normative `sopInstanceUIDsHash` canonicalization (owner-ratified
  2026-09-23).** Collect the `SOPInstanceUID` value of every selected-series
  instance. Missing, duplicate, or syntactically invalid UIDs refuse the
  operation fail-closed; no partial digest is emitted. Preserve each valid UID
  value exactly: no BOM, trimming, normalization, padding, or other transform.
  Encode each value as UTF-8 (valid DICOM UIDs are ASCII), and sort
  lexicographically by the original ASCII UID bytes. Build the canonical input:

  The worker captures the dataset `(0008,0018)` raw UI-VR value before pydicom
  conversion. It removes only the one standards-conformant terminal NUL VR pad
  required for an odd-length UID; that pad is not part of the logical UID value.
  A space pad, embedded NUL, BOM, non-ASCII byte, or any other non-conformant raw
  representation is refused. The bytes hashed below are the exact validated
  logical UID encoded as UTF-8, not the raw DICOM element bytes.

  ```text
  domainBytes = ASCII("NuClear-DICOM-SOPInstanceUIDs-v1")
  uint64be(len(domainBytes)) || domainBytes
  || uint64be(uidCount)
  || repeat(
       uint64be(uidUtf8Length)
       || uidUtf8Bytes
     )
  ```

  Every `uint64be` is an unsigned 64-bit big-endian integer. `uidUtf8Bytes` is
  the exact UTF-8 encoding of the validated UID value, with no BOM or Unicode
  normalization. The digest is
  `sha256:<64 lowercase hex>` over the complete canonical input. This digest
  identifies the ordered-independent set of instance UIDs; it is distinct from
  the raw-instance `contentDigest` and scalar payload `contentHash`. The worker
  includes the observed value in `correlation` and compares it with the expected
  value **only when** `expectedFingerprint.sopInstanceUIDsHash` is present. A
  mismatch returns `VOLUME_FINGERPRINT_MISMATCH` (`-32015`, reason `series`)
  before hydration; the bridge verifies the worker-reported value but never
  computes or normalizes it.

### 6. Limits (**OD-B — ratified v1 deployment profile; exact accounting**)

**Two distinct budgets, never conflated.**

**(a) Tracked transport payloads** — the bytes of temp files the worker has
produced and is tracking. This is **not** an RSS estimate.

| Limit | Ratified v1 value | Meaning |
| --- | --- | --- |
| `MAX_VOXELS_PER_VOLUME` | `2^28 = 268_435_456` | per decoded volume |
| `MAX_BYTES_PER_VOXEL` | `4` (float32) | largest accepted element type |
| `MAX_PAYLOAD_BYTES` | `2^30 = 1_073_741_824` (1 GiB) | per temp payload (= voxel cap × 4) |
| `MAX_RESIDENT_PAYLOADS` | `2` | **active, non-expired** handles |
| `MAX_TRACKED_PAYLOAD_BYTES` | `4 GiB` | sum of tracked temp-payload bytes (active + not-yet-swept expired) |

**(b) Registration working set** — process-level, for **one** MI registration
request (this replaces the ambiguous `MAX_REQUEST_PEAK_BYTES`):

```
estimate = bytesPerVoxel × (V_fixed + V_moving) × REGISTRATION_PYRAMID_OVERHEAD_FACTOR
```

with `REGISTRATION_PYRAMID_OVERHEAD_FACTOR = 3` (covers the full-resolution
SimpleITK `Float32` images, the multi-resolution pyramid at shrink `[4, 2, 1]`,
physical-unit smoothing buffers, interpolator and optimizer working arrays),
checked against **`MAX_REGISTRATION_WORKING_SET_BYTES = 8 GiB`** by a
**pre-flight estimate before loading**. Two maximum volumes (1 GiB each,
float32) estimate to `2 GiB × 3 = 6 GiB ≤ 8 GiB` and are allowed; the earlier
`2 GiB` figure silently ignored the pyramid and is withdrawn.

**(c) Concurrency.** The worker is single-threaded and **serializes** registration
requests (R4 forces 1 thread and determinism), so **at most one registration
working set** exists at a time; concurrent transport requests are serialized and
bounded by the tracked-payload budget. `MAX_RESIDENT_PAYLOADS` bounds live
handles, not concurrent registrations.

**Behaviour when a limit is exceeded:** fail closed with
`VOLUME_LIMIT_EXCEEDED` (reason `voxel-limit | payload-limit |
tracked-payload-limit | working-set-limit`), refusing **before** allocating where
the grid is known from metadata (otherwise as soon as the size is known).
**Never** truncate, downsample, subsample, or partially load.

**Profile, not clinical constant.** These are the **v1 deployment profile**;
changing them requires a new ratified profile, never an implicit edit.

### 7. Lifecycle, cleanup, timeout, cancellation (**OD-C — ratified with the precision below**)

- **Temp root / permissions:** worker-created, owner-only (`0700`); payload files
  `0600`. The bridge reads a file only after canonical-containment validation.
- **Atomic write** (§2) then descriptor; no handle exists until the file is
  complete and hashed.
- **TTL:** `HANDLE_TTL_SECONDS = 300` (5 min), **starting at descriptor
  publication** (not at request receipt). The TTL is a **declared v1 deployment
  policy profile**, not implicit modifiable behaviour. It is **checked on every
  bridge read** (and on release/use); an expired handle fails closed and its file
  is swept.
- The descriptor carries the exact UTC `publishedAt` instant sampled for the
  worker-side handle record and its `ttlSeconds`; `ttlSeconds` must equal the
  advertised handshake capability. The bridge checks
  `now < publishedAt + ttlSeconds` before and after reading/verifying bytes.
- If a volume request times out before its descriptor is received, the handle is
  unknown: the bridge terminates and restarts the worker before returning the
  timeout, triggering the startup orphan sweep. If the descriptor was received,
  the bridge releases its known handle in `finally`; cleanup failure is not
  success.
- **Orphan cleanup at start:** the worker deletes every payload file in its temp
  root at startup, because **no handle survives a restart**.
- **Crash behaviour:** a worker crash fails any pending request; a **restart
  invalidates all handles**; the temp root is cleaned at the next worker start.
- **Release after timeout — explicitly defined:**
  - if the descriptor (and therefore the handle) was **already received**, the
    bridge calls `nuclear.volume.release { handle }` (idempotent);
  - if the timeout expires **before the descriptor exists** (handle unknown), the
    bridge **terminates and restarts the worker** (its existing supervisor
    primitive). This is the chosen cancellation model: there is no safe
    protocol-level cancel that guarantees the temp file is removed, and the
    restart triggers orphan cleanup deterministically.
- **Failed cleanup is never reported as success.** A release/unlink failure
  yields `VOLUME_CLEANUP_FAILED`, is **retryable**, and leaves the file
  **quarantined** for the next orphan sweep; the caller must not assume the file
  is gone. This is distinct from a successful idempotent no-op on an
  already-released handle.
- Handles are **single-owner** (the owning bridge session); use of a released or
  expired handle fails closed.

### 8. Failure taxonomy (**OD-D — ratified with the behaviour table below**)

Reserved worker error codes in `-32000..-32099`; each carries a non-empty
`data.diagnostic`, a `reason` from the closed enum below, and **no fallback**.

| Code | Name | `reason` enum | Retryable? | Diagnostic fields |
| --- | --- | --- | --- | --- |
| `-32013` | `VOLUME_DECODE_FAILED` | `unsupported-pixel-representation`, `missing-pixel-format`, `decode-error` | **terminal** (same input) | `diagnostic`, `reason`, `seriesInstanceUID` |
| `-32014` | `VOLUME_LIMIT_EXCEEDED` | `voxel-limit`, `payload-limit`, `tracked-payload-limit`, `working-set-limit` | **terminal** | `diagnostic`, `reason`, `seriesInstanceUID`, `expected?`, `observed?` |
| `-32015` | `VOLUME_FINGERPRINT_MISMATCH` | `content-digest`, `geometric-digest`, `instance-count`, `series`, `frame-of-reference` | **terminal** | `diagnostic`, `reason`, `seriesInstanceUID`, `expectedDigest?`, `observedDigest?` |
| `-32016` | `VOLUME_TRANSPORT_INTEGRITY` | `hash-mismatch`, `file-short`, `file-long`, `file-missing` | **retryable** (re-issue the request) | `diagnostic`, `reason`, `handle?` |
| `-32017` | `VOLUME_HANDLE_INVALID` | `unknown-handle`, `expired-handle`, `already-released` | **retryable** (re-hydrate) | `diagnostic`, `reason`, `handle?` |
| `-32018` | `VOLUME_CLEANUP_FAILED` | `release-failed`, `unlink-failed` | **retryable**; file **quarantined** (it may still exist) | `diagnostic`, `reason`, `handle?` |

- **Retryability** is a caller contract: `terminal` errors fail the same input
  deterministically; `retryable` errors may be retried by re-issuing the request
  or re-hydrating.
- **`handle` is present only when an handle exists**; diagnostics **never**
  contain a filesystem path, payload bytes, or sensitive content.
- `cleanup-failed` **does not mask** the fact that the file may still exist — it
  is reported as cleanup-failed and quarantined, never as success.
- A failure never yields a partial or synthetic plane. The pre-2B.3b `-32011`
  `mode:"rigid"` stub is replaced by the implemented worker path only when the
  worker→bridge→engine acceptance evidence is satisfied; otherwise the path
  remains unaccepted and must not be treated as available.

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
| OD-B | size/memory limits, **exact accounting** (§6) | **RATIFIED** — `MAX_REQUEST_PEAK_BYTES` withdrawn; tracked-payload budget vs registration-working-set budget separated |
| OD-C | lifecycle/TTL/cleanup/timeout (§7) | **RATIFIED** — TTL from descriptor publication, checked on every use/read; restart invalidates handles; failed cleanup retryable and quarantined |
| OD-D | error taxonomy (§8) | **RATIFIED** — reserved codes `-32013..-32018`, closed reasons, retryability and per-code diagnostics |
| OD-E | contract home (bridge-local) | **RATIFIED** |
| OD-F | scalar-domain/rescale ownership | **RATIFIED** |

The exact source-series `contentDigest` canonicalization above was ratified by
the phase owner on 2026-09-22. It closes the previously unspecified digest
algorithm without changing the `.ncp` or `SourceFingerprint` shape.

The optional `SourceFingerprint.sopInstanceUIDsHash` is supported, not globally
disabled. Its exact domain separator, byte framing, UID handling and comparison
rule in §5 were ratified by the phase owner on 2026-09-23. The SOP UID digest is
independent of both source-byte `contentDigest` and scalar payload `contentHash`.

OD-A through OD-F, including OD-B/C/D, are ratified. No further design change
is required for 2B.3b; any deviation requires an ADR revision.

## Consequences

- Real-source ingestion is possible without a second geometry authority and
  without `view-engine` involvement; ADR-004's fixture-only authority is retained
  for tests but is no longer the only ingestion route.
- **2B.3b** (real-IPC MI registration) is implemented under this **Accepted** ADR;
  `mode:"rigid"` produces evidence on real volumes through the verified worker →
  bridge → engine path.
- P4.4b **was blocked** independently of this ADR: ADR-012 is now **Accepted**
  (2026-09-23, R-1..R-4), so P4.4b is ready but **not yet implemented**; the
  R11-B admission policy still applies (MI without `errorMarginMm`
  non-admissible).

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
  (inter-study propagation, Accepted 2026-09-23), `PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`
  (2B.3b).
