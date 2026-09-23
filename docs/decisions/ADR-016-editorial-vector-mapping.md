# ADR-016: Editorial `FigureSheet` → Native PDF Vector Mapping (Phase 5 follow-up c)

## Status

**Accepted** (phase owner, 2026-09-23): the A-set for **OD-7a … OD-7j** was
ratified in full. Follow-up (c) is implemented for the ratified scope; see
"Ratification Record" and the implementation clarification on patient-space
shapes. P5.7's native-vector emission mechanism is unchanged and remains
delivered.

## Date

2026-09-23

## Context

P5.7 (`docs/decisions/ADR-015-…md`, ADR-015 Implementation Note) delivered the
hybrid-PDF **emission mechanism**: `PublicationPdfRequest` + `EncoderPort.encodePdf`
+ a `pdf-lib`/Inter adapter that emits native text/rect/line primitives and panel
rasters. It deliberately accepts caller-supplied `PublicationVectorLayer`s and
does **not** map `FigureSheet` content, because the frozen editorial contracts
specify *which* objects exist but not *how* each becomes a vector primitive.

Architecture §30 states editorial typography/letters/badges/scalebars/arrows and
annotations are preserved as native PDF primitives "**quando la loro semantica lo
consente**" — an explicit acknowledgement that some semantics do not yet. Rule 01
(P1/P2) forbids inventing that geometry silently; the Phase 5 plan's stop
condition requires an ADR before implementation. This ADR records the audit and
the decisions the owner must take so follow-up (c) can proceed without guessing.

## Emitter contract available today

`PublicationVectorLayer` (P5.7) supports exactly: `text` (baseline origin mm,
`fontSizePt`, colour, opacity), `rect` (sheet-mm rect, fill/border, opacity) and
`line` (two sheet-mm endpoints, stroke, opacity). The concrete adapter embeds a
**single** font (Inter Regular, SIL OFL, OD-6e); no bold/italic face is vendored.
Ratified transforms that a mapping may consume: `panelSheetRectMm`,
`panelContentToSheet` (OD-2), `projectPatientAnnotation` (OD-4/OD-5), and the
OD-1 framing map. Nothing may be derived anew.

## Mapping audit (what is determined vs what needs a decision)

| Contract element | Geometry | Decision required |
| --- | --- | --- |
| `decoration.background` | panel sheet rect | paint order (OD-7a/7b) |
| `decoration.border` `solid`/`none` | panel sheet rect + width | stroke alignment; dashed/dotted dash pattern (OD-7c) |
| `decoration.label` / `caption` | anchor in Panel Content Space | text origin/anchor; unsupported `fontFamily` (OD-7d) |
| `FigureTextAnnotation` (`text`/`panel-letter`) | `position` + `box.sizeMm` + `paddingMm` | box alignment, padding application, overflow, weight (OD-7e) |
| `FigureLineAnnotation` `line` | endpoints by coordinate space | optional stroke defaults; patient endpoint projection (OD-7f/7i) |
| `FigureLineAnnotation` `arrow` | endpoints | arrowhead size/shape/fill (OD-7f) |
| ROI `circle`/`ellipse`/`rectangle` | centre/radii/origin + rotation | ellipse/polygon primitive; rotation semantics (OD-7g) |
| `FigureScaleBarAnnotation` | position/length/orientation | tick geometry, label anchor, end caps (OD-7h) |
| `FigureMeasurementAnnotation` | endpoints/value/unit | tick/arrow geometry, number formatting (OD-7h) |

Nothing in `NUCLEAR_ARCHITECTURE_V3.md` §21–§26/§30, the Vademecum or
`PanelDecorationState`/`FigureAnnotation` resolves the “Decision required” column;
these are genuinely under-specified and are therefore Open Decisions.

## Requirements any ratified mapping must satisfy

- **R1 — No invented geometry or styling.** Every anchor, offset, tick, arrowhead,
  dash pattern and font substitution is explicitly ratified here or refused.
- **R2 — Fail-closed.** An unsupported kind/style/family/second-thought is a typed
  `FigurePublicationError`, never a plausible-looking default or silent omission.
- **R3 — Vectors stay vectors.** Only the medical panel is a raster; editorial
  objects become native PDF operators (ADR-014 D5 / ADR-015 R6).
- **R4 — Physical sheet mm; consume ratified transforms.** Reuse `panelSheetRectMm`,
  `panelContentToSheet` (OD-2) and the OD-4/OD-5 projection; derive no transform.
- **R5 — Determinism.** A deterministic layer order (OD-7a); no wall-clock/random.
- **R6 — v1 font scope.** Only the embedded Inter family; any other `fontFamily`
  (or `weight: 'bold'`) is refused until that face is vendored (OD-6e extension).

## Open Decisions (for owner ratification)

### OD-7a — Editorial paint order
- **A (recommended):** deterministic order `panel backgrounds → panel rasters
  (existing z-order) → panel borders → annotations in `FigureSheet.annotations`
  array order → labels/captions last`. Documented as the single paint order.
- **B:** annotations before borders.
- **C:** a new explicit z-index on editorial objects (contract change; defer).

### OD-7b — Panel background
- **A (recommended):** fill the panel's sheet rect (`panelSheetRectMm`) with
  `decoration.background` before its raster.
- **B:** fill only the content aperture.
- **C:** not emitted.

