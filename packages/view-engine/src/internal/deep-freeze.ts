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
 * Node/browser-safe and dependency-free: no Node built-ins, no DOM, no WebGL,
 * no Cornerstone, no math helpers. Cycles are guarded with a `WeakSet`, so a
 * shared or cyclic object graph is visited at most once.
 */

function isFreezable(value: object): boolean {
  if (Array.isArray(value)) {
    return true;
  }
  const prototype: object | null = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function freeze(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  const object = value as object;
  if (!isFreezable(object)) {
    return;
  }
  if (seen.has(object)) {
    return;
  }
  seen.add(object);
  if (Array.isArray(object)) {
    const items = object as readonly unknown[];
    for (const item of items) {
      freeze(item, seen);
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
 * (or one reached twice) is a no-op. Non-plain objects (class instances,
 * `Date`, `Map`, …) are left untouched rather than frozen.
 */
export function deepFreeze<T>(value: T): T {
  freeze(value, new WeakSet<object>());
  return value;
}
