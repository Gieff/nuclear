# PET/CT Fusion Radiometry & Transfer Function Specification

## 1. Scope & Objective

This document defines the normative mathematical formulas, transfer functions, and display presets for PET/CT fusion rendering in NuClear (`@nuclear/rendering-presets` and `@nuclear/medical-engine`).

These specifications establish a baseline derived from MedCanvas, to be formally ratified via NuClear fixtures and reproducible tests. MedCanvas serves as design provenance only, not as a clinical or runtime authority. They govern how PET/CT opacity blending, gamma curves, and transfer functions are applied in Cornerstone3D during interactive rendering and publication export.

---

## 2. Overall Fusion Opacity Curve

The interactive blend slider $s \in [0, 100]$ maps non-linearly to the overall PET volume opacity $\alpha_{\text{overall}}$ via the canonical PACS fusion power curve:

$$\alpha_{\text{overall}} = \left(\frac{s}{100}\right)^{0.42}$$

### Constants & Rationale
* **`CANONICAL_PET_FUSION_EXPONENT = 0.42`** (defined in `@nuclear/rendering-presets`).
* Human visual perception of color blending over grayscale CT is non-linear.
* At a 50% slider setting ($s = 50$), $\alpha_{\text{overall}} = 0.50^{0.42} \approx 0.747$ ($74.7\%$). This keeps PET color vivid and diagnostically clear while preserving clear anatomical CT detail underneath.

---

## 3. PET Opacity Transfer Function (`getPETOpacityMapping`)

The transfer function `getPETOpacityMapping` is **piecewise-linear** with explicit clamping below $0.0$ and above $1.0$ (opacity output values are strictly clamped to $[0.0, 1.0]$).

It maps scalar SUV values (converted to native $Bq/mL$ using the series `suvFactor`) to opacity values.

### Input Parameters
* $\text{lower} = \text{minSuv} / \text{suvFactor}$
* $\text{upper} = \text{maxSuv} / \text{suvFactor}$
* $\text{span} = \text{upper} - \text{lower}$
* $\gamma = \text{petGamma}$
* $\text{mergeMethod} \in \{\text{"highlighted"}, \text{"alpha"}\}$

The SUV-domain inputs are validated at the conversion boundary
(`@nuclear/medical-engine` `suvRangeToBqml`): `minSuv >= 0`, `maxSuv > minSuv`,
`suvFactor` finite and strictly positive, and the resulting Bq/mL bounds finite.
`getPETOpacityMapping` itself receives the converted `lower`/`upper` and must
validate them independently.

### Binding Numeric Input Guards & Fail-Closed Policy
All inputs must satisfy the following strict guards:
* `lower` and `upper` finite, with $\text{upper} - \text{lower} \ge 10^{-3}$
* Slider setting $s \in [0, 100]$
* Gamma $\gamma > 0$
* `minOpacity` $\in [0, 1]$

A range whose span is below $10^{-3}$ is **refused with a typed error**, never
clamped: clamping `span` would place control points outside the declared
$[\text{lower}, \text{upper}]$ range and could make opacity decrease as the
value increases.

**Fail-Closed Policy**: If any input guard is violated (e.g., negative SUV,
non-finite values, $\text{maxSuv} \le \text{minSuv}$, a span below $10^{-3}$,
$s \notin [0,100]$, $\gamma \le 0$, or `minOpacity` outside $[0,1]$), the
function must fail closed by throwing a structured error or returning a
zero-opacity mapping. It must never render an unverified or mathematically
corrupt transfer curve.

---

### Mode A: `"highlighted"` (Lesion / Hotspot Focus Mode — Default)
Designed to suppress background physiological noise and air while sharply highlighting hypermetabolic lesions:

1. **Air & Background Noise Cutoff ($0\% \to 8\%$ SUV span)**:
   * Values from $0$ up to $\text{lower} + 0.08 \times \text{span}$: $\text{opacity} = 0.0$ (fully transparent).
   * *Clinical effect*: Suppresses physiological background uptake and noise, leaving underlying CT pure and unclouded.
2. **Lesion Highlighting Step ($25\%$ SUV span)**:
   * At $\text{lower} + 0.25 \times \text{span}$: $\text{opacity} = \max(0.6, 0.5^\gamma)$ (typically $60\%$).
   * *Clinical effect*: Rapid opacity ramp ensuring metabolic hotspots stand out immediately with high color contrast.
3. **Peak Uptake ($100\%$ SUV span)**:
   * At $\text{upper}$ (SUV max): $\text{opacity} = 1.0$ ($100\%$ opaque).

```text
Opacity 1.0 |                                       /--- (100% SUV max)
        0.6 |                      /---------------/
        0.0 |________/------------/
           0   lower lower+8%   lower+25%        upper
```

