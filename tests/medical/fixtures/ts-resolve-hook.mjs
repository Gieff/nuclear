/**
 * Test-only Node module resolve hook.
 *
 * The monorepo source uses `.js` specifiers for local ESM imports (TypeScript
 * convention), but Node's type stripping does not rewrite `.js` to `.ts`.
 * This hook lets the headless test suites import the real TypeScript sources
 * unchanged: when a `.js` specifier cannot be resolved, the sibling `.ts` file
 * is attempted. Nothing else is altered.
 */

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.js')) {
    try {
      return await nextResolve(specifier, context);
    } catch (error) {
      const tsSpecifier = `${specifier.slice(0, -3)}.ts`;
      try {
        return await nextResolve(tsSpecifier, context);
      } catch {
        throw error;
      }
    }
  }
  return nextResolve(specifier, context);
}