### OD-7c — Panel border
- **A (recommended):** `solid` = stroked `panelSheetRectMm` with the PDF default
  **centred** stroke (half the width outside the rect); `none` = nothing;
  `dashed`/`dotted` **refused** until dash patterns are ratified.
- **B:** inset the path by `widthMm/2` so the stroke is fully inside.
- **C:** define default dash patterns now (invented; not recommended).

### OD-7d — Panel label / caption
- **A (recommended):** `position` is the **baseline-left** origin in Panel Content
  Space, converted with `panelContentToSheet`; the only supported `fontFamily` is
  the embedded Inter — any other family is **refused** (no silent substitution).
- **B:** `position` is the top-left of an inferred text box (no box field exists).
- **C:** centred on `position`.
- Also decide: `caption` is emitted exactly like `label` (A) or distinguished (B).

### OD-7e — Text / panel-letter annotations
- **A (recommended):** `position` is the **top-left** of `box.sizeMm`; the text
  origin is `position + paddingMm`; left-aligned; the first baseline is
  `top + paddingMm + font ascent` (from the embedded font's metrics, not a magic
  constant); text wider/taller than the box is **refused** (no clip/auto-shrink).
- **B:** `position` is the baseline (ignore the box). 
- **C:** centre the text in the box.
- Font: **A** only Inter / `weight: 'normal'`; `weight: 'bold'` is refused until a
  bold Inter face is vendored. **B** synthesise a fake bold (not recommended).

### OD-7f — Line vs arrow, and optional stroke defaults
- **A (recommended):** emit `line` as a native line; **refuse `arrow`** until
  arrowhead size/shape/fill are ratified; require `strokeColor` and
  `strokeWidthMm` (absent = refused; no undocumented default).
- **B:** emit an arrowhead as a filled triangle with size = `k × strokeWidthMm`
  for a default `k` (invented; needs a ratified `k`).
- **C:** defer all line/arrow annotations.

### OD-7g — ROI shapes (circle / ellipse / rectangle)
- **A (recommended):** extend `PublicationVectorLayer` with `ellipse` (4 Bézier
  arcs from `radiiMm`) and `polygon` (rotated rectangle corners); rotation is
  clockwise y-down about the centre per OD-2; fill/stroke from the annotation.
- **B:** only axis-aligned circles/rectangles; rotation refused.
- **C:** defer ROIs.

### OD-7h — Scale bar and measurement
- **A (recommended):** **refuse** both until tick count/length, end caps, label
  anchor and number formatting are ratified.
- **B:** define a default scale-bar rendering now (ticks, caps; invented).
- **C:** emit the scale-bar as a plain line + label with no ticks.

### OD-7i — Patient/panel-content endpoint projection
- **A (recommended):** apply the OD-4/OD-5 chain to **each** authored endpoint
  (`patientToViewPlane → viewPlaneToViewport → OD-1 → OD-2`), consuming the
  transforms; non-`online` availability hides the annotation fail-closed (OD-4);
  a `panel-content` endpoint uses `panelContentToSheet` with its anchor's panel.
- **B:** only sheet-space annotations are mapped (patient/panel-content deferred).

### OD-7j — Unsupported/unknown editorial input
- **A (recommended):** any kind, style, coordinate space or field the ratified
  mapping cannot honor is a typed `FIGURE_PDF_DOCUMENT_INVALID` refusal naming the
  element; the export never silently drops or approximates editorial content.
- **B:** skip unsupported elements with a recorded warning list (weaker guarantee).

## Consequences

- Until ratified, follow-up (c) remains **BLOCKED** (not “NOT YET APPLICABLE”): the
  P5.7 mechanism is complete, but `FigureSheet` content is not mapped.
- Ratifying the recommended options (A/A/A/A/A/A/A/A/A/A) lets follow-up (c) ship
  as a bounded pure `buildEditorialVectorLayers(figureSheet, context)` slice plus
  an `ellipse`/`polygon` emitter extension, with per-kind fail-closed tests.
- OD-7c/7e/7f/7g/7h are additive later: each can be enabled by a small amendment
  without changing P5.7.

## Ratification Record

**Ratified 2026-09-23 (phase owner): the A-set is accepted in toto.** In
particular: OD-7a paint order (backgrounds → rasters → borders → annotations →
labels/captions); OD-7b/7c background fill + solid centred border, dashed/dotted
refused; OD-7d/7e baseline/top-left anchors with explicit math, overflow, bold
and unsupported fonts refused; OD-7f/7g/7h only traceable primitives (line,
ellipse, polygon) with OD-2 rotation, arrows/scalebars/measurements refused;
OD-7i patient projection through the physical chain; OD-7j typed
`FIGURE_PDF_DOCUMENT_INVALID` refusals.

### Implementation clarification (2026-09-23)

Two patient-space shape cases remain **refused** fail-closed because the
contract does not determine their orientation, and the A-set does not decide it:

- **Patient-anchored ROI shapes** (circle/ellipse/rectangle): projecting the
  *centre* is ratified (OD-7i), but the ROI's **plane orientation** in LPS is not
  defined (a 3D centre with two radii and a rotation is under-determined without
  a plane), so the shape is refused rather than assumed to lie in the view plane.
- **Patient-anchored text/panel-letter boxes**: the box orientation in the view
  plane is likewise undefined, so they are refused.

These are recorded as a follow-up decision (**OD-7k**) rather than invented;
patient-anchored **line** annotations *are* mapped (their endpoints are points
and use the ratified OD-7i chain). Sheet- and panel-content-space ROI/text/line
mappings are fully implemented.
