# LLM-Grounded Personas Implementation Plan

> **For Codex:** Execute task-by-task with test-driven development. Run the narrow test after each change and the complete suite before claiming completion.

**Goal:** Generate meaningful product-grounded personas by default and guarantee that every meaningful action originates from a validated persona-LLM decision.

**Architecture:** Add a pure persona-generation/configuration module beside the runner, then integrate a visible-browser preflight into runner startup. Tighten the thinking-body decision contract and convert Destiny from an executor into reflection context. Keep deterministic code limited to perception, validation, safety, execution, timing, and evidence.

**Tech Stack:** CommonJS Node.js, Node test runner, Playwright, existing Codex/OpenRouter mind adapters, shell smoke tests.

---

### Task 1: Enforce strict mind decisions and provenance

**Files:**
- Modify: `skills/betabots/scripts/thinking_body.cjs`
- Modify: `skills/betabots/scripts/thoughtful_browser_betabots.cjs`
- Modify: `tests/thinking_body.test.cjs`
- Modify: `tests/runner_integration.test.cjs`

1. Add failing tests proving missing, malformed, and unknown actions are rejected rather than normalized to `wait`.
2. Add a failing integration assertion that executed actions include a decision ID and `origin: "persona-llm"`.
3. Run the narrow tests and confirm the new failures.
4. Implement strict normalization and attach provenance only after a successful LLM response.
5. Record the decision ID with action evidence and summary integrity counts.
6. Run the narrow tests until green and commit.

### Task 2: Make Destiny context-only

**Files:**
- Modify: `skills/betabots/scripts/destiny_actions.cjs`
- Modify: `skills/betabots/scripts/thoughtful_browser_betabots.cjs`
- Modify: `tests/destiny_actions.test.cjs`
- Modify: `tests/runner_integration.test.cjs`

1. Add a failing test showing a queued Destiny nudge is placed in the next reflection payload and cannot directly execute a control.
2. Remove the Destiny control-matching/execution path.
3. Keep queue and status behavior, then consume nudges as bounded persona context.
4. Record whether the LLM followed or rejected the guidance through the normal decision record.
5. Run the narrow tests until green and commit.

### Task 3: Remove deterministic persona speech fallbacks

**Files:**
- Modify: `skills/betabots/scripts/thoughtful_browser_betabots.cjs`
- Modify: `tests/runner_integration.test.cjs`

1. Add failing tests for a failed or fallback short-text LLM response.
2. Assert that no hard-coded post, reply, or comment text is published.
3. Change short-text generation to return a typed failure and make callers record and skip the social action.
4. Run the integration tests until green and commit.

### Task 4: Add persona configuration and deep schema

**Files:**
- Create: `skills/betabots/scripts/persona_generation.cjs`
- Create: `tests/persona_generation.test.cjs`
- Modify: `skills/betabots/scripts/thoughtful_browser_betabots.cjs`

1. Add failing unit tests for source precedence, `auto` default, `required` approval, guidance text/file loading, supplied-persona loading, and resume behavior.
2. Add failing tests for deep generated persona validation and legacy supplied persona normalization.
3. Implement environment parsing without reading unrelated environment files.
4. Implement persona schema normalization with explicit `observed`, `guided`, `supplied`, and `assumed` provenance.
5. Include the complete normalized persona in reflection payloads.
6. Run the unit and integration tests until green and commit.

### Task 5: Integrate visible product analysis and generation

**Files:**
- Modify: `skills/betabots/scripts/persona_generation.cjs`
- Modify: `skills/betabots/scripts/thoughtful_browser_betabots.cjs`
- Modify: `tests/runner_integration.test.cjs`
- Modify: `tests/fixtures/fake_codex_mind.cjs`

1. Add fake-mind responses for `product_analysis` and `persona_generation` tasks.
2. Add a failing integration test that starts without a cohort, captures visible product evidence, and writes `product-analysis.json`, `generated-personas.json`, and the resolved cohort.
3. Assert generated personas incorporate user guidance, meet the requested count, and proceed automatically by default.
4. Add a failing `required`-mode test that stops before bot execution, plus an approved-resume test that reuses the same artifact.
5. Implement the browser preflight and structured LLM calls using the existing provider machinery.
6. Preserve the supplied-cohort cohort-only path without a Playwright dependency.
7. Run the integration tests until green and commit.

### Task 6: Document configuration and compatibility

**Files:**
- Modify: `README.md`
- Modify: `docs/usage.md`
- Modify: `skills/betabots/SKILL.md`
- Modify: `.env.example` if present
- Modify: `skills/betabots/scripts/generate_cohort.py`
- Modify: `tests/smoke.sh`

1. Add smoke assertions for the new environment variables and artifacts.
2. Document source precedence, approval/resume behavior, deep schema, and action provenance.
3. Update the standalone cohort generator to emit compatible deep supplied personas or clearly delegate to runtime generation.
4. Run smoke tests and commit.

### Task 7: Verify with Besimple and finish

**Files:**
- Inspect only: `/Users/mac/Desktop/projects/personal/besimple`
- Generated run artifacts: `.betabots/runs/<run-id>/`

1. Read Besimple repository instructions and identify a safe local or deployed target without changing its dirty worktree.
2. Run the full Betabots unit, integration, and smoke suites.
3. Start or verify Besimple, then run a small generated cohort with explicit audience guidance and default `auto` approval.
4. Inspect generated product analysis, persona differentiation, raw reactions, action decision IDs, and summary provenance.
5. Run a final git diff/status review and the verification checklist.
6. Commit all implementation and documentation, push the feature branch, and deploy only if the repository has an established deployment path and the user has authorized it.
