/**
 * @nuclear/view-engine — deep freeze for published DTOs (P4.2.1 / C4, ADR-011).
 *
 * Recursively `Object.freeze`s plain objects and arrays, so a consumer that
 * obtains a reference from a `view-engine` API cannot mutate canonical state.
 * Freezing is in place and identity-preserving (`deepFreeze(x) === x`), which
 * is exactly the ADR-011 §1/§4 model: shared identity survives, free mutation
 * does not. Shared state that ADR-011 §3 lets P4.3 update is **replaced**
 * through a controlled API, never mutated in place, so freezing here is not
 * in conflict with it.
 *
 * Fail-closed (C4b): `Object.freeze` is a no-op on a `Date`/`Map`/class
 * instance, and `Object.keys` hides symbol keys, so silently skipping either
 * would publish a value that looks frozen but is still mutable. Any such
 * member is refused with a typed `DeepFreezeError` instead of being
 * partially frozen. The publication boundary validates serializability first
 * (`assertSerializableValue`), so this is a defence in depth for a hand-built
 * view that bypassed assembly.
 *
 * Node/browser-safe and dependency-free: no Node built-ins, no DOM, no WebGL,
 * no Cornerstone, no math helpers. Cycles are guarded with a `WeakSet`, so a
 * shared or cyclic object graph is visited at most once.
 */

/** Fail-closed discriminator for an unfreezable published-DTO member. */
export type DeepFreezeErrorCode = 'DEEP_FREEZE_UNSUPPORTED_VALUE';

/** Typed refusal raised when a non-plain or symbol-keyed member is found. */
export class DeepFreezeError extends Error {
  readonly code: DeepFreezeErrorCode;

  constructor(message: string) {
    super(message);
    this.name = 'DeepFreezeError';
    this.code = 'DEEP_FREEZE_UNSUPPORTED_VALUE';
  }
}

function failUnsupportedMember(detail: string): never {
  throw new DeepFreezeError(
    `Unsupported value in the published DTO: ${detail}. Remediation: publish only plain JSON values (string, finite number, boolean, null, arrays and plain/null-prototype objects); convert Date, Map, Set and class instances to plain data and drop symbol-keyed properties before publication.`,
  );
}

/** Best-effort constructor name for a non-plain object (e.g. `Date`, `Map`). */
function constructorName(value: object): string {
  const ctor: unknown = (value as { constructor?: unknown }).constructor;
  if (typeof ctor === 'function' && typeof ctor.name === 'string' && ctor.name.length > 0) {
    return ctor.name;
  }
  return 'unknown';
}

function freeze(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  const object = value as object;
  if (seen.has(object)) {
    return;
  }
  const isArray = Array.isArray(object);
  if (!isArray) {
    const prototype: object | null = Object.getPrototypeOf(object);
    if (prototype !== Object.prototype && prototype !== null) {
      failUnsupportedMember(`non-plain object (${constructorName(object)})`);
    }
  }
  const symbols = Object.getOwnPropertySymbols(object);
  if (symbols.length > 0) {
    failUnsupportedMember(`symbol-keyed property ${String(symbols[0])}`);
  }
  seen.add(object);
  if (isArray) {
    const items = object as readonly unknown[];
    for (let index = 0; index < items.length; index += 1) {
      freeze(items[index], seen);
    }
  } else {
    const entries = object as Record<string, unknown>;
    for (const key of Object.keys(entries)) {
      freeze(entries[key], seen);
    }
  }
  Object.freeze(object);
}

/**
 * Recursively freezes the plain objects/arrays reachable from `value`, in
 * place, and returns the same reference. Idempotent: an already-frozen value
 * (or one reached twice) is a no-op. Fail-closed: a non-plain object (class
 * instance, `Date`, `Map`, …) or a symbol-keyed property throws a typed
 * `DeepFreezeError` rather than being silently left mutable.
 */
export function deepFreeze<T>(value: T): T {
  freeze(value, new WeakSet<object>());
  return value;
}
