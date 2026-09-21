/**
 * NuClear P3.0 — controlled WebGL 2 renderer harness (test infrastructure).
 *
 * Bundles `tests/rendering/fixtures/harness-entry.ts` with the esbuild JS API,
 * serves the bundle from an ephemeral `127.0.0.1` static server and drives it
 * in a Playwright headless Chromium page. It is NOT product UI and is not
 * imported by any package under `packages/`.
 *
 * Default backend is deterministic software WebGL 2
 * (`--use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist`). A hardware
 * backend may be requested explicitly with `NUCLEAR_RENDERER_GL=metal`; the
 * raw `default` value launches Chromium with no GL args. `launchArgs` on the
 * options object takes precedence and is used by the fail-closed negative test.
 *
 * The browser entry is pluggable via `options.entryPath` (default
 * `./harness-entry.ts`). Each distinct entry is bundled once, memoized by entry
 * path and written to its own file under the gitignored `.harness/` directory.
 */

import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { chromium } from 'playwright';

const DEFAULT_ENTRY_PATH = fileURLToPath(new URL('./harness-entry.ts', import.meta.url));
const BUNDLE_DIR = fileURLToPath(new URL('../.harness/', import.meta.url));

export const RENDERER_UNAVAILABLE_CODE = 'RENDERER_UNAVAILABLE';

/** Thrown when the harness page cannot provide the requested WebGL context. */
export class RendererUnavailableError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RendererUnavailableError';
    this.code = RENDERER_UNAVAILABLE_CODE;
    if (typeof details.reason === 'string') {
      this.reason = details.reason;
    }
    if (details.probe !== undefined) {
      this.probe = details.probe;
    }
  }
}

const GL_LAUNCH_ARGS = {
  swiftshader: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  metal: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
  default: [],
};

function resolveLaunchArgs(overrides) {
  if (Array.isArray(overrides)) {
    return [...overrides];
  }
  const mode = process.env.NUCLEAR_RENDERER_GL ?? 'swiftshader';
  const args = GL_LAUNCH_ARGS[mode];
  if (!args) {
    throw new Error(
      `Unknown NUCLEAR_RENDERER_GL="${mode}" (expected "swiftshader", "metal" or "default")`,
    );
  }
  return [...args];
}

const bundleCache = new Map();

function resolveEntryPath(entryPath) {
  if (typeof entryPath === 'string' && entryPath.length > 0) {
    return entryPath;
  }
  return DEFAULT_ENTRY_PATH;
}

function bundleFileName(entryPath) {
  const safe = basename(entryPath).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `harness-${safe.replace(/\.ts$/, '')}-bundle.js`;
}

async function buildBundle(entryPath) {
  await mkdir(BUNDLE_DIR, { recursive: true });
  const outfile = join(BUNDLE_DIR, bundleFileName(entryPath));
  await build({
    entryPoints: [entryPath],
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'warning',
  });
  return readFile(outfile, 'utf8');
}

function ensureBundle(entryPath) {
  let pending = bundleCache.get(entryPath);
  if (!pending) {
    pending = buildBundle(entryPath).catch((error) => {
      bundleCache.delete(entryPath);
      throw error;
    });
    bundleCache.set(entryPath, pending);
  }
  return pending;
}

const HARNESS_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
    <title>NuClear P3.0 renderer harness</title>
  </head>
  <body>
    <script src="/harness-bundle.js"></script>
  </body>
</html>`;

async function startServer(bundleSource) {
  const server = createServer((request, response) => {
    const path = request.url ?? '/';
    if (path === '/' || path.startsWith('/?')) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(HARNESS_HTML);
      return;
    }
    if (path === '/harness-bundle.js') {
      response.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(bundleSource);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('renderer harness server did not bind to an ephemeral TCP port');
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

function stopServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

/**
 * Creates a ready-to-drive harness page.
 *
 * @param {object} [options]
 * @param {string[]} [options.launchArgs] Explicit Chromium args (overrides NUCLEAR_RENDERER_GL).
 * @param {string} [options.entryPath] Browser entry to bundle (defaults to harness-entry.ts).
 * @param {boolean} [options.requireWebGL2=true] Reject with RendererUnavailableError when WebGL2 is absent.
 * @param {number} [options.readyTimeoutMs=120000] Budget for the probe readiness marker.
 */
export async function createRendererHarness(options = {}) {
  const requireWebGL2 = options.requireWebGL2 !== false;
  const readyTimeoutMs = options.readyTimeoutMs ?? 120_000;
  const launchArgs = resolveLaunchArgs(options.launchArgs);
  const entryPath = resolveEntryPath(options.entryPath);
  const bundleSource = await ensureBundle(entryPath);
  const { server, origin } = await startServer(bundleSource);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: launchArgs });
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error instanceof Error ? error.message : String(error));
    });

    await page.goto(`${origin}/`, { waitUntil: 'load' });
    await page.waitForFunction('globalThis.__nuclearRendererProbeReady === true', undefined, {
      timeout: readyTimeoutMs,
    });

    const webgl2 = () =>
      page.evaluate(() => {
        const scope = globalThis;
        const probe = scope.__nuclearRendererProbe;
        if (!probe) {
          throw new Error('__nuclearRendererProbe is not installed');
        }
        return probe.webgl2();
      });

    let webgl2Probe;
    if (requireWebGL2) {
      webgl2Probe = await webgl2();
      if (webgl2Probe.ok !== true) {
        throw new RendererUnavailableError(
          `WebGL 2 was requested but is unavailable: ${webgl2Probe.reason ?? 'unknown reason'}`,
          { reason: webgl2Probe.reason, probe: webgl2Probe },
        );
      }
    }

    let closed = false;
    const close = async () => {
      if (closed) {
        return;
      }
      closed = true;
      try {
        await browser.close();
      } finally {
        await stopServer(server);
      }
    };

    return { launchArgs, page, webgl2, close, consoleErrors, pageErrors, webgl2Probe };
  } catch (error) {
    const cleanupErrors = [];
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        cleanupErrors.push(closeError);
      }
    }
    try {
      await stopServer(server);
    } catch (closeError) {
      cleanupErrors.push(closeError);
    }
    if (cleanupErrors.length > 0 && error && typeof error === 'object') {
      error.cleanupErrors = cleanupErrors;
    }
    throw error;
  }
}
