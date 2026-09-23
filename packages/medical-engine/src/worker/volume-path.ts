/**
 * @nuclear/medical-engine — canonical containment for worker payload files.
 *
 * The worker publishes only an opaque handle and a worker-generated file name;
 * the bridge resolves that name under the advertised private root and refuses
 * anything that is not a single, real, contained regular file. Absolute paths,
 * traversal, embedded separators, NUL bytes and symlinked root/file components
 * are all rejected before any byte is read (ADR-013 §2). Error messages never
 * contain a filesystem path.
 */

import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve, win32 } from 'node:path';
import { WorkerVolumeTransportError } from './volume-errors.js';

function rejected(detail: string): WorkerVolumeTransportError {
  return new WorkerVolumeTransportError(
    'path-rejected',
    `Refusing to resolve the worker payload file name: ${detail}.`,
  );
}

/**
 * Resolve `fileName` to a canonical path proven to sit directly inside `root`.
 *
 * @throws WorkerVolumeTransportError before any I/O when the name is absolute,
 * traversal, multi-component or NUL-bearing; when the root is missing or is a
 * symlink; or when the target is missing, a symlink or not a regular file.
 */
export function resolveContainedPayloadPath(root: string, fileName: string): string {
  if (typeof root !== 'string' || root.length === 0) {
    throw new WorkerVolumeTransportError(
      'capability-unavailable',
      'The worker did not advertise a usable volume transport root.',
    );
  }
  if (typeof fileName !== 'string' || fileName.length === 0 || fileName === '.' || fileName === '..') {
    throw rejected('the name is empty or a directory reference');
  }
  if (fileName.includes('\0')) throw rejected('the name contains a NUL byte');
  if (
    fileName.includes('/') ||
    fileName.includes('\\') ||
    isAbsolute(fileName) ||
    win32.isAbsolute(fileName)
  ) {
    throw rejected('the name is absolute or contains a path separator');
  }
  if (basename(fileName) !== fileName) throw rejected('the name is not a single component');

  let rootStat;
  try {
    rootStat = lstatSync(root);
  } catch {
    throw new WorkerVolumeTransportError(
      'capability-unavailable',
      'The advertised volume transport root does not exist.',
    );
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw rejected('the advertised root is not a real directory');
  }
  const rootReal = realpathSync(root);
  const candidate = resolve(rootReal, fileName);
  if (dirname(candidate) !== rootReal) {
    throw rejected('the resolved path escapes the advertised root');
  }

  let fileStat;
  try {
    fileStat = lstatSync(candidate);
  } catch {
    throw new WorkerVolumeTransportError(
      'file-missing',
      'The tracked payload file is missing; re-issue the hydration request.',
    );
  }
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
    throw rejected('the target is a symlink or not a regular file');
  }
  const fileReal = realpathSync(candidate);
  if (dirname(fileReal) !== rootReal) {
    throw rejected('the canonical target escapes the advertised root');
  }
  return fileReal;
}
