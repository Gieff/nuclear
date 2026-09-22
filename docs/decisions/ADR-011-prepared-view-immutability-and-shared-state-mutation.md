# ADR-011: PreparedView Immutability & Controlled Shared-State Mutation

## Status

Accepted

## Date

2026-09-22

## Context

Phase 4 must let several views share the same `SpatialState`/`CameraState`
without an imperative notify chain (architecture v3 §2.5, §16), while keeping
a reproducible, trustworthy workspace. An independent review of P4.2 found
that `PreparedViewRegistry` stored and returned the **same** `PreparedView`
object, and `assemblePreparedView` stored `state`/`provenance` by reference;
`readonly` in TypeScript is compile-time only, so an untyped or
`as unknown as` consumer could mutate a registered view (`view.state.camera.
zoom = 77`) and silently corrupt the canonical state.

Two naive remedies are both wrong:

- **Freeze everything, including shared state.** This conflicts with the P4.3
  requirement that shared spatial/camera state be updatable and observed by
  every view that references it.
- **Leave it mutable and rely on convention.** This breaks snapshot
  reliability and would let a future `LOCK` (P4.5) be bypassed at runtime.

The model that P4.3 must implement therefore has to be fixed now, so P4.3
does not reinterpret it.

## Decision

### 1. Published DTOs are immutable

Every value returned by a `view-engine` API is **deep-frozen** at the point of
publication: `PreparedView`, `ViewProvenance`, `ViewLink[]`, `StateLock[]`,
`CachedPreviewReference` and `ImagingWorkspaceSnapshot` (and its registered
study/asset values). A consumer that obtains a reference from `get`/`list`/
`snapshot` cannot mutate canonical state through it. Mutations are only
possible through explicit engine APIs.

### 2. Shared state is owned by a private holder

`SpatialState`/`CameraState` that multiple views must share are **not**
handed out as freely mutable objects. They live inside a private
`view-engine` holder (a shared-state group), and the observable identity is
the holder's, not a mutable object's. This preserves architecture §2.5
(shared state rather than event chains) without exposing a mutation surface.

### 3. Mutation is controlled and atomically replacing

Updates to shared state go through explicit engine APIs that **replace** the
shared value atomically; every view bound to that holder observes the new
value. Free in-place mutation is forbidden, as is freezing objects that P4.3
must update.

```
shared-state holder  ── controlled API ──▶ atomic replacement
      ▲                                          │
      └────────── observed by all bound views ◀──┘
```

### 4. Non-shared metadata is a validated immutable value

`ViewProvenance`, `links`, `locks` and `CachedPreviewReference` are validated
and frozen; they are not identity-shared. No architectural requirement needs
their object identity to persist across views.

### 5. Phase 3 boundary is unaffected

This ADR concerns `view-engine` value objects only. It does not change the
`medical-engine` renderer, residency, or any persisted `.ncp` contract.

## Consequences

- P4.3 implements the shared-state holder and its controlled mutation API; it
  does not reintroduce mutable published objects.
- P4.5 `LOCK` can rely on the runtime guarantee that state changes only via
  engine APIs, so a lock is enforceable rather than advisory.
- `Object.freeze` is a runtime guarantee in addition to TypeScript `readonly`;
  tests must assert frozen-ness and that external mutation attempts leave the
  canonical value unchanged.
- Snapshot output stays JSON-serializable; freezing does not change its shape.

## Addendum — Publication Boundary: Validate, then Freeze (C1b/C4b, 2026-09-22)

An independent review reopened C1 and C4 with two boundary defects: a property
explicitly set to `undefined` was accepted (it is not JSON-lossless), and
`deepFreeze` silently skipped non-plain objects, so a hand-built DTO could
publish a mutable `Date`/`Map`. Both are now closed:

- **The serializable domain (C1) is the publication domain.** Explicit
  `undefined` at the root, on any object property, or in any array element/hole
  is refused with `WORKSPACE_UNDEFINED_VALUE`; optional properties must be
  **absent**, never present-with-`undefined`. Non-finite numbers, `bigint`,
  `function`, `symbol`/symbol keys, non-plain objects and true cycles remain
  refused.
- **Every publication boundary runs `assertSerializableValue` before
  `deepFreeze`.** `deepFreeze` is now fail-closed: a non-plain object or a
  symbol-keyed property throws `DEEP_FREEZE_UNSUPPORTED_VALUE` instead of being
  left mutable. `DeepFreezeError` is an **internal invariant guard** — with the
  assert→freeze pairing it is unreachable for validated payloads, so it is not
  part of the public error contract.
- **Freezing is non-transactional and irreversible.** `deepFreeze` freezes
  per node as it walks; a throw mid-walk can leave already-visited siblings
  frozen. Always validate first, and build replacement values as fresh plain
  data.

### P4.3 contract (binding)

C4 froze and made identity-stable the published `PreparedView.state`. A
parallel holder is **not** sufficient: a view already obtained holds a frozen
`state` and cannot observe an in-place update. P4.3 must implement exactly:

```text
private holder → atomic replacement → new projection → frozen published DTO
```

and must specify and test **which identity remains stable** (holder identity,
`PreparedViewId`, `ViewSlot`) and **which value is regenerated** after an
update. Never mutate frozen state in place (it throws), never clone shared
state (it would break identity observability), and never hand out a mutable
object. Every replacement payload must pass `assertSerializableValue` →
`deepFreeze` (a spread/merge of prior state can silently introduce
`{ field: undefined }`, which is now refused).

## Conditions That Might Warrant a Revision

- If a required shared-state update cannot be expressed as an atomic
  replacement and genuinely needs in-place mutation (would require a
  superseding ADR with an explicit safety argument).
- If the UI host (Fase 6–7) needs a mutable rendering handle that conflicts
  with frozen DTOs; such a handle must live in `medical-engine`, not here.
