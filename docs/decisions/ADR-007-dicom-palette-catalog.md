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
