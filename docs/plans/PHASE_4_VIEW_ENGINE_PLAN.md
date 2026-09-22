# Phase 4 — View Engine: Workspace, Link/Lock/Override & Persistent Surfaces

## Objective

Deliver `@nuclear/view-engine`: the headless orchestration layer that decides
**what to show, in which logical slot, with which state and which relations**,
without owning pixels, GPU resources or UI.

```text
ImagingAsset + PreparedView + ViewLink + StateLock + LocalViewOverride
  -> view-engine
     -> ImagingWorkspace      -> ViewGroups / ViewSlots / shared state
     -> PreparedView assembly -> MedicalViewState + provenance
     -> LINK / LOCK / OVERRIDE semantics
     -> ViewportSurfaceRegistry -> stable surface identity
     -> SurfaceLayoutManager    -> pure viewer/composer placement geometry
     -> ResourceDemand[]        -> medical-engine ResourceManager residency
```

“Headless” here means **no product UI owns the behaviour** and no React/DOM
chrome is introduced. The view engine is a pure, serializable model plus
placement and demand projection; it never renders and never manages a WebGL
context.

## Phase Entry Conditions

- Phase 3 is closed; the `ResourceManager`
  (`retain`/`release`/`reconcile`/`settle`) and the `MedicalViewState`
  application path exist and are accepted.
- Phase 1 view contracts (`ViewSlot`, `ViewGroup`, `ViewportSurface`,
  `ViewLink`, `StateLock`, `LocalViewOverride`, `PreparedView`,
  `ResourceDemand`, `MedicalViewState`, `SpatialTransform`) are frozen and
  validated by `tests/contracts/view-validators.ts`.
- `@nuclear/view-engine` depends on `shared-types`, `rendering-presets` and
  `medical-engine`. No package may reverse that dependency direction. P4.1
  (workspace/slots) and P4.2 (prepared-view assembly) were implemented and
  then **reopened** by review; the ratified corrective slices below must land
  before P4.3.
- Boundary decisions in `docs/decisions/ADR-010-…md` (including its §7
  addendum) and `docs/decisions/ADR-011-prepared-view-immutability-and-shared-state-mutation.md`
  are binding for the corrected implementation.
- The curated Phase 3 volume fixtures
  (`tests/rendering/fixtures/volumes/{ct-axial,pt-axial,pt-axial-coreg}`)
  provide real geometry/FoR evidence for linking tests. `ct-axial` and
  `pt-axial-coreg` share `FrameOfReferenceUID …5001.4` and
  `geometricDigest sha256:4195de76…c360a70`; `pt-axial` uses frame `…5002.4`.

## In Scope

- `ImagingWorkspace`: studies, imaging assets, spatial transforms, view
  groups, slots, shared-state groups, prepared views and resource demand —
  a model independent of React, DOM and Cornerstone.
- Up to **16 `ViewSlot`s** organised as four `ViewGroup`s of four roles
  (`MIP`, `PET`, `GENERIC`, `FUSION`), with bind/unbind and truthful
  `empty`/`bound`/`prepared`/`unavailable` status.
- `PreparedView` assembly from a bound `MedicalViewState` plus links, locks
  and `ViewProvenance`; assembly alone must not pin RAM/VRAM.
- Shared-state groups: several views may reference the *same* `SpatialState`
  or `CameraState` instance instead of an imperative notify chain.
- `LINK`: intra-study co-referenced (requires matching verified
  `FrameOfReferenceUID` and geometry snapshots) and inter-study
  relative/transformed (requires a declared differential or a valid
  `SpatialTransform`, an explicit `toleranceMm` and an out-of-domain policy).
- `LOCK`: protects a named state (`spatial`, `camera`, `presentation`,
  `projection`, `composition`, `binding`); it is not merely “disable mouse”.
- `OVERRIDE`: a `LocalViewOverride` local to a `ComposerViewInstanceId`,
  serializable, which never mutates the shared source view.
- `ViewportSurfaceRegistry`: stable `surfaceId`/`viewportId`, lifecycle and
  bind/unbind of a slot or view; up to 16 logical surfaces that are **not**
  16 WebGL contexts.
- `SurfaceLayoutManager`: pure placement geometry for a viewer slot rect or
  a composer panel rect, preserving surface identity across re-layout.
- `ResourceDemand` declaration and projection into the medical-engine
  `ResourceManager` using stable, caller-owned lease ids.

## Explicitly Excluded

- Product UI, React, Electron shell, DOM chrome, mouse/tool interaction and
  application workflow (Fase 6–7).
