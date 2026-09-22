/**
 * @nuclear/view-engine — dependency-free structural equality (P4.2.2 / C5).
 *
 * Compares **plain JSON values** (string, number, boolean, null, arrays and
 * plain objects) by structure rather than by reference: object key order is
 * irrelevant, arrays are compared element-wise and scalars use `Object.is`.
 *
 * Node/browser-safe and side-effect free: no Node built-ins, no DOM, no
 * WebGL, no Cornerstone and no third-party dependency. It performs no
 * cloning and never mutates its arguments.
 */
export function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }
  if (typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }

  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);
  if (leftIsArray !== rightIsArray) {
    return false;
  }

  if (leftIsArray) {
    const leftItems = left as readonly unknown[];
    const rightItems = right as readonly unknown[];
    if (leftItems.length !== rightItems.length) {
      return false;
    }
    for (let index = 0; index < leftItems.length; index += 1) {
      if (!structurallyEqual(leftItems[index], rightItems[index])) {
        return false;
      }
    }
    return true;
  }

  const leftEntries = left as Readonly<Record<string, unknown>>;
  const rightEntries = right as Readonly<Record<string, unknown>>;
  const leftKeys = Object.keys(leftEntries).sort();
  const rightKeys = Object.keys(rightEntries).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) {
      return false;
    }
  }
  for (const key of leftKeys) {
    if (!structurallyEqual(leftEntries[key], rightEntries[key])) {
      return false;
    }
  }
  return true;
}
