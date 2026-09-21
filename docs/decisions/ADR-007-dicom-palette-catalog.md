# ADR-007: DICOM Colour Palette Catalog

## Status

Accepted

## Date

2026-09-21

## Context

PET/CT fusion requires colour palettes. Previously the fusion contract left
`colormapId` as an unvalidated caller string (ADR-005/ADR-006), so a renderer
had no ratified palette authority: any typo or unregistered name would either
fail at render time or silently fall back. The rendering-presets package also
lacked a declarative palette surface.

DICOM PS3.6 Table B.1-1 defines well-known colour palettes as SOP Instances
under the UID root `1.2.840.10008.1.5`. The nuclear-medicine set is:

| Content label | SOP Instance UID |
| --- | --- |
| `HOT_IRON` | `1.2.840.10008.1.5.1` |
| `PET` | `1.2.840.10008.1.5.2` |
| `HOT_METAL_BLUE` | `1.2.840.10008.1.5.3` |
| `PET_20_STEP` | `1.2.840.10008.1.5.4` |

Each palette is a 256-entry RGB lookup table; Cornerstone's
`utilities.colormap.registerColormap({ name, Name, ColorSpace, RGBPoints })`
accepts a flat `[x, r, g, b, …]` transfer function (256 × 4 = 1024 values), and
`registerColormap` is idempotent (it overwrites a same-named entry rather than
throwing).

## Decision

1. **`@nuclear/rendering-presets` owns a declarative DICOM palette catalog.**
   `DicomPaletteDefinition` = `{ id, contentLabel, sopUid, colorSpace: 'RGB',
   rgbPoints }`, with the four nuclear-medicine palettes above exported as
   `DICOM_PALETTE_CATALOG` plus lookup helpers. The package stays a leaf:
   no Cornerstone import, no registration side effects.

2. **`@nuclear/medical-engine` owns typed registration.** A browser-only
   adapter maps each catalog entry explicitly onto Cornerstone's
   `ColormapRegistration` and registers it via
   `utilities.colormap.registerColormap`, under both the palette `name`
   (e.g. `Hot Iron`) and its `contentLabel` (e.g. `HOT_IRON`). Registration is
   idempotent (overwrite) and returns the registered names; it is exported only
   from `renderer/index.ts`.

3. **Data authority is DICOM PS3.6 Table B.1-1**, not MedCanvas. The local
   `oracle/` mirror may only be used as a retrieval aid; the catalog is
   NuClear-owned data and must be validated by NuClear tests, not trusted
   because it exists in the mirror.

4. **Structural validation.** Tests assert the catalog invariants available
   without a DICOM conformance tool: four palettes with the exact SOP UIDs,
   1024 RGB points each (256 × `x, r, g, b`), `x` monotonic non-decreasing from
   `0` to `1`, first entry black `(0,0,0,0)` and last entry white `(1,1,1,1)`,
   unique `id`/`contentLabel`, and a resolving lookup. The real-harness test
   asserts Cornerstone actually lists and resolves the registered palettes.

5. **No silent defaults.** A `MedicalViewState` `colormapId` must name a
   declared catalog entry; the renderer still never invents a palette.

## Consequences

- Fusion overlays and single PET views can reference ratified
  `contentLabel`/`name` values instead of arbitrary strings.
- P3.4-B applies palettes through the typed registration step before any
  `setProperties` call.
- Pet colormaps become tester-visible NuClear data, closing the ADR-005
  "caller-declared string" gap without inventing clinical values.

## Conditions That Might Warrant a Revision

- If the PET palette set needs seasonal/MRI palettes, they must be added with
  their DICOM UIDs and structural tests.
- If Cornerstone's registration API or RGB point layout changes, the typed
  adapter must be updated and re-verified.

## Addendum (P3.4-B.1.1, 2026-09-21): canonical persisted id, whole-LUT digest, registration dedupe

This addendum closes the P3.4-B.1 preflight gap before P3.4-B.2 applies a
palette to a volume viewport. It does not implement that application.

1. **Canonical persisted `colormapId`.** The persisted/presented
   `PresentationState.colormapId` and `PetFusionOverlayPresentation.colormapId`
   form is the stable NuClear catalog id — the `id` field of a
   `DicomPaletteDefinition`, e.g. `dicom-pet` — resolved by
   `findDicomPaletteById`. The DICOM content label (`PET`) and the Cornerstone
   registration name (`PET`) are not persisted identities. The renderer
   resolves a stable id to the Cornerstone name internally, before any
   `setProperties` call, via `@nuclear/medical-engine`'s
   `resolveDicomPaletteById`, which returns
   `{ id, cornerstoneColormapName, contentLabel, sopUid }`. An unknown or empty
   id raises a typed `PaletteResolutionError` with code `PALETTE_NOT_FOUND`
   whose message names the received id and states that it must be a declared
   catalog id. No default palette is substituted. Cornerstone built-ins such as
   `gray` are not catalog ids and are resolved by a separate fail-closed path in
   P3.4-B.2 (see the `view-contracts` fixture note).

2. **Whole-LUT regression digest.** `tests/presets/dicom-palettes.test.ts`
   pins a SHA-256 (lowercase hex) digest per palette over exactly 1024 bytes
   `b[i] = clamp(round(rgbPoints[i] * 255), 0, 255)` — the whole
   `[x, r, g, b] × 256` transfer function quantised to the DICOM 8-bit LUT the
   palette denotes. The expected digests were derived from the DICOM PS3.6
   Table B.1-1 8-bit tables cross-checked against pydicom's bundled well-known
   palette SOP instances. Pinned values:

   | Stable id | Whole-LUT SHA-256 |
   | --- | --- |
   | `dicom-hot-iron` | `ca6c2927abca13b899a7d88fef1231ac9a0f09cecfc6402f1a544d22a33c791e` |
   | `dicom-pet` | `d7a1f92cd7b2c2df82f0e6fe5211af10a6136fd348299272674693996f63f039` |
   | `dicom-hot-metal-blue` | `c3a09a60bd404de71385e4e39a3cf22586a217767c019ce06334cbdead737146` |
   | `dicom-pet-20-step` | `b3b98b418920617ae7a242e828a869be59b93e5d187d346137ad26c59c868b67` |

   Any mutated byte, or a changed table length, changes the digest and fails
   the test.

3. **Registration dedupe — seven unique names.** Because `PET` has an identical
   `name` and `contentLabel`, registering both forms verbatim would touch the
   same registry key twice. The registration adapter dedupes the two forms per
   palette, so the four palettes create exactly seven unique Cornerstone
   registry names, in deterministic catalog order: `Hot Iron`, `HOT_IRON`,
   `PET`, `Hot Metal Blue`, `HOT_METAL_BLUE`, `PET 20 Step`, `PET_20_STEP`.
   Idempotence and rethrow-on-failure behaviour are unchanged.