- Figure-sheet layout, panels, annotations, TIFF/PNG flattening and hybrid
  PDF assembly (Fase 5).
- Any second renderer, shader, WebGL context, canvas or GPU lifecycle. The
  view engine declares demand; `medical-engine` owns physical residency.
- New scientific algorithms (resampling, registration, SUVbw). Registration
  results may be consumed as an existing `SpatialTransform`; they are not
  computed here.
- DICOM parsing or geometry reinterpretation. Geometry arrives from the
  Phase 2 worker via `medical-engine` evidence.

## Architectural Invariants

1. **UI-agnostic and DOM-free.** `view-engine` imports no React, no DOM and
   no `@cornerstonejs/*`. Package graph stays acyclic per Rule 02.
2. **Semantic lifetime is not resource residency.** A `ViewSlot` or
   `PreparedView` reference never pins RAM or VRAM; only declared demand is
   reconciled by `medical-engine`.
3. **Demand is declarative.** The view engine declares priority and
   required tiers; it never loads, evicts or measures bytes itself.
4. **One surface identity, one rendering engine.** Surfaces have stable
   identity independent of a WebGL context; the count of contexts is
   backend-owned and must not be hard-coded to 16.
5. **Link modes are physically distinct.** Co-reference requires the same
   worker-verified `FrameOfReferenceUID`, one-to-one snapshot ↔ asset ↔
   series ↔ fingerprint correlation, and **not** an identical
   `geometricDigest` (native CT/PET in one FoR differ). Different
   `FrameOfReferenceUID`s are never treated as co-referenced without a valid
   transform; missing evidence fails closed.
6. **Lock and override are separate contracts.** A lock guards named state;
   an override is local, visible in the model and serializable, and never
   mutates its source.
7. **No duplicated clinical science.** Geometry/FoR evidence and transforms
   are consumed, not recomputed.
8. **No invented placement defaults.** Viewport-to-panel framing belongs to
   `figure-engine`; the view engine only provides viewer/composer host
   rectangles.
9. **Published DTOs are immutable; shared state is controlled.** Values
   returned by a `view-engine` API are deep-frozen, and shared
   `SpatialState`/`CameraState` live in a private holder mutated only by
   explicit, atomically-replacing APIs (ADR-011). No free in-place mutation
   and no indiscriminate freezing of P4.3-updatable objects.
10. **Provenance is positionally one-to-one.** In `ViewProvenance`,
    `sourceAssetIds[i]`, `sourceSeriesInstanceUIDs[i]` and
    `sourceFingerprints[i]` describe the same source; lengths are equal and
    every source shares `provenance.studyInstanceUID` (ADR-010 §7.3).

## Delivery Slices

| Slice | Owner | Deliverable | Acceptance evidence |
| --- | --- | --- | --- |
| P4.0 | orchestrator | Baseline, contract audit, plan/runbook and ADR-010 | Entry state recorded; slice boundaries and boundary decisions documented |
| P4.1 | engine engineer | `ImagingWorkspace` core: asset/study registry + `ViewGroup`/`ViewSlot` allocation and bind/unbind/status | Pure Node tests for capacity (16), role/group invariants, bind/unbind/status transitions; 17th slot refused |
| P4.2 | engine engineer | `PreparedView` assembly + `ViewProvenance` (a prepared view may exist without a slot); published DTOs immutable per ADR-011 | Assembly produces a valid **frozen** `PreparedView`; assembly alone issues no residency retain; missing/empty provenance or provenance↔asset↔series↔fingerprint mismatch fails closed; slot binding is a separate explicit, fail-closed operation (not an assembly prerequisite) |
| P4.3 | engine engineer | Shared-state groups (`SharedStateGroup`) via a private holder with **atomic replacement → new projection → frozen published DTO** (ADR-011 §3 + addendum) | Multiple views reference one shared `SpatialState`/`CameraState`; identity is observable; no notify chains; the test specifies which identity stays stable (holder / `PreparedViewId` / `ViewSlot`) and which value is regenerated after an update; every replacement payload passes assert→freeze |
| P4.4 | engine engineer | Link semantics (intra-study + inter-study) | Co-referenced link requires matching verified FoR/geometry; inter-study requires transform or differential + tolerance + out-of-domain; mismatches fail closed |
| P4.4b | engine engineer | Inter-study link application & propagation (`applyInterStudyLink`), per ADR-012 | Link registered over an accepted `SpatialTransform`/differential; propagation is an explicit, atomic, DAG-directed replacement; cycles, locked targets, tolerance overflow and `outOfDomainBehavior` fail closed; 3–4 chained views terminate; inter-study never joins a `SharedStateGroup` |
| P4.5 | engine engineer | `LOCK` + `LocalViewOverride` | Lock blocks mutation of named state; override diverges, round-trips and leaves the source view unchanged |
| P4.6 | engine engineer | `ViewportSurfaceRegistry` + `SurfaceLayoutManager` | Stable identity across bind/rebind/re-layout; `disposed` carries no binding; capacity 16 logical ≠ WebGL contexts; placement geometry is pure |
| P4.7 | engine engineer | `ResourceDemand` projection into `ResourceManager` | Demand→lease reconciliation; shared asset retained once; eviction preserves semantic view identity and reload restores residency |
| P4.8 | reviewer + QA | Independent phase review, gates and final handover | Reviewer/QA verdicts, all configured gates and the eight-point phase report recorded |

