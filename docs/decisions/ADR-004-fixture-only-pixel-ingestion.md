# ADR-004: Fixture-Only Pixel Ingestion for P3.2 Volume Loading

## Status

Accepted

## Date

2026-09-21

## Context

P3.2 must load pixel-bearing CT and PT volumes into Cornerstone3D from an
accepted `ImagingAsset` plus Phase 2 worker evidence. Cornerstone's
`volumeLoader.createLocalVolume(volumeId, { metadata, dimensions, spacing,
origin, direction, scalarData })` is the only path that lets NuClear supply
geometry verbatim instead of letting Cornerstone parse DICOM. Using
`@cornerstonejs/dicom-image-loader` was rejected: it would create a second,
independent geometry authority, contradicting the Phase 3 plan's requirement
that metadata and geometry remain authoritative from the Python worker.

`createLocalVolume` requires the caller to provide:
- the physical geometry (dimensions, spacing, origin, direction),
- a Cornerstone `Metadata` pixel-format block,
- the scalar voxel data.

`AssetMetadata` and the Phase 2 `nuclear.dicom.geometry`/`inspect` results do
**not** carry the pixel-format facts (`BitsAllocated`, `BitsStored`, `HighBit`,
`PixelRepresentation`, `PhotometricInterpretation`, `SamplesPerPixel`), and no
worker operation transports voxel arrays. A pixel-format authority is therefore
missing for real sources.

## Decision

For P3.2, NuClear adopts a **fixture-only pixel-ingestion capability**. It is
explicitly *not* a claim of generic real-source pixel ingestion.

1. **Cornerstone volume construction uses `createLocalVolume`** with geometry
   copied verbatim from accepted `WorkerGeometryComputed.assetGeometry` and
   `sliceNormal`. TypeScript never parses DICOM, never computes a cross
   product, and never corrects `origin`, `spacing` or `direction`. The 3×3
   Cornerstone direction is assembled from the worker's row direction, column
   direction and slice normal; its element order must be verified against
   Cornerstone's convention by test, not assumed.
2. **Pixel data is a committed, validated test payload.** Each fixture
   directory contains committed pixel-bearing DICOM instances, a `pixels.json`
   payload, a `fixture.json` descriptor and an `expected-geometry.json` worker
   result. The payload is generated deterministically by a committed,
   test-only Python script and validated against the committed DICOM and the
   real worker output.
3. **The payload and descriptor are test-only.** They are neither a runtime
   `.ncp` representation nor a clinical authority. They must not be reachable
   from product code paths or persisted as project state.
4. **The descriptor declares, without inference:** pixel dtype, signedness,
   byte order, `SamplesPerPixel`, bit layout, the scalar-data domain
   (`stored-values` | `rescaled-hu` | `rescaled-bqml`) and, when applicable,
   rescale slope/intercept. TypeScript consumes these verbatim; it never
   infers a format from a filename, a modality or a value range.
5. **The loaded Cornerstone volume must expose exactly the worker geometry**,
   including the normalized slice order, with no TypeScript adjustment. The
   test proves this using Cornerstone's own transform/registry, with a named
   tolerance, rather than by re-deriving geometry in the test.
6. **Fail-closed ingestion validation is pure and Node-testable:** unavailable
   or mismatched availability, unsupported classification, non-computed
   evidence and asset↔evidence geometry disagreement all refuse to produce a
   load plan.

## Consequences

- P3.2 can load real Cornerstone volumes with worker-authoritative geometry
  without introducing a second geometry authority or extending the worker
  protocol.
- The pixel-format authority for this slice is the committed fixture
  descriptor. This is recorded as explicit debt: **generic pixel ingestion
  from real sources will require a separate, verifiable hydration boundary**
  (a declared pixel-format + voxel transport contract), and this debt must not
  be hidden behind `SourceLocator`.
- P3.4 inherits a bridge test: the PT fixture declares and proves which
  scalar-data domain Cornerstone receives, because the PET/CT radiometry
  specification's SUV ↔ Bq/mL validity depends on that domain being declared
  and verified. P3.2 asserts the domain; it does not perform SUV conversion.
- Optionally extending the worker and `AssetMetadata` with pixel-format facts
  (rejected here as out of P3.2 scope) remains the long-term route for real
  sources.

## Conditions That Might Warrant a Revision

- When real-source ingestion is scoped: a hydration-boundary ADR must replace
  the fixture-only authority.
- If Cornerstone's local-volume metadata contract changes such that geometry
  or pixel format can be supplied more authoritatively.
