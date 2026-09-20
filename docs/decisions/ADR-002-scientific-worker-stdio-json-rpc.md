# ADR-002: Versioned Scientific Worker over Stdio JSON-RPC

## Status

Accepted

## Context

Phase 2 introduces a local Python worker for DICOM inspection, geometry
verification and PET quantitation. The TypeScript application must not
reimplement worker-owned scientific procedures. The bridge needs a transport
that is local, observable, restartable and independent of UI or renderer.

## Decision

NuClear uses a supervised local Python process communicating through stdio
with JSON-RPC 2.0 messages, one complete JSON object per newline-delimited
record.

- Each request and response carries a `protocolVersion`; Phase 2 starts at
  `1.0`.
- Methods are namespaced as `nuclear.<operation>`.
- Every successful scientific result includes worker provenance: worker
  version, operation, timestamp and effective parameters.
- Failures use JSON-RPC errors plus structured, serializable diagnostics. A
  missing tag, unsupported representation, incompatible geometry or invalid
  quantitation is an explicit result; no plausible fallback is emitted.
- The bridge owns process lifecycle, request correlation, timeouts and
  version compatibility. The worker owns DICOM interpretation and scientific
  computation.

## Consequences

- TypeScript may validate envelopes and map results to NuClear contracts, but
  never duplicates SUVbw or DICOM geometry algorithms.
- The protocol is testable headlessly using fixture requests and deterministic
  JSON responses before any Cornerstone or UI work.
- DICOMweb, network workers, renderer integration, resampling and registration
  are not Phase 2 deliverables unless a later approved slice expands scope.