P4.4 depends on P4.1 and P4.3; P4.7 depends on the accepted P4.1 slot model.
Do not begin a later slice before the predecessor’s review and QA evidence
is recorded.

### P4.4b — Inter-Study Link Application & Propagation (planned, NOT YET IMPLEMENTED)

P4.4 validates an inter-study link but deliberately refuses to apply it, because
the two views live in different `FrameOfReferenceUID`s and must not share
`SpatialState`. P4.4b adds the relative application:

- `applyInterStudyLink` registers a `kind: 'inter-study'` link (relative or
  transformed) after P4.4 eligibility, and refuses a link that would close a
  directed cycle (DAG topology, ADR-012 §1).
- Propagation is an **explicit** engine operation (no observer/notify chain):
  given an origin view’s new `SpatialState`, it walks the DAG forward and
  regenerates each target’s frozen projection through the ADR-011 §3 atomic
  replacement path. Inter-study targets are never attached to a
  `SharedStateGroup`.
- Causality: each propagation carries an origin token and visits each view at
  most once, so chains of 3–4 views terminate (ADR-012 §3).
- Locks: a `StateLock` on a target’s `spatial` refuses propagation (P4.5).
- `toleranceMm` and `outOfDomainBehavior` (`clamp`/`hide`/`warn`) are honoured
  with no invented default; the matrix/offset application is a single owned pure
  function consumed (not re-implemented) by `view-engine` (ADR-012 §4/§5/§6,
  Open Decisions OD-2/OD-4).

Acceptance evidence: positive transformed and relative propagation over curated
fixtures; cycle/self-loop refusal; locked-target refusal; out-of-domain
`clamp`/`hide`/`warn`; 3–4 view chains terminate and are deterministic and
idempotent; every refusal leaves all views and groups unchanged; no
`SharedStateGroup` for an inter-study link.

P4.4b depends on P4.4, an **Accepted** ADR-012 and the Phase 2B `SpatialTransform`
evidence (`docs/plans/PHASE_2B_SCIENTIFIC_REGISTRATION_PLAN.md`). It is planned
only; no P4.4b code exists as of the P4.5/C5a close.

## Fixture and Test Policy

- All view-engine tests are **pure Node tests** under `tests/view-engine/`
  (no browser, no DOM). They may import the real Phase 3 fixture JSON
  geometry evidence to build valid/invalid link cases.
- The curated fixtures are the only co-reference evidence: `ct-axial` +
  `pt-axial-coreg` (same FoR `…5001.4`) for the positive intra-study case;
  `pt-axial` (frame `…5002.4`) for the mismatch negative. Fixture digests are
  informational, **not** a co-reference eligibility criterion.
- No numeric image tolerance applies in Phase 4. Co-reference eligibility is:
  same worker-verified `FrameOfReferenceUID` + one-to-one snapshot ↔ asset ↔
  series ↔ fingerprint correlation; **identical `geometricDigest` is not
  required** and must not be enforced. Inter-study relative navigation
  carries an explicit `toleranceMm` and out-of-domain behavior; no implicit
  default is invented.
- Every slice must include negative/fail-closed cases; a missing fixture or
  runner is `BLOCKED` or `NOT YET APPLICABLE`, never PASS.

## Completion Gates

