# Cryptonary Safe Cohorts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely seed one user-approved Playwright authentication state into isolated bot states and enforce a fail-closed, reusable no-community-write policy.

**Architecture:** Add two generic modules: storage-state seeding/validation in the scheduler and action/request policy evaluation in a new policy module. The browser runner resolves the cohort policy and installs UI and network guards before navigation. Cryptonary-specific paths, labels, and personas stay in a demo cohort file.

**Tech Stack:** Node.js CommonJS, Playwright, node:test.

## Global Constraints

- Never inspect, log, serialize, or commit real authentication values.
- Storage destinations are unique per bot and written atomically with mode `0600`.
- Policy enforcement occurs before target actions and all retry/recovery paths.
- Blocked network mutations are redacted in artifacts.
- No production access, deployment, or push.

---

### Task 1: Auth-state seeding

**Files:**
- Modify: `skills/betabots/scripts/session_scheduler.cjs`
- Test: `tests/session_scheduler.test.cjs`

- [ ] Add tests for valid object-shaped state copying, restrictive mode, rejected malformed/array/missing seeds, no state-content leakage, and duplicate destination refusal.
- [ ] Run `node --test tests/session_scheduler.test.cjs` and confirm the new tests fail because the seeding API is absent.
- [ ] Add `validateStorageStateSeed`, `prepareSeededStorageStates`, and safe path resolution; copy via a temporary sibling file, chmod `0600`, and rename. Reject seed destinations and non-unique paths.
- [ ] Re-run `node --test tests/session_scheduler.test.cjs` and confirm pass.

### Task 2: Generic interaction and request policy

**Files:**
- Create: `skills/betabots/scripts/interaction_policy.cjs`
- Test: `tests/interaction_policy.test.cjs`
- Modify: `skills/betabots/scripts/thinking_body.cjs`
- Test: `tests/thinking_body.test.cjs`, `tests/thinking_body_browser.test.cjs`

- [ ] Write failing unit tests for matching action/control/value/URL deny rules, safe read-only actions, semantic retries, and recovered ARIA options.
- [ ] Write failing request-classification tests for community POST/reply-like mutation blocks, community GET allowance, and non-community mutation allowance; assert redacted event output contains no body data.
- [ ] Run those focused tests and confirm missing module/guard failures.
- [ ] Implement normalized policy matching and a policy-event collector that exposes only method, redacted URL path/category, and rule ID.
- [ ] Add an optional `interactionPolicy` to `executeMindAction`; evaluate it after normal validation and immediately before original, semantic retry, and recovered-option actions.
- [ ] Re-run focused action and policy tests and confirm pass.

### Task 3: Runner wiring and artifacts

**Files:**
- Modify: `skills/betabots/scripts/thoughtful_browser_betabots.cjs`
- Test: `tests/interaction_policy.test.cjs`

- [ ] Add failing runner-oriented tests/fixtures for cohort/env policy resolution and policy-block artifact serialization without sensitive values.
- [ ] Add `BETABOT_STORAGE_STATE_SEED` and an optional JSON policy env input, resolve per-bot destinations before persona preparation/integrity/browser work, and seed them once.
- [ ] Require unique state paths whenever seed storage or multi-session writeback is used; do not allow a seed to be overwritten.
- [ ] Create policy state per session, install `context.route('**/*', ...)` before `newPage()`/navigation, abort prohibited mutation requests, and record redacted policy-block events.
- [ ] Pass policy guard to all mind action paths; include counters/events in session, summary, cohort snapshot, raw storyline, and analysis without cookies/headers/bodies.
- [ ] Re-run focused tests and confirm pass.

### Task 4: Cryptonary cohort and optional export helper

**Files:**
- Create: `demo-cohorts/cryptonary-authenticated-platform.json`
- Create: `skills/betabots/scripts/export_storage_state_from_cdp.cjs`
- Test: `tests/cryptonary_cohort.test.cjs`, `tests/export_storage_state_from_cdp.test.cjs`

- [ ] Write failing tests asserting exactly ten researched/assumption-labeled roles and the no-community-write policy, plus helper argument/loopback validation.
- [ ] Add the cohort with `requiresSocialAction: false`, explicit forbidden community writes, paths/controls/value patterns, and read-only journey objectives.
- [ ] Add an explicit-argument helper that rejects non-loopback CDP URLs, confirms the target page exists, exports storage state atomically as `0600`, and never prints storage values.
- [ ] Run the new tests and confirm pass.

### Task 5: Documentation, smoke coverage, and commit

**Files:**
- Modify: `README.md`, `docs/usage.md`, `skills/betabots/SKILL.md`, `skills/betabots/references/cohort-config.md`, `skills/betabots/references/safety.md`, `tests/smoke.sh`

- [ ] Document approved-state seed usage, unique destination requirement, policy schema, no-community-write configuration, and safe CDP export invocation without credential examples.
- [ ] Add new syntax/test/cohort checks to smoke.
- [ ] Run focused node tests, `npm run smoke`, and inspect `git diff --check` plus the staged diff.
- [ ] Commit only these changes with `feat: add safe authenticated cohort guards`.
