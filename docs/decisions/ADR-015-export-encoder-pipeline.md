# ADR-015: Publication Export Encoder Pipeline (P5.6 / P5.7)

## Status

**Accepted** (phase owner, 2026-09-23): **Track 1** with all proposed defaults
**OD-6a … OD-6g** ratified. See “Ratification Record”. No code or dependency is
added by this record itself; P5.6/P5.7 implement behind the encoder port.

## Date

2026-09-23

## Context

Phase 5 closes the publication path: P5.5 produces one high-resolution medical
raster per panel through the renderer port; P5.6 must compose the flattened
TIFF/PNG figure and P5.7 the hybrid vector PDF. ADR-014 D5 already fixed the
architecture: encoders sit **behind ports**, `figure-engine` composes layers and
emits a portable composition plan, does not vendor an encoder, and any external
PDF/TIFF/PNG library requires its own ADR with explicit owner sign-off.

The export must honour NuClear's headless-first, UI-agnostic and DOM-free
constraints: it has to run in Node (tests, CI, the Electron main/utility
process), **not** require a browser, `OffscreenCanvas`, Playwright, or a native
`node-canvas` build. It must also be deterministic (P8: identical inputs →
byte-stable output) and record output provenance.

This ADR evaluates encoder libraries and pipeline shapes for P5.6/P5.7 and
records the decisions the owner must ratify. The owner's stated preference is a
**pure, Node-safe (or isomorphic), DOM-free pipeline**; this ADR is framed around
that preference.

## Requirements

- **R1 — Node-safe / isomorphic / DOM-free.** No DOM, WebGL, `OffscreenCanvas`
  or native canvas; no mandatory headless browser.
- **R2 — Port boundary.** `figure-engine` owns the composition plan and the
  encoder port; the encoder implementation is caller-supplied (ADR-014 D5).
- **R3 — Determinism.** Byte-stable output for identical inputs: no wall-clock
  or random identifiers in the payload, fixed compression parameters, stable
  object/chunk/tag order, a declared metadata policy.
- **R4 — Physical fidelity.** The medical raster is incorporated at the physical
  panel aperture and DPI already validated by P5.5 (no upscaling, no
  re-rasterisation of medical data).
- **R5 — Colour.** Declare sRGB explicitly; never guess or copy an undeclared
  profile; do not silently convert.
- **R6 — Hybrid PDF.** Medical panel = native high-resolution raster;
  typography, panel letters, badges, scalebars and annotations = native PDF
  vector primitives in Figure Sheet millimetres.
- **R7 — Provenance.** Record dimensions, DPI, colour profile, encoder name and
  version, and renderer identity.
- **R8 — Evidence.** Curated fixtures, declared tolerances and reproducible
  tests (round-trip and byte-determinism), never a fabricated pass.

## Candidate Evaluation

### Raster — PNG (P5.6)

| Candidate | Kind | Pros | Cons |
| --- | --- | --- | --- |
| **A. Minimal writer + `node:zlib`** | pure (built-in) | zero third-party dependency; full control of filters/level/chunks → strongest determinism; streaming deflate | we write and own the RFC 2083 encoder; must test carefully |
| **B. `upng-js`** | pure JS/Wasm-free | tiny, portable, no native; used widely in browsers/Node | internal deflate implementation varies by version; fewer colour options; must prove determinism by pinning |
| **C. `pngjs`** | pure JS | mature, streaming, uses `zlib` | extra dependency for what `zlib` already provides |
| **D. `sharp`** | native (libvips) | fastest; strong ICC handling | native binaries per OS/arch; non-deterministic across libvips/OS builds; heavy install; violates the pure/portable preference for v1 |

### Raster — TIFF (P5.6)

| Candidate | Kind | Pros | Cons |
| --- | --- | --- | --- |
| **A. Minimal baseline TIFF writer + `node:zlib` Deflate** | pure (built-in) | deterministic; controls IFD tag order/values; Deflate via built-in zlib keeps files reasonable | we own the TIFF 6.0 writer; must test readers/tags |
| **B. `utif`** | pure JS | pure, no native; encode/decode | limited compression/tag control; determinism depends on version |
| **C. `sharp`** | native | fast, LZW/Deflate, ICC | same native/determinism caveats as PNG-D |

### Hybrid PDF (P5.7)

| Candidate | Kind | Pros | Cons |
| --- | --- | --- | --- |
| **A. `pdf-lib`** | pure TS/JS | vector primitives + image XObjects; runs in Node; deterministic with fixed metadata/IDs; TypeScript-friendly | custom font embedding needs `@pdf-lib/fontkit`; some layout features are manual |
| **B. `pdfkit`** | pure JS, Node streams | richer typography/graphics | heavier dependency tree (fontkit etc.); more API surface to constrain for determinism |
| **C. Minimal hand-rolled PDF** | pure | maximal control/determinism | fonts, encodings, colour spaces and text metrics are costly to get right and to keep correct |
| **D. Chromium/print or `node-canvas`** | native/DOM | familiar raster-to-PDF | explicitly rejected: violates R1 (headless-first, DOM-free) |

## Recommended Candidates (for ratification)

- **Track 1 (recommended): pure, dependency-minimised.**
  PNG and TIFF via a minimal writer over Node's built-in `node:zlib`
  (deterministic Deflate), and PDF via **`pdf-lib`**. No native binaries; the
  strongest determinism and the smallest supply-chain surface. The hand-rolled
  writers are bounded (baseline PNG + baseline TIFF) and fully covered by
  round-trip/determinism tests.
- **Track 2 (fallback): pure JS libraries.**
  **`upng-js` + `utif` + `pdf-lib`** if maintaining the minimal writers is judged
  too costly. All are Wasm-free pure JS and run unchanged in Node and the
  browser; determinism requires pinning versions and recording the encoder
  version in provenance.
