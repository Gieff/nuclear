# NuClear Scientific Worker — Protocol Fixtures

Versioned JSON-RPC 2.0 example records for the NuClear scientific worker,
derived from [ADR-002](../../../docs/decisions/ADR-002-scientific-worker-stdio-json-rpc.md).

These files establish the **wire envelope** only. They are not an
implementation and they assert no clinical operation exists.

## Status and authority

- ADR-002 is the transport authority: one complete JSON object per
  newline-delimited record, `protocolVersion` on every request and response,
  methods namespaced `nuclear.<operation>`, and structured serializable
  errors.
- `protocolVersion` for Phase 2 is `1.0`.
- The fixtures are **non-normative examples** until the worker envelope and
  handshake are implemented and ratified in slice P2.1. P2.1 may rename the
  handshake result fields or adjust the NuClear-specific error code; when it
  does, it must update this directory and `tests/fixtures/manifest.json`
  together.
- No fixture names or encodes a DICOM, geometry, or quantitation algorithm.
  Those belong to P2.2–P2.4.

## Files

| File | Role |
| --- | --- |
| `request.handshake.json` | Valid correlated request |
| `response.handshake.json` | Correlated success carrying `workerMetadata` provenance |
| `error.unknown-method.json` | JSON-RPC `-32601` Method not found |
| `error.protocol-mismatch.json` | Reserved NuClear server-error code `-32001` |
| `error.invalid-params.json` | JSON-RPC `-32602` Invalid params |
| `error.parse.json` | JSON-RPC `-32700` Parse error (`id: null`) |
| `malformed.request.txt` | Raw malformed record that must fail closed |

## Error code conventions

Standard JSON-RPC 2.0 codes are used where they apply: `-32700` parse error,
`-32600` invalid request, `-32601` method not found, `-32602` invalid params,
`-32603` internal error. NuClear-specific failures use the reserved server
range `-32000`..`-32099`; `-32001` (protocol version mismatch) is the only
example reserved so far and is subject to P2.1 ratification.

Every failure carries a structured `data.diagnostic`. Missing tags,
unsupported representations, incompatible geometry, and invalid quantitation
must produce an explicit error or explicit result; no plausible fallback is
emitted.
