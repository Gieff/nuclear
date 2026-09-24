#!/usr/bin/env node
/**
 * @file verify-harness.mjs
 * Objective gate for the NuClear opencode harness (ADR-017).
 *
 * Resolves the effective opencode configuration (`opencode debug config`),
 * filters only safe, non-secret fields, and asserts the harness invariants:
 * enforced read-only controls, working-directory-safe delegation, the
 * orchestrator's Plannotator `submit_plan` grant, compaction pruning, and the
 * absence of the legacy `permissions:` (plural) schema.
 *
 * Fail-closed semantics:
 *   exit 0  PASS      every invariant holds
 *   exit 1  FAIL      at least one invariant is violated
 *   exit 2  BLOCKED   the runner or its configuration is unavailable
 *
 * A missing runner or an unreadable config is BLOCKED, never PASS.
 *
 * Usage:
 *   node scripts/verify-harness.mjs
 *   npm run verify:harness
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const EXPECTED_MODELS = {
  'nuclear-orchestrator': 'openrouter/openai/gpt-6-luna',
  'nuclear-engine-engineer': 'openrouter/deepseek/deepseek-v4.1-flash',
  'nuclear-ui-engineer': 'openrouter/deepseek/deepseek-v4.1-flash',
  'nuclear-scientific-engineer': 'deepseek/deepseek-flash',
  'nuclear-reviewer': 'openrouter/z-ai/glm-5.3-flash',
  'nuclear-qa': 'openrouter/z-ai/glm-5.3-flash',
  'nuclear-changelog-writer': 'openrouter/z-ai/glm-5.3-flash',
  'nuclear-ux-auditor': 'deepseek/deepseek-flash',
  'nuclear-architect': 'openrouter/openai/gpt-6-sol',
};

const READ_ONLY_AGENTS = ['nuclear-reviewer', 'nuclear-qa', 'nuclear-ux-auditor'];

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
}

function loadResolvedConfig() {
  const proc = spawnSync('opencode', ['debug', 'config'], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (proc.error) return { blocked: `opencode not runnable: ${proc.error.message}` };
  if (proc.status !== 0) return { blocked: `opencode debug config exited ${proc.status}` };
  const raw = (proc.stdout || '').trim();
  if (!raw) return { blocked: 'opencode debug config produced no output' };
  try {
    return { config: JSON.parse(raw) };
  } catch (error) {
    return { blocked: `resolved config is not JSON: ${error.message}` };
  }
}

function resolvedEditAllowsAll(edit) {
  if (edit === 'allow') return true;
  return Boolean(edit && typeof edit === 'object' && edit['*'] === 'allow');
}

function main() {
  const loaded = loadResolvedConfig();
  if (loaded.blocked) {
    console.error(`BLOCKED: ${loaded.blocked}`);
    process.exit(2);
  }

  const config = loaded.config;
  const agents = config.agent || {};

  for (const [name, model] of Object.entries(EXPECTED_MODELS)) {
    const agent = agents[name];
    check(`agent present: ${name}`, Boolean(agent));
    if (agent) {
      check(`agent model: ${name}`, agent.model === model, `expected ${model}, got ${agent.model}`);
    }
  }

  for (const name of READ_ONLY_AGENTS) {
    const edit = (agents[name] || {}).permission?.edit;
    check(`read-only edit denied: ${name}`, edit === 'deny', `got ${JSON.stringify(edit)}`);
  }

  for (const name of [...READ_ONLY_AGENTS, 'nuclear-changelog-writer']) {
    const permission = (agents[name] || {}).permission || {};
    check(`read-only task denied: ${name}`, permission.task === 'deny', `got ${JSON.stringify(permission.task)}`);
    check(
      `read-only external_directory denied: ${name}`,
      permission.external_directory === 'deny',
      `got ${JSON.stringify(permission.external_directory)}`,
    );
    check(
      `read-only bash defaults to deny: ${name}`,
      Boolean(permission.bash && typeof permission.bash === 'object' && permission.bash['*'] === 'deny'),
      `got ${JSON.stringify(permission.bash)}`,
    );
  }

  for (const name of ['nuclear-engine-engineer', 'nuclear-scientific-engineer', 'nuclear-ui-engineer']) {
    const task = (agents[name] || {}).permission?.task;
    check(`implementer delegation denied: ${name}`, task === 'deny', `got ${JSON.stringify(task)}`);
  }

  const changelogEdit = agents['nuclear-changelog-writer']?.permission?.edit;
  check(
    'changelog writer scoped to CHANGELOG.md',
    Boolean(
      changelogEdit &&
        typeof changelogEdit === 'object' &&
        changelogEdit['*'] === 'deny' &&
        changelogEdit['CHANGELOG.md'] === 'allow',
    ),
    `got ${JSON.stringify(changelogEdit)}`,
  );

  const orchestratorPermission = agents['nuclear-orchestrator']?.permission || {};
  check(
    'orchestrator can submit plans',
    orchestratorPermission.submit_plan === 'allow',
    `got ${JSON.stringify(orchestratorPermission.submit_plan)}`,
  );
  check(
    'orchestrator retains full edit',
    resolvedEditAllowsAll(orchestratorPermission.edit),
    `got ${JSON.stringify(orchestratorPermission.edit)}`,
  );
  check(
    'orchestrator delegation is allowlisted',
    Boolean(
      orchestratorPermission.task &&
        typeof orchestratorPermission.task === 'object' &&
        orchestratorPermission.task['*'] === 'deny' &&
        orchestratorPermission.task['nuclear-*'] === 'allow',
    ),
    `got ${JSON.stringify(orchestratorPermission.task)}`,
  );
  check(
    'orchestrator external_directory denied',
    orchestratorPermission.external_directory === 'deny',
    `got ${JSON.stringify(orchestratorPermission.external_directory)}`,
  );

  const architectEdit = agents['nuclear-architect']?.permission?.edit;
  check(
    'architect cannot write source files',
    Boolean(architectEdit && typeof architectEdit === 'object' && architectEdit['*'] === 'deny'),
    `got ${JSON.stringify(architectEdit)}`,
  );

  check('compaction.prune enabled', config.compaction?.prune === true);
  check('compaction.auto enabled', config.compaction?.auto === true);
  check('subagent_depth bounded', config.subagent_depth === 1, `got ${config.subagent_depth}`);

  const agentDir = path.join(rootDir, '.opencode', 'agents');
  const legacy = [];
  if (fs.existsSync(agentDir)) {
    for (const file of fs.readdirSync(agentDir)) {
      if (!file.endsWith('.md')) continue;
      const source = fs.readFileSync(path.join(agentDir, file), 'utf8');
      if (/^\s*permissions\s*:/m.test(source)) legacy.push(file);
    }
  }
  check('no legacy permissions: schema', legacy.length === 0, legacy.join(', '));

  const failed = results.filter((entry) => !entry.ok);
  for (const entry of results) {
    const status = entry.ok ? 'PASS' : 'FAIL';
    const suffix = entry.ok || !entry.detail ? '' : ` — ${entry.detail}`;
    console.log(`${status}  ${entry.label}${suffix}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} harness invariants hold.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