- **Rejected for v1: `sharp` (and any native/`node-canvas` path).**
  The export is offline, not interactive; native binaries per OS/arch undermine
  byte-determinism and portable installs. It may be reconsidered later behind the
  same port (see “Conditions That Might Warrant a Revision”).

### Performance discussion (why pure JS is acceptable here)

- One 80 mm panel at 600 DPI is 1890×1890 RGBA ≈ **13.6 MiB** raw; a full
  180×120 mm sheet at 600 DPI is 4252×2835 ≈ **48 MiB** raw. Deflate is the
  dominant cost.
- Native `zlib` (Track 1) deflates such buffers in the sub-second to low-second
  range; pure-JS deflate (Track 2) is roughly an order of magnitude slower
  (single-digit seconds for the largest sheets). Publication export is an
  offline, user-initiated operation behind an async port with progress reporting,
  so this is acceptable; interactivity is never on this path.
- Memory: the composition plan should let the encoder process one panel raster at
  a time and stream the Deflate output, bounding peak memory to the sheet plus
  one panel.

## Direction for the Port Contract (proposal; P5.6 will formalise)

- `figure-engine` emits a deterministic **`PublicationCompositionPlan`**:
  sheet dimensions in mm, DPI, computed pixel dimensions, the ordered layers
  (raster panels referencing the P5.5 `PublicationPanelRaster` plus vector
  primitives in sheet mm) and provenance.
- `figure-engine` defines an **`EncoderPort`**
  (`encodePng`/`encodeTiff`/`encodePdf` → `EncodedArtifact`); the implementation
  lives outside `figure-engine` (composition root or a dedicated adapter),
  consistent with ADR-014 D5.
- An annotation whose resolved opacity is `0` (the OD-4 fade endpoint) is omitted
  from the plan, never emitted as a zero-opacity primitive.

## Determinism Contract (to ratify)

- No wall-clock, locale, random or process identifiers in the payload; any
  timestamp comes from declared provenance, not `Date.now()`.
- Fixed compression algorithm/level; fixed PNG filter strategy; fixed TIFF
  compression; stable chunk/IFD/object ordering.
- PDF `/ID` and metadata derive deterministically from the content (hash), or are
  fixed; `/Producer` carries a fixed engine string.
- The encoder name **and version** are recorded in output provenance; encoder
  dependency versions are pinned in the lockfile.
- Determinism is proven by encoding the same plan twice and asserting identical
  bytes, plus a decoder round-trip on a curated fixture.

## Ratification Record (2026-09-23, phase owner)

The owner ratified **Track 1** and every proposed default:

- **OD-6a — Raster track: Track 1 (ratified).** Minimal writers over
  `node:zlib` for the RGBA8 subset; microscopic control of chunk/tag order for
  byte-determinism, with the built-in C `zlib` deflate and no native binaries.
- **OD-6b — TIFF form: baseline TIFF 6.0 + Deflate (ratified).**
- **OD-6c — Colour: declare sRGB, no embedded ICC in v1 (ratified).** ICC/PDF-X
  embedding is deferred to an editorial need.
- **OD-6d — Encoder location: composition-root adapter, no new package
  (ratified).** `figure-engine` keeps the port and the pure composition; the
  concrete encoder implementation is a caller-supplied adapter. Until
  `apps/desktop` exists, the reference adapter lives in test infrastructure.
- **OD-6e — PDF fonts: embed a subset of a permissive open-source font
  (ratified).** For v1 the owner designated a permissive open-source family
  (Inter — with Roboto/Open Sans as acceptable alternatives) rather than
  Standard-14, so layout metrics are stable across viewers without licensing
  blockers. Applies to P5.7.
- **OD-6f — Determinism policy: ratified as written.** No `Date.now()`, no
  random identifiers; fixed compression parameters and ordering; byte-stability
  is non-negotiable.
- **OD-6g — P5.7 scope: ratified.** Medical raster plus native vectors only;
  offline `CachedPreview` panels remain out of scope pending a separate policy.

## Open Decisions (resolved by the ratification above)

- **OD-6a — Raster track.** → Track 1.
- **OD-6b — TIFF form.** → baseline TIFF 6.0 + Deflate.
- **OD-6c — Colour management.** → declare sRGB; defer ICC embedding.
- **OD-6d — Encoder location.** → composition-root adapter; no new package.
- **OD-6e — PDF fonts.** → embed a permissive open-source font subset (Inter).
- **OD-6f — Determinism policy.** → ratified as written.
- **OD-6g — P5.7 scope.** → raster + native vectors; cached preview excluded.

## Consequences

- P5.6/P5.7 stay pure and portable; `figure-engine` remains free of rendering
  and encoder dependencies; the export is testable in plain Node.
- Choosing minimal writers means owning two small format writers and their
  tests; choosing `upng-js`/`utif` trades that code for two pinned third-party
  dependencies. Both are acceptable; neither adds native binaries.
- Deferring ICC embedding keeps v1 smaller but may not satisfy a journal that
  demands a specific profile; that is a future, additive change.

## Conditions That Might Warrant a Revision

- Export latency or peak memory on real datasets becomes unacceptable even with
  streaming and a progress UI → reconsider a native backend behind the same port.
- A target journal requires a specific embedded ICC profile or PDF/X output
  intent → add ICC embedding / OutputIntent.
- A second encoder consumer appears → revisit OD-6d and consider a dedicated
  package.
- The architecture ever permits a browser/offscreen-Chromium export → revisit
  R1, but the headless-first and DOM-free principles should still prevail.