---

### Mode B: `"alpha"` (Continuous Linear Blend Mode)
Designed for smooth, continuous gradient rendering across all tissue uptake levels:

1. **Background Cutoff ($0\%$ SUV span)**:
   * Values $0$ to $\text{lower}$: $\text{opacity} = 0.0$.
2. **Gradient Toe ($1.5\%$ SUV span)**:
   * At $\text{lower} + 0.015 \times \text{span}$: $\text{opacity} = \max(0.0, 0.45 \times 0.5^\gamma)$.
3. **Mid-point ($50\%$ SUV span)**:
   * At $\text{lower} + 0.50 \times \text{span}$: $\text{opacity} = 0.5^\gamma$.
4. **Peak Uptake ($100\%$ SUV span)**:
   * At $\text{upper}$: $\text{opacity} = 1.0$.

---

## 4. Gamma Correction Curve ($\gamma$)

The gamma parameter adjusts opacity response across mid-range SUV values:

$$\text{midOp} = (0.5)^\gamma$$

* **$\gamma = 1.0$ (Default)**: Standard linear mid-range response.
* **$\gamma < 1.0$**: Expands mid-range opacity, making lower-uptake structures more prominent.
* **$\gamma > 1.0$**: Contracts mid-range opacity, isolating only hyper-intense metabolic peaks.

---

## 5. CT Base Volume Configuration

* **Visibility**: Always `true`.
* **Opacity Mapping**: Fully opaque ($1.0$) across the full HU range $[-1024, +3071]$.
* **Default Preset**: Soft Tissue ($\text{Window} = 400$, $\text{Level} = 40$).
* **VOI Range**: $\text{lower} = \text{Level} - \text{Window}/2$, $\text{upper} = \text{Level} + \text{Window}/2$.

The full-HU opacity mapping, the HU range, the visibility flag, the Soft Tissue
preset and its VOI range must be **exposed declaratively by
`@nuclear/rendering-presets`**. The adapter must consume them and MUST NOT
hardcode a second copy.

---

## 6. Quantitative SUV $\to$ Bq/mL Binding Constraint

Conversion from physical SUV units to raw scalar activity ($Bq/mL$) is valid **IF AND ONLY IF**, checked fail-closed in this order (ratified by [ADR-005](../decisions/ADR-005-pet-ct-radiometry-binding.md)):
1. the asset modality is `PT`;
2. `asset.metadata.pet?.units === "BQML"` — the DICOM Units (0054,1001) value carried by `PetAcquisitionMetadata`. `PetQuantitationResult` has no `units` field and MUST NOT gain one;
3. `asset.metadata.petQuantitation?.status === "computed"`;
4. `asset.metadata.petQuantitation.suvFactor` is finite and strictly greater than zero;
5. the loaded volume plan declares `scalarDataDomain === "rescaled-bqml"`.

The asset `valueSemantics` (`suv-bw` / `g/mL`) is the clinical display semantic;
it is NOT the transport scalar domain, and the two must not be conflated.

### Verification Mandate for P3.4 Tests
* During P3.4 test execution, `@nuclear/medical-engine` must verify that Cornerstone3D receives and exposes scalar voxel values that are correctly scaled to $Bq/mL$.
* If `asset.metadata.pet` is missing, the units are not `BQML`, the quantitation result is missing or not `computed`, the factor is not a finite positive number, or the plan domain is not `rescaled-bqml`, the system MUST NOT render a plausible-looking but quantitatively inaccurate fusion image.
* It must fail closed with a typed diagnostic, preventing silent numeric or clinical corruption.

---

## 7. Cornerstone3D Application Contract

When applying fusion blending to a viewport, `@nuclear/medical-engine` must invoke Cornerstone3D properties as follows:

```typescript
viewport.setProperties(
  {
    voiRange: { lower: petLower, upper: petUpper },
    colormap: {
      name: colormapName, // e.g. "PET", "Rainbow", "Hot Metal"
      opacity: petOverallOpacity, // (s/100)^0.42
      opacityMapping: getPETOpacityMapping(petLower, petUpper, 0.0, gamma, mergeMethod),
    },
  },
  petVolumeId
);
```

---

## 8. Implementation Mandate for Phase 3.4

During **Slice P3.4** (*Medical-state application & preset rendering*):
1. Package `@nuclear/rendering-presets` must export `CANONICAL_PET_FUSION_EXPONENT`, `getPETOpacityMapping`, the CT full-HU base opacity mapping and HU range, and the CT Soft Tissue preset definitions matching this specification.
2. Package `@nuclear/medical-engine` must apply this exact opacity mapping, input guards, fail-closed policies, and quantitative $Bq/mL$ constraints when rendering PET/CT fused viewports.
