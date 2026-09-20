# Rule 01: Project Core Principles & Non-Simplification Law

## 1. Mission & Domain Context
NuClear is a clinical-grade, publication-ready multimodal medical imaging workstation and scientific figure authoring tool specialized for nuclear medicine physicians, radiologists, and molecular imaging researchers to construct publication-grade PET/CT figures.

## 2. Cardinal Architectural Principles (P1–P8)
- **P1 (Authoring Tool, Not a PACS)**: NuClear is designed specifically for scientific figure generation and iconography from clinical DICOM studies. It does not reproduce unnecessary hospital PACS/RIS workflows.
- **P2 (Cornerstone3D as Medical Source of Truth)**: Cornerstone3D / WebGL is the sole interactive authority for medical volume rendering, orthographic reslicing, window/leveling, and GPU color transfers.
- **P3 (Python as Scientific Processing Worker)**: Technically validated DICOM parsing, metadata extraction, geometric verification, resampling, registration, and quantitative SUVbw calculations are handled by the local Python scientific worker via IPC. “Validated” means fixture/test evidence; it does not claim regulatory certification.
- **P4 (Figure State Over Screenshots)**: A figure panel is never a mere screenshot; it preserves its semantic medical state (`MedicalViewState`, `PreparedView`, `localOverrides`), remaining alive, modifiable, and reproducible until final export.
- **P5 (Separation of Medical Rendering & Editorial Composition)**: Medical rendering (PET, CT, fusion, MPR, MIP, camera, SUV/LUT) is strictly isolated from Editorial composition (panel framing, paper geometry, layout, typography, vector arrows, captions).
- **P6 (Single Rendering Path)**: Viewer, Composer, and Export share the exact same medical rendering engine and state representations.
- **P7 (Vector Preservation in Publication Export)**: In PDF export, medical panels render as high-resolution rasters via temporary RenderTargets, while annotations, text, scalebars, and badges remain native vector objects.
- **P8 (Scientific Reproducibility as a Core Feature)**: Every project file records exact provenance, source fingerprints, versions, and presets required to reconstruct the figure deterministically.

## 3. Agent Operational Directives

### A. No Invented Clinical Behavior
- **IF** an agent encounters an underspecified clinical behavior, DICOM interpretation, colormap standard, or rendering calibration:
- **THEN** it MUST explicitly state that the behavior is not yet specified/validated, propose candidate hypotheses, and document them as open decisions / ADRs.
- **NEVER** silently invent or assume a clinical standard with rationale such as *"a PACS probably does this"*.

### B. Non-Simplification Law
- **IF** an agent implements or refactors medical formulas, transfer functions, geometric calculations, or validated display parameters:
- **THEN** it MUST maintain full physical and mathematical fidelity.
- **NEVER** simplify, stub, or downgrade validated rendering parameters or clinical workflows for code brevity or developer convenience without an approved Architectural Decision Record (ADR) and explicit user sign-off.

### C. Source of Truth Enforcement
- **IF** rendering medical imagery:
- **THEN** route all volumetric operations through Cornerstone3D via `@nuclear/medical-engine`.
- **NEVER** substitute Cornerstone3D with 2D HTML Canvas approximations or custom CPU rasterization.
