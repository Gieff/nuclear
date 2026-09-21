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

## Conditions That Might Warrant a Revision

- If a required shared-state update cannot be expressed as an atomic
  replacement and genuinely needs in-place mutation (would require a
  superseding ADR with an explicit safety argument).
- If the UI host (Fase 6–7) needs a mutable rendering handle that conflicts
  with frozen DTOs; such a handle must live in `medical-engine`, not here.
