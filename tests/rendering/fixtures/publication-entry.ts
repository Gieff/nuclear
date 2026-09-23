/**
 * NuClear P5.5b — browser entry for the publication renderer port probe
 * (test infrastructure).
 *
 * Bundled by esbuild into `tests/rendering/.harness/` and driven by the
 * controlled WebGL 2 Playwright harness. Test-only; never product UI.
 */

import { probeWebGL2 } from './adapter-host.ts';
import { renderPublicationPanel } from './publication-scenarios.ts';

globalThis.__nuclearRendererProbe = { webgl2: probeWebGL2 };
globalThis.__nuclearPublicationProbe = { renderPublicationPanel };
globalThis.__nuclearRendererProbeReady = true;
