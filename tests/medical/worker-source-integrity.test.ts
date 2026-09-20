/**
 * NuClear P2.5 — no duplicated scientific formula in the TypeScript engine.
 *
 * The medical-engine may only map worker payloads; it must never perform
 * arithmetic. This scan fails if any engine source references `Math`, and it
 * names the scanned files so the gate cannot pass vacuously.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SRC = fileURLToPath(new URL('../../packages/medical-engine/src', import.meta.url));

function listTsFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...listTsFiles(path));
    } else if (entry.endsWith('.ts')) {
      found.push(path);
    }
  }
  return found;
}

describe('NuClear P2.5 — engine source integrity', () => {
  it('contains no Math usage anywhere in medical-engine sources', () => {
    const files = listTsFiles(SRC);
    assert.ok(files.length >= 8, `expected the worker module files, found ${files.length}`);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      assert.equal(
        /\bMath\s*\./.test(source),
        false,
        `medical-engine source must not compute: ${file} uses Math`,
      );
    }
  });

  it('contains no implicit any or non-erasable runtime type syntax', () => {
    for (const file of listTsFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      assert.equal(/\benum\s/.test(source), false, `${file} must not declare an enum`);
      assert.equal(/\bnamespace\s/.test(source), false, `${file} must not declare a namespace`);
    }
  });
});
