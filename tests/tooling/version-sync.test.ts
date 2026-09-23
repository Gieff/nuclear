/**
 * NuClear release-tooling guard — every machine release-version mirror must
 * equal the monorepo root version.
 *
 * `scripts/bump-version.mjs` is the single authority that synchronizes these
 * mirrors across the TypeScript workspaces, the Python scientific worker and
 * the committed evidence fixtures. This guard fails closed if any mirror
 * drifts — most notably the `workerMetadata.workerVersion` embedded in the
 * rendering-fixture evidence, whose staleness otherwise fails the Python
 * byte-identical regeneration gate. It does not replace the governed bump;
 * it makes a forgotten mirror a test failure rather than a release surprise.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface WorkspacePackageJson {
  readonly version?: unknown;
  readonly workspaces?: readonly string[];
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

const RENDERING_EVIDENCE_NAMES = new Set([
  'expected-geometry.json',
  'expected-quantitation.json',
]);

function readText(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf-8');
}

function readPackageJson(relPath: string): WorkspacePackageJson {
  return JSON.parse(readText(relPath)) as WorkspacePackageJson;
}

function extract(relPath: string, regex: RegExp): string {
  const match = readText(relPath).match(regex);
  assert.ok(match, `${relPath}: expected a version field matching ${String(regex)}`);
  return match[1] ?? match[0];
}

const rootPkg = readPackageJson('package.json');
const rootVersion = rootPkg.version;
assert.ok(
  typeof rootVersion === 'string' && /^\d+\.\d+\.\d+$/.test(rootVersion),
  `package.json version must be a plain SemVer, received ${JSON.stringify(rootVersion)}`,
);

function workspacePackagePaths(): string[] {
  const paths: string[] = ['package.json'];
  for (const pattern of rootPkg.workspaces ?? []) {
    const baseDir = pattern.replace(/\/\*$/, '');
    const absBase = path.join(repoRoot, baseDir);
    if (!fs.existsSync(absBase)) continue;
    for (const entry of fs.readdirSync(absBase, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const rel = path.join(baseDir, entry.name, 'package.json');
      if (fs.existsSync(path.join(repoRoot, rel))) paths.push(rel);
    }
  }
  return paths;
}

function renderingEvidencePaths(): string[] {
  const baseDir = 'tests/rendering/fixtures/volumes';
  const absBase = path.join(repoRoot, baseDir);
  if (!fs.existsSync(absBase)) return [];
  return fs
    .readdirSync(absBase, { recursive: true })
    .filter((entry): entry is string => typeof entry === 'string')
    .filter((entry) => RENDERING_EVIDENCE_NAMES.has(path.basename(entry)))
    .map((entry) => path.join(baseDir, entry))
    .sort();
}

describe('release version synchronization', () => {
  it('every workspace package.json matches the root version', () => {
    for (const relPath of workspacePackagePaths()) {
      assert.equal(readPackageJson(relPath).version, rootVersion, relPath);
    }
  });

  it('every internal @nuclear/* dependency range matches the root version', () => {
    for (const relPath of workspacePackagePaths()) {
      const pkg = readPackageJson(relPath);
      for (const field of DEP_FIELDS) {
        const deps = pkg[field];
        if (!deps) continue;
        for (const [name, range] of Object.entries(deps)) {
          if (!name.startsWith('@nuclear/')) continue;
          assert.equal(range.replace(/^[\^~]/, ''), rootVersion, `${relPath} → ${name}`);
        }
      }
    }
  });

  it('the Python scientific worker mirrors the root version', () => {
    assert.equal(extract('python/pyproject.toml', /^version\s*=\s*"([^"]+)"/m), rootVersion);
    assert.equal(
      extract('python/dicom/__init__.py', /^__version__\s*=\s*"([^"]+)"/m),
      rootVersion,
    );
    assert.equal(
      extract('python/worker/__init__.py', /^__version__\s*=\s*"([^"]+)"/m),
      rootVersion,
    );
  });

  it('the ratified handshake fixture mirrors the root version', () => {
    assert.equal(
      extract(
        'tests/fixtures/protocol/response.handshake.json',
        /"workerVersion"\s*:\s*"([^"]+)"/,
      ),
      rootVersion,
    );
  });

  it('every committed rendering-fixture worker evidence mirrors the root version', () => {
    const paths = renderingEvidencePaths();
    assert.ok(paths.length > 0, 'expected committed rendering-fixture worker evidence');
    for (const relPath of paths) {
      assert.equal(
        extract(relPath, /"workerVersion"\s*:\s*"([^"]+)"/),
        rootVersion,
        relPath,
      );
    }
  });

  it('the governed bump script discovers and re-stamps every mirror (dry-run)', () => {
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, 'scripts', 'bump-version.mjs'), '9.9.9', '--dry-run'],
      { cwd: repoRoot, encoding: 'utf-8' },
    );
    assert.equal(result.status, 0, String(result.stderr || result.stdout));
    const stdout = String(result.stdout);
    assert.match(stdout, /response\.handshake\.json/);
    assert.match(stdout, /expected-geometry\.json/);
    assert.match(stdout, /expected-quantitation\.json/);
  });
});
