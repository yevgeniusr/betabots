# BetaBots Public Dashboard Human-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only public run dashboard into an accessible, human-first report while retaining every legacy evidence surface.

**Architecture:** The existing Node server remains the sole reader of public run artifacts and continues to apply path containment. The static client is reorganized into four semantic, keyboard-operable views; source-derived analysis and bot/evidence summaries lead the report, while raw artifacts are grouped under Technical details.

**Tech Stack:** Node.js HTTP server, vanilla HTML/CSS/JS, Node test runner, Playwright.

## Global Constraints

- Use only `/Users/mac/.hermes/evidence/cryptonary-v2-public-20260726-195637/study-output` for local run verification; never modify it.
- Exclude dot-prefixed directories from the public run selector.
- Preserve read-only behavior and containment/escaping protections.
- Primary IA is Overview, Bot stories, Evidence, and Technical details.
- Use the approved decorative journey art with empty alt text; do not present it as evidence.
- Cover 390x844, 900x900, 1024x900, and 1440x1000 without horizontal overflow.

---

### Task 1: Prove run discovery and report IA requirements

**Files:**
- Create: `tests/public_dashboard.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `GET /api/runs`, the static dashboard HTML and client JavaScript.
- Produces: `npm run test:dashboard`, a Node test suite that launches the server against the public fixture.

- [ ] **Step 1: Write failing tests** for a run list that omits `.runtime-home`, `.tmp`, and `.execution-snapshot` while retaining all visible study arms; assert the exact four primary concepts, technical content availability, tab roles, and non-default technical view.
- [ ] **Step 2: Run RED**

Run: `node --test tests/public_dashboard.test.cjs`

Expected: failure because the base server lists dot directories and the base shell still exposes the eight-console-tab IA.

- [ ] **Step 3: Add the narrow test scripts**

```json
"test": "node --test tests/*.test.cjs",
"test:dashboard": "node --test tests/public_dashboard.test.cjs"
```

- [ ] **Step 4: Implement only the server and shell behavior required by the assertions.**
- [ ] **Step 5: Run GREEN**

Run: `npm run test:dashboard`

Expected: all focused tests pass.

### Task 2: Build the editorial report and retained evidence surfaces

**Files:**
- Modify: `web/static/index.html`
- Modify: `web/static/app.js`
- Modify: `web/static/styles.css`
- Create: `web/static/betabots-journey.webp`

**Interfaces:**
- Consumes: run JSON fields already supplied by `GET /api/runs/:runId`.
- Produces: `switchTab(tab)` for the four primary views and inline bot-story detail cards.

- [ ] **Step 1: Run Task 1 RED before changing dashboard source.**
- [ ] **Step 2: Copy the approved decorative asset into `web/static/betabots-journey.webp`.**
- [ ] **Step 3: Implement Overview** with selected run, app, readable analysis notes, source-derived counts, and direct buttons for Bot stories/Evidence.
- [ ] **Step 4: Implement Bot stories and Evidence** with bot cards/inline details, timelines, screenshots, truth assessments, and explicit empty states.
- [ ] **Step 5: Implement Technical details** retaining Betabook, Destiny, artifacts, root path, launch command, LLM/fallback/debug information.
- [ ] **Step 6: Implement responsive CSS and keyboard tab behavior** (Arrow/Home/End keys, focus state, 44px primary targets, reduced-motion handling).
- [ ] **Step 7: Run GREEN**

Run: `npm run test:dashboard`

Expected: all focused tests pass.

### Task 3: Verify the real public fixture

**Files:**
- Create outside Git: `/Users/mac/.hermes/tasks/betabots-dashboard-redesign/candidate/`

**Interfaces:**
- Consumes: a fresh server launched with `--runs /Users/mac/.hermes/evidence/cryptonary-v2-public-20260726-195637/study-output`.
- Produces: QA log and full-page desktop, intermediate, mobile, Overview, Bot stories, Evidence, and Technical details screenshots.

- [ ] **Step 1: Run browser test and capture console/page errors and overflow at the four required widths.**
- [ ] **Step 2: Capture full-page screenshots into the required non-Git directory.**
- [ ] **Step 3: Run all gates:** `npm test`, contract-script discovery, both Node syntax checks, and `git diff --check`.
- [ ] **Step 4: Review the resulting diff and commit the verified candidate locally.**
