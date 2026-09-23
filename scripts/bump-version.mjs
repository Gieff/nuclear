#!/usr/bin/env node
/**
 * @file bump-version.mjs
 * Centrally synchronizes SemVer version across NuClear monorepo:
 * - Root package.json
 * - Workspace package.json files (packages/*, apps/*)
 * - Internal @nuclear/* dependencies across workspaces
 * - Python scientific worker (pyproject.toml, dicom/__init__.py, worker/__init__.py)
 * - Ratified protocol handshake fixture (response.handshake.json)
 * - Committed rendering-fixture worker evidence (expected-geometry.json and
 *   expected-quantitation.json under tests/rendering/fixtures/volumes)
 * - Provisioned Python .venv editable metadata (if present)
 *
 * Every declared mirror is required: a mirror that is missing or no longer
 * carries a version field aborts the bump (fail-closed) instead of silently
 * drifting. tests/tooling/version-sync.test.ts independently re-checks the
 * same mirrors.
 *
 * Usage:
 *   node scripts/bump-version.mjs <new-version> [--dry-run]
 *   npm run bump <new-version>
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const newVersion = args.find((arg) => !arg.startsWith('--'));

if (!newVersion) {
  console.error('Usage: npm run bump <version> [--dry-run] (e.g. npm run bump 0.2.0)');
  process.exit(1);
}

const semverRegex = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
if (!semverRegex.test(newVersion)) {
  console.error(`Error: Invalid SemVer format "${newVersion}". Expected X.Y.Z (e.g. 0.2.0)`);
  process.exit(1);
}

const rootPkgPath = path.join(rootDir, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
const oldVersion = rootPkg.version;

if (oldVersion === newVersion) {
  console.log(`Repository is already at version ${newVersion}. Nothing to bump.`);
  process.exit(0);
}

console.log(
  `Bumping NuClear monorepo version: ${oldVersion} -> ${newVersion}${isDryRun ? ' [DRY RUN]' : ''}\n`
);

// 1. Discover all workspace package.json files
const targetPkgPaths = [rootPkgPath];
const workspaces = rootPkg.workspaces || [];

for (const pattern of workspaces) {
  const baseDir = pattern.replace(/\/\*$/, '');
  const absBaseDir = path.join(rootDir, baseDir);
  if (fs.existsSync(absBaseDir)) {
    const entries = fs.readdirSync(absBaseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgFile = path.join(absBaseDir, entry.name, 'package.json');
        if (fs.existsSync(pkgFile)) {
          targetPkgPaths.push(pkgFile);
        }
      }
    }
  }
}

// 2. Collect all workspace package names
const workspacePackages = targetPkgPaths.map((p) => {
  const content = fs.readFileSync(p, 'utf-8');
  return { path: p, json: JSON.parse(content) };
});

const internalPackageNames = new Set(
  workspacePackages.map((wp) => wp.json.name).filter(Boolean)
);

// Helper to update internal dependency version
function syncDependencies(deps, names, targetVer) {
  if (!deps || typeof deps !== 'object') return false;
  let changed = false;
  for (const [depName, currentRange] of Object.entries(deps)) {
    if (names.has(depName) || depName.startsWith('@nuclear/')) {
      const prefix = (currentRange.match(/^[\^~]/) || [''])[0];
      const updatedRange = `${prefix}${targetVer}`;
      if (currentRange !== updatedRange) {
        deps[depName] = updatedRange;
        changed = true;
      }
    }
  }
  return changed;
}

// 3. Update package.json files
const depFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
for (const { path: pkgPath, json: pkg } of workspacePackages) {
  const relPath = path.relative(rootDir, pkgPath);
  pkg.version = newVersion;
  let depsChanged = false;
  for (const field of depFields) {
    if (syncDependencies(pkg[field], internalPackageNames, newVersion)) {
      depsChanged = true;
    }
  }
  if (!isDryRun) {
    let output = JSON.stringify(pkg, null, 2) + '\n';
    output = output.replace(/\[\s*"dist",\s*"src"\s*\]/g, '["dist", "src"]');
    fs.writeFileSync(pkgPath, output, 'utf-8');
  }
  console.log(`✔ Updated ${relPath} to ${newVersion}${depsChanged ? ' (synchronized internal dependencies)' : ''}`);
}

// 4. Update every declared version mirror through one fail-closed helper: a
//    missing file, or a file with no version field, aborts the bump instead of
//    letting a mirror silently drift out of sync.
function updateVersionMirror(relPath, regex) {
  const absPath = path.join(rootDir, relPath);
  if (!fs.existsSync(absPath)) {
    console.error(`Error: expected version mirror "${relPath}" is missing.`);
    process.exit(1);
  }
  const original = fs.readFileSync(absPath, 'utf-8');
  const countRegex = new RegExp(
    regex.source,
    regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
  );
  const matches = original.match(countRegex);
  if (!matches || matches.length === 0) {
    console.error(
      `Error: "${relPath}" declares no version to synchronize; ` +
        'a mirror was renamed or removed. Update scripts/bump-version.mjs.'
    );
    process.exit(1);
  }
  const updated = original.replace(regex, `$1"${newVersion}"`);
  if (!isDryRun && updated !== original) {
    fs.writeFileSync(absPath, updated, 'utf-8');
  }
  const count = matches.length;
  console.log(
    `✔ Updated ${relPath} to ${newVersion} (${count} occurrence${count === 1 ? '' : 's'})`
  );
}

// 4a. Python scientific worker mirrors
updateVersionMirror('python/pyproject.toml', /(^version\s*=\s*)"[^"]+"/m);
updateVersionMirror('python/dicom/__init__.py', /(^__version__\s*=\s*)"[^"]+"/m);
updateVersionMirror('python/worker/__init__.py', /(^__version__\s*=\s*)"[^"]+"/m);

// 4b. Ratified protocol handshake response fixture
updateVersionMirror(
  'tests/fixtures/protocol/response.handshake.json',
  /("workerVersion"\s*:\s*)"[^"]+"/g
);

// 4c. Committed rendering-fixture worker evidence. `expected-geometry.json` and
//     `expected-quantitation.json` embed workerMetadata.workerVersion; leaving
//     them stale fails python/tests/test_rendering_volume_fixtures.py
//     (byte-identical regeneration) and therefore the release gate.
const renderingVolumesDir = path.join(rootDir, 'tests/rendering/fixtures/volumes');
const renderingEvidenceNames = new Set(['expected-geometry.json', 'expected-quantitation.json']);
const renderingEvidencePaths = fs.existsSync(renderingVolumesDir)
  ? fs
      .readdirSync(renderingVolumesDir, { recursive: true })
      .filter((entry) => typeof entry === 'string' && renderingEvidenceNames.has(path.basename(entry)))
      .map((entry) => path.join(renderingVolumesDir, entry))
      .sort()
  : [];
if (renderingEvidencePaths.length === 0) {
  console.error(
    'Error: no rendering-fixture worker evidence found under ' +
      'tests/rendering/fixtures/volumes. Update scripts/bump-version.mjs.'
  );
  process.exit(1);
}
for (const absPath of renderingEvidencePaths) {
  updateVersionMirror(
    path.relative(rootDir, absPath),
    /("workerVersion"\s*:\s*)"[^"]+"/g
  );
}

// 5. Update local Python virtual environment metadata if present
const venvLibDir = path.join(rootDir, 'python/worker/.venv/lib');
if (fs.existsSync(venvLibDir)) {
  const pyVersions = fs.readdirSync(venvLibDir, { withFileTypes: true });
  for (const pyVer of pyVersions) {
    if (pyVer.isDirectory() && pyVer.name.startsWith('python')) {
      const spDir = path.join(venvLibDir, pyVer.name, 'site-packages');
      if (fs.existsSync(spDir)) {
        const spEntries = fs.readdirSync(spDir, { withFileTypes: true });
        for (const entry of spEntries) {
          if (entry.isDirectory() && entry.name.startsWith('nuclear_scientific-') && entry.name.endsWith('.dist-info')) {
            const oldDistInfo = path.join(spDir, entry.name);
            const newDistInfo = path.join(spDir, `nuclear_scientific-${newVersion}.dist-info`);
            const metaFile = path.join(oldDistInfo, 'METADATA');
            if (fs.existsSync(metaFile)) {
              const metaContent = fs.readFileSync(metaFile, 'utf-8');
              const updatedMeta = metaContent.replace(/^Version:\s*.+$/m, `Version: ${newVersion}`);
              if (!isDryRun) {
                fs.writeFileSync(metaFile, updatedMeta, 'utf-8');
                if (oldDistInfo !== newDistInfo) {
                  fs.renameSync(oldDistInfo, newDistInfo);
                }
              }
              const relDist = path.relative(rootDir, newDistInfo);
              console.log(`✔ Synchronized Python virtual environment metadata in ${relDist}`);
            }
          }
        }
      }
    }
  }
}

// 6. Synchronize the root package-lock.json so a bump never leaves the
//    lockfile stale. npm is the authority for the lockfile format; letting it
//    reconcile workspace versions and internal dependency ranges avoids
//    hand-editing npm-managed state.
if (isDryRun) {
  console.log('• Would synchronize package-lock.json via "npm install --package-lock-only"');
} else {
  console.log('Synchronizing package-lock.json...');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const lockResult = spawnSync(
    npmCmd,
    ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: rootDir, stdio: 'inherit' }
  );
  if (lockResult.error || lockResult.status !== 0) {
    console.error(
      `\nError: failed to synchronize package-lock.json (` +
        `${lockResult.error ? lockResult.error.message : `exit code ${lockResult.status}`}).\n` +
        'The version files were updated, but the lockfile is now stale.\n' +
        'Run "npm install --package-lock-only" manually and re-check before committing.'
    );
    process.exit(1);
  }
  console.log('✔ Updated package-lock.json');
}

console.log(`\n🎉 Successfully synchronized NuClear monorepo to v${newVersion}!`);
