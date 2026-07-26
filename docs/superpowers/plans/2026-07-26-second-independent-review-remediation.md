# Second Independent Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five independent-review blockers in the public study-contract boundary.

**Architecture:** Keep portable JSON schemas and the dependency-free runtime validator aligned. Add batch-only evidence resolution, descriptor-bound export verification, normalized sensitive-name classification, and integer-cent allocation comparison.

**Tech Stack:** Node.js CommonJS, `node:test`, JSON Schema draft 2020-12.

## Global Constraints

- Work only in the active feature worktree; no remote operations or external state access.
- Add an adversarial test and capture RED before each production behavior change.
- Preserve natural Node test exit and close every filesystem descriptor.
- Commit the verified local result.

---

### Task 1: Sensitive export classification

**Files:** `tests/study_contracts.test.cjs`, `skills/betabots/scripts/study_contracts.cjs`

- [ ] Add underscore, hyphen, case, camel-ish, metadata, and ordinary-prose regressions; run the focused test and observe rejection is absent.
- [ ] Normalize identifier-like fields into tokens and recursively inspect metadata keys/classes without treating ordinary claim prose as a secret.
- [ ] Re-run focused test and contract suite.

### Task 2: Descriptor-bound export verification

**Files:** `tests/study_contracts.test.cjs`, `skills/betabots/scripts/study_contracts.cjs`, `contracts/README.md`

- [ ] Add leaf symlink, ancestor symlink, and injected post-open leaf/ancestor replacement tests; run focused test and observe current verifier misses the race.
- [ ] Open once with no-follow, fstat/read through that descriptor, snapshot/revalidate ancestors and post-path identity/containment, and close in `finally`.
- [ ] Re-run focused test and document the unavoidable post-return mutation boundary.

### Task 3: Batch evidence requirements

**Files:** `contracts/*.schema.json`, `contracts/fixtures/*.json`, `tests/study_contracts.test.cjs`, `skills/betabots/scripts/study_contracts.cjs`, `contracts/README.md`

- [ ] Add valid/invalid multi-artifact batches for structured requirements, unknown study/arm, duplicate manifest IDs, and recommendation-only screenshot evidence; run focused tests and observe RED.
- [ ] Require EvidenceRef study/arm links; validate structured requirements and resolve correct observed artifact class/context in batch mode.
- [ ] Re-run focused and full contract tests; update closed schemas, fixtures, and documentation together.

### Task 4: Finding polarity integrity

**Files:** `contracts/finding.v1.schema.json`, `tests/study_contracts.test.cjs`, `skills/betabots/scripts/study_contracts.cjs`

- [ ] Add duplicate and cross-list overlap tests; run focused test and observe RED.
- [ ] Enforce unique and disjoint support/contradiction sets and correct study/arm EvidenceRef resolution in batches.
- [ ] Re-run focused and full contract tests.

### Task 5: Exact dollar arithmetic

**Files:** `tests/study_contracts.test.cjs`, `skills/betabots/scripts/study_contracts.cjs`

- [ ] Add decimal-safe, excess-precision, and unsafe-range tests; run focused test and observe RED.
- [ ] Guard dollar values and convert them to safe integer cents before totals are compared; retain finite tolerant percentage validation.
- [ ] Re-run focused and full contract tests.

### Task 6: Release verification

**Files:** all modified files

- [ ] Run `npm run test:contracts`, `node --test tests/*.test.cjs`, `npm run smoke`, real batch/negative probes, `git diff --check`, force-exit scan, and status check.
- [ ] Commit the complete local remediation only after all commands exit successfully.
