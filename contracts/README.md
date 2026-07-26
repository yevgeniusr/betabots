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

The schema files document portable structural shapes; the CommonJS validator adds required cross-field semantics and sanitization checks.
