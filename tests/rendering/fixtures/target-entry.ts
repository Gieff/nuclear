/**
 * NuClear P3.5 — browser-side temporary high-resolution RenderTarget probe.
 *
 * Bundled by esbuild into `tests/rendering/.harness/` and driven by the
 * controlled WebGL 2 Playwright harness. It keeps one ordinary live adapter
 * (512×512) with the committed `ct-axial` applied and drives the real
 * `captureTemporaryRenderTarget` through `target-scenarios.ts` /
 * `target-scenarios-failure.ts`: 300 DPI native dimensions, render equivalence
 * with the ordinary capture, full live-canvas invariance, allocation failure and
 * disposal after an apply refusal. Every result is plain and serializable
 * because custom `Error` fields do not survive `page.evaluate`. Test-only; never
 * product UI.
 */

import { probeWebGL2 } from './adapter-host.ts';
import { teardown } from './target-scenario-support.ts';
import { captureEquivalence, targetFailure } from './target-scenarios-failure.ts';
import { captureTarget, captureTargetAtDpi, snapshotLive } from './target-scenarios.ts';

globalThis.__nuclearRendererProbe = { webgl2: probeWebGL2 };
globalThis.__nuclearTargetProbe = {
  captureTarget,
  captureTargetAtDpi,
  captureEquivalence,
  targetFailure,
  snapshotLive,
  teardown,
};
globalThis.__nuclearRendererProbeReady = true;
