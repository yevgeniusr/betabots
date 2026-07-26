# BetaBots Study Contracts v1

This directory contains versioned, public JSON artifact contracts. They describe research work without importing or exposing browser-runner internals.

| Contract | Canonical identifier |
| --- | --- |
| Study manifest | `betabots.study-manifest.v1` |
| Evidence reference | `betabots.evidence-ref.v1` |
| Decision outcome | `betabots.decision-outcome.v1` |
| Finding | `betabots.finding.v1` |
| Sanitized export | `betabots.sanitized-export.v1` |

Validate one or more JSON files with no extra dependencies:

```bash
npm run validate:contracts -- contracts/fixtures/*.json
npm run validate:contracts:json -- contracts/fixtures/*.json
```

Errors are JSON objects with stable `code`, JSON Pointer `path`, and `message`. Allocation percentages use a tolerance of `0.01` percentage points. Decision allocations are explicitly hypothetical, never real spend.

The schema files specify closed portable structures: all object fields are explicit, unknown fields are rejected, and runtime validation is at least as strict. `EvidenceRef` ids are stable batch identifiers. A `DecisionOutcome` sleeve or a `Finding` may name those ids, but only multi-file validation resolves them. A single artifact can be structurally valid while returning `requiresBatchValidation`; it has not established referential integrity.

`SanitizedExport` structural validation only establishes that an allowlist is shaped safely. Its `verification` object is a declaration, not proof that files were inspected. To verify real files, use the filesystem mode:

```bash
node scripts/validate-study-artifacts.cjs --verify-export-files export/sanitized-export.json
node scripts/validate-study-artifacts.cjs --verify-export-files --export-root export-root export/sanitized-export.json
```

Filesystem mode defaults the safe root to the sanitized-export manifest's directory when `--export-root` is omitted. Every allowlisted path must be normalized relative POSIX form and is resolved below that root; the verifier requires an existing regular file, rejects symlinks at the leaf or below the root, checks containment, and compares the required SHA-256 digest and byte size. It never treats manifest metadata alone as filesystem verification.
