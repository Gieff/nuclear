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
- These fixtures are **ratified normative evidence** against the implemented
  P2.1 worker envelope, handshake and error schema. Every error response has a
  correlated request fixture; `error.parse.json` remains the exception because
  a parse error cannot correlate an `id` and is paired with
  `malformed.request.txt` instead.
- No fixture names or encodes a DICOM, geometry, or quantitation algorithm.
  Those belong to P2.2–P2.4.

## Files

| File | Role |
| --- | --- |
| `request.handshake.json` | Valid correlated handshake request |
| `response.handshake.json` | Correlated success carrying `workerMetadata` provenance |
| `request.unknown-method.json` | Request paired to the `-32601` error (`req-0002`) |
| `error.unknown-method.json` | JSON-RPC `-32601` Method not found |
| `request.protocol-mismatch.json` | Request paired to the `-32001` error (`req-0003`) |
| `error.protocol-mismatch.json` | Reserved NuClear server-error code `-32001` |
| `request.invalid-params.json` | Request paired to the `-32602` error (`req-0004`) |
| `error.invalid-params.json` | JSON-RPC `-32602` Invalid params |
| `error.parse.json` | JSON-RPC `-32700` Parse error (`id: null`) |
| `malformed.request.txt` | Raw malformed record that must fail closed |

The JSON fixtures are stored pretty-printed for review. The newline-delimited
stdio worker expects one JSON object per line, so compact a fixture before
piping it (for example `jq -c . request.handshake.json`).

## Error code conventions

Standard JSON-RPC 2.0 codes are used where they apply: `-32700` parse error,
`-32600` invalid request, `-32601` method not found, `-32602` invalid params,
`-32603` internal error. NuClear-specific failures use the reserved server
range `-32000`..`-32099`; `-32001` (protocol version mismatch) was ratified by
P2.1 and `-32010` (`SOURCE_UNAVAILABLE`, an unresolvable or unreadable source)
by P2.2. No protocol fixture above encodes a DICOM result; the P2.2
classification fixtures are generated under `tests/fixtures/dicom/`.

Every failure carries a structured `data.diagnostic`. Missing tags,
unsupported representations, incompatible geometry, and invalid quantitation
must produce an explicit error or explicit result; no plausible fallback is
emitted.
