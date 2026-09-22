/**
 * @nuclear/view-engine — fail-closed workspace value integrity (P4.1.1 / C1).
 *
 * A clinical workspace never transforms caller input. A value that cannot be
 * represented losslessly in the workspace's plain-JSON value domain is
 * refused with a typed `WorkspaceError` that names the exact offending path,
 * before any workspace state is mutated. `structuredClone` runs only after the
 * value is proven safe, so `NaN`/`±Infinity`, `Date`, `Map`, `Set`, class
 * instances, `bigint`, `symbol` and functions are never silently normalised.
 *
 * Node-safe: no DOM, no WebGL, no Cornerstone.
 */
import { WorkspaceError } from './errors.js';

interface WalkState {
  readonly context: string;
  readonly ancestors: Set<object>;
}

/** Renders `context` plus the dotted/bracketed path inside the value. */
function displayPath(context: string, subPath: string): string {
  return subPath.length === 0 ? context : `${context} ${subPath}`;
}

function failNonFiniteNumber(path: string): never {
  throw new WorkspaceError(
    'WORKSPACE_NON_FINITE_NUMBER',
    `Non-finite number (NaN or ±Infinity) at '${path}'. Remediation: provide a finite number; the workspace refuses to normalise it.`,
  );
}

function failUndefinedValue(path: string): never {
  throw new WorkspaceError(
    'WORKSPACE_UNDEFINED_VALUE',
    `Explicit undefined at '${path}' is not JSON-lossless. Remediation: an optional property must be absent, not present with value undefined; JSON.stringify drops object properties and turns array holes into null, so the meaning would change on persistence.`,
  );
}

function failUnsupportedValue(path: string, detail: string): never {
  throw new WorkspaceError(
    'WORKSPACE_UNSUPPORTED_VALUE',
    `Unsupported value at '${path}': ${detail}. Remediation: register only plain JSON values (string, finite number, boolean, null, arrays and plain objects); Date, Map, Set, class instances, bigint, symbol and function are refused.`,
  );
}

function failCyclicValue(path: string): never {
  throw new WorkspaceError(
    'WORKSPACE_CYCLIC_VALUE',
    `Cyclic reference at '${path}'. Remediation: register an acyclic value; a value must not contain itself or one of its ancestors.`,
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

function walk(value: unknown, subPath: string, state: WalkState): void {
  if (value === null) {
    return;
  }
  const type = typeof value;
  if (type === 'undefined') {
    // Root, object-property value and array element (including a hole) all
    // reach here: JSON.stringify would drop the property or emit null for the
    // hole, so an explicitly-undefined value is refused fail-closed.
    failUndefinedValue(displayPath(state.context, subPath));
  }
  if (type === 'string' || type === 'boolean') {
    return;
  }
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      failNonFiniteNumber(displayPath(state.context, subPath));
    }
    return;
  }
  if (type === 'bigint') {
    failUnsupportedValue(
      displayPath(state.context, subPath),
      'bigint is not JSON-serializable',
    );
  }
  if (type === 'symbol') {
    failUnsupportedValue(
      displayPath(state.context, subPath),
      'symbol is not JSON-serializable',
    );
  }
  if (type === 'function') {
    failUnsupportedValue(
      displayPath(state.context, subPath),
      'function is not JSON-serializable',
    );
  }

  const object = value as object;
  if (state.ancestors.has(object)) {
    failCyclicValue(displayPath(state.context, subPath));
  }
  const isArray = Array.isArray(object);
  if (!isArray) {
    const prototype: object | null = Object.getPrototypeOf(object);
    if (prototype !== Object.prototype && prototype !== null) {
      failUnsupportedValue(
        displayPath(state.context, subPath),
        `non-plain object (${constructorName(object)})`,
      );
    }
  }

  state.ancestors.add(object);
  if (isArray) {
    const array = object as readonly unknown[];
    for (let index = 0; index < array.length; index += 1) {
      walk(array[index], `${subPath}[${index}]`, state);
    }
  } else {
    for (const key of Object.keys(object)) {
      const nextPath = subPath.length === 0 ? key : `${subPath}.${key}`;
      walk((object as Record<string, unknown>)[key], nextPath, state);
    }
  }
  for (const symbol of Object.getOwnPropertySymbols(object)) {
    failUnsupportedValue(
      `${displayPath(state.context, subPath)}[${String(symbol)}]`,
      `symbol-keyed property ${String(symbol)}`,
    );
  }
  state.ancestors.delete(object);
}

/**
 * Walks `value`; throws a typed `WorkspaceError` on the first unsafe node.
 * `context` prefixes the reported path (e.g. `asset 'asset-ct-001'`), so the
 * message identifies the exact field that must be corrected. Shared
 * (non-cyclic) subobject references are allowed; only true cycles fail.
 */
export function assertSerializableValue(value: unknown, context: string): void {
  walk(value, '', { context, ancestors: new Set<object>() });
}

/**
 * `assertSerializableValue(value, context)` then `structuredClone(value)`.
 * Returns a deep copy with shared references preserved and `-0` retained.
 */
export function cloneSerializableValue<T>(value: T, context: string): T {
  assertSerializableValue(value, context);
  return structuredClone(value);
}
