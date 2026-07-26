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

Errors are JSON objects with stable `code`, JSON Pointer `path`, and `message`. Dollar inputs use at most two decimal places and are compared as safe integer cents; allocation percentages independently use a tolerance of `0.01` percentage points. Negative zero (`-0`) is rejected for every allocation dollar and percentage input so serialized money values have one unambiguous zero representation. Decision allocations are explicitly hypothetical, never real spend.

The schema files specify closed portable structures: all object fields are explicit, unknown fields are rejected, and runtime validation is at least as strict. Every `EvidenceRef` carries a `studyId` and may carry an `armId`; a `DecisionOutcome` and `Finding` carry `studyId` too. In batch validation, an evidence `studyId` resolves exactly one manifest; an arm-scoped evidence context persona must be declared by that arm, while a study-scoped context persona must resolve to exactly one arm (manifest semantics prohibit persona reuse across arms). A manifest's `evidenceRequirements` are structured objects with `classification`, `artifactType`, `minimumCount`, and optional `armId`. Only multi-file validation resolves study/arm links, evidence references, and requirement counts. In particular, recommendation evidence cannot satisfy an observed screenshot requirement. A single artifact can be structurally valid while returning `requiresBatchValidation`; it has not established referential integrity or requirement satisfaction.

`SanitizedExport` structural validation only establishes that an allowlist is shaped safely. Its `verification` object is a declaration, not proof that files were inspected. To verify real files, use the filesystem mode:

```bash
node scripts/validate-study-artifacts.cjs --verify-export-files export/sanitized-export.json
node scripts/validate-study-artifacts.cjs --verify-export-files --export-root export-root export/sanitized-export.json
```

Filesystem mode defaults the safe root to the sanitized-export manifest's directory when `--export-root` is omitted. Every allowlisted path must be normalized relative POSIX form and is resolved below that root; the verifier requires an existing regular file, rejects symlinks at the leaf or below the root, opens each file once with no-follow semantics, `fstat`s and reads only from that descriptor, and proves that the canonical path of that opened descriptor is within the canonical root before reading it. It retains before/after pathname and ancestor identity snapshots as defense in depth, then compares the required SHA-256 digest and byte size. Generic errors identify only the caller-supplied allowlist path, never a resolved filesystem path.

Descriptor containment is supported on Linux with `/proc/self/fd/<fd>` and on macOS with `/usr/sbin/lsof` machine-readable NUL-delimited PID/FD output. Both platforms also require `O_NOFOLLOW`. Other platforms, a missing resolver capability, and malformed resolver output fail closed with stable descriptor-resolver errors rather than weakening verification. The guarantee covers the object read during the call; after the function returns, another actor can still replace or mutate paths, so callers that need a later guarantee must protect or re-verify them. It never treats manifest metadata alone as filesystem verification.