| Gate | Required Phase 4 evidence |
| --- | --- |
| AgentLog | Eight-point handover for every P4 slice in `docs/agentlog/phase-4.md` |
| Workspace model | Slot/group capacity, role and status invariants tested fail-closed |
| Link semantics | Intra-study co-referenced and inter-study relative/transformed tested, including FoR mismatch refusal |
| Lock/Override | Lock protection, override divergence, serialization and source immutability tested |
| Surfaces | Stable identity across rebind/re-layout, lifecycle and capacity tested without any WebGL/DOM dependency |
| Residency | Demand projection and reconciliation against the real `ResourceManager`; eviction preserves semantics |
| Boundary | No UI/React/DOM/Cornerstone import; package graph acyclic; Rule 02 file-size limit respected |
| Quality | Typecheck, Node tests, configured Python tests, build and source-integrity report actual results |
| Review | `nuclear-reviewer` and `nuclear-qa` independently inspect the final Phase 4 diff and evidence before closure |

## Reopened — Ratified Correction Slices (2026-09-22) — COMPLETE

An independent review reopened P4.0/P4.1/P4.2. All ratified corrective slices
are now **complete** and P4.0–P4.2 are **closed** (agentlog closure record).
They were executed as `C8 → C1 → C2/C5/C6 → C3/C7 → C4 → C1b/C4b` (C2/C5/C6
and C3/C7 were bundled by explicit user authorisation; ADR-011 landed with
C4). Corrective commits: `db4ba42`+`f71d609`, `7680acc`, `0c8921e`,
`95a04fb`, `f8a5571`, `a46099d`.

| ID | Slice | Deliverable | Acceptance |
| --- | --- | --- | --- |
| C8 ✅ | P4.T | `tests/**` brought into the `tsc` graph | `npm run typecheck` compiles tests; an intended TS error in a test fails the gate |
| C1 ✅ | P4.1.1 | Workspace input integrity: reject non-finite / non-JSON-safe values instead of JSON-normalising them; then **C1b** also rejects explicit `undefined` (`WORKSPACE_UNDEFINED_VALUE`; optionals must be absent) | `NaN`/`±Infinity`/`undefined`/`Date`/`Map`/`Set`/`bigint` refused with a typed path-naming error; no mutation on refusal; valid payload round-trips |
| C5 ✅ | P4.2.2 | Provenance ↔ registered-asset cross-validation (positional 1:1 per ADR-010 §7.3) | PET view + CT fingerprint / series mismatch / length mismatch refused; coherent pair accepted |
| C4 ✅ | P4.2.1 | Published-DTO immutability (ADR-011 §1/§2/§4); **C4b** makes `deepFreeze` fail-closed and validates before freezing; the private holder (§3) lands with P4.3 | published DTOs deep-frozen and validated at assembly/registration; external mutation throws; identity preserved |
| C3 ✅ | P4.0.1 | Co-reference contract honesty + snapshot↔asset↔series↔fingerprint check | negative series-mismatch test + positive different-digest/same-FoR test; ADR/piano wording corrected |
| C2 ✅ | P4.1.2 | Slot/group rule 1–4 groups, default 4, ≥1 enforced | zero groups refused; reduced coherent layout accepted; ADR-010 §7.1 aligned |
| C6 ✅ | P4.2.3 | Explicit fail-closed slot→PreparedView binding (view may exist unbound) | binding a registered view succeeds; unknown view / occupied slot refused |
| C7 ✅ | Fixture hygiene | `mockMedicalView` asset id coherent with clinical fixtures | full suite green after coordinated fixture + P3 assertion + P4.2-case updates |

## Stop Conditions

Stop the active slice as `BLOCKED` rather than guessing when:

- a required cross-package contract (e.g. an `ImagingWorkspace` snapshot
  type) is absent and changing it would alter an architectural boundary
  without an ADR;
- the medical-engine `ResourceManager` cannot accept a demand/lease shape the
  view engine needs without violating package ownership;
- a link mode would require registration work that does not exist in the
  worker/bridge;
- a placement requirement would force DOM/React or WebGL ownership into
  `view-engine`.

## Exact Next Step

P4.0–P4.2 are **closed**; all ratified correctives are complete. **Start P4.3
(shared-state groups)** under the binding ADR-011 addendum contract:

```text
private holder → atomic replacement → new projection → frozen published DTO
```

P4.3 entry conditions:

- Entry HEAD `a46099d`; gates green (`npm test` 348/348, 68 suites).
- Define and **test** which identity stays stable (holder identity,
  `PreparedViewId`, `ViewSlot`) and which published value is regenerated after
  an update.
- Every replacement payload passes `assertSerializableValue` → `deepFreeze`;
  never mutate frozen state in place, never clone shared state, never publish
  a mutable object.
- Owner package: `@nuclear/view-engine` only; pure Node tests; ≤300-line
  source files.
- Do not reinterpret the ADR-011 model; do not add P4.4 linking, P4.5 locks,
  P4.6 surfaces or P4.7 demand in P4.3.
