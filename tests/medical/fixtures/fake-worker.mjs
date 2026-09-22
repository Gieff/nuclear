#!/usr/bin/env node
/**
 * Test-only scripted NuClear worker. It speaks the ADR-002 newline-delimited
 * JSON-RPC 2.0 protocol and is driven entirely by environment variables so the
 * bridge tests can exercise correlation, timeout, restart, malformed output and
 * handshake mismatches without touching the real Python worker.
 *
 * Modes: respond (default), hang-handshake, mismatch-envelope, mismatch-versions,
 * missing-op, malformed. `FAKE_WORKER_HANG_METHOD` never answers a named method;
 * `FAKE_WORKER_CRASH_METHOD` exits(7) on it; `FAKE_WORKER_CRASH_ON_START=1`
 * exits before reading stdin.
 */

import process from 'node:process';

const MODE = process.env.FAKE_WORKER_MODE ?? 'respond';
const HANG_METHOD = process.env.FAKE_WORKER_HANG_METHOD ?? '';
const CRASH_METHOD = process.env.FAKE_WORKER_CRASH_METHOD ?? '';

const OPERATIONS = [
  'nuclear.dicom.compatibility',
  'nuclear.dicom.geometry',
  'nuclear.dicom.inspect',
  'nuclear.protocol.handshake',
  'nuclear.quantitation.suvbw',
  'nuclear.registration',
];

const METADATA = {
  workerVersion: '9.9.9-fake',
  operation: 'nuclear.protocol.handshake',
  timestamp: '2026-01-01T00:00:00Z',
  parameters: {},
};

function write(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function handshakeResult(overrides = {}) {
  return {
    protocolVersions: ['1.0'],
    operations: OPERATIONS,
    workerMetadata: METADATA,
    ...overrides,
  };
}

function respond(request) {
  const id = request.id;
  const method = request.method;
  const params = request.params ?? {};

  if (MODE === 'hang-handshake' && method === 'nuclear.protocol.handshake') return;
  if (HANG_METHOD && method === HANG_METHOD) return;
  if (CRASH_METHOD && method === CRASH_METHOD) process.exit(7);

  if (method === 'nuclear.protocol.handshake') {
    if (MODE === 'mismatch-envelope') {
      write({ jsonrpc: '2.0', id, protocolVersion: '2.0', result: handshakeResult() });
      return;
    }
    if (MODE === 'mismatch-versions') {
      write({
        jsonrpc: '2.0',
        id,
        protocolVersion: '1.0',
        result: handshakeResult({ protocolVersions: ['2.0'] }),
      });
      return;
    }
    if (MODE === 'missing-op') {
      write({
        jsonrpc: '2.0',
        id,
        protocolVersion: '1.0',
        result: handshakeResult({
          operations: OPERATIONS.filter((name) => name !== 'nuclear.quantitation.suvbw'),
        }),
      });
      return;
    }
    write({ jsonrpc: '2.0', id, protocolVersion: '1.0', result: handshakeResult() });
    return;
  }

  if (method === 'nuclear.test.ping') {
    write({ jsonrpc: '2.0', id, protocolVersion: '1.0', result: { pong: true, workerMetadata: METADATA } });
    return;
  }
  if (MODE === 'malformed') {
    process.stdout.write('this is not a json-rpc record\n');
    return;
  }
  if (method === 'nuclear.test.echo') {
    const result = { marker: params.marker ?? null, delayMs: params.delayMs ?? 0, workerMetadata: METADATA };
    const delayMs = typeof params.delayMs === 'number' ? params.delayMs : 0;
    setTimeout(() => write({ jsonrpc: '2.0', id, protocolVersion: '1.0', result }), delayMs);
    return;
  }
  write({
    jsonrpc: '2.0',
    id,
    protocolVersion: '1.0',
    error: {
      code: -32601,
      message: 'Method not found',
      data: { diagnostic: `Method '${method}' is not registered by this fake.`, requestedMethod: method },
    },
  });
}

if (MODE === 'crash-on-start' || process.env.FAKE_WORKER_CRASH_ON_START === '1') {
  process.exit(7);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (line.trim().length === 0) continue;
    try {
      respond(JSON.parse(line));
    } catch {
      write({
        jsonrpc: '2.0',
        id: null,
        protocolVersion: '1.0',
        error: { code: -32700, message: 'Parse error', data: { diagnostic: 'Record is not valid JSON.' } },
      });
    }
  }
});
process.stdin.on('end', () => process.exit(0));
