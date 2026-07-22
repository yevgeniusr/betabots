# Usage Guide

This guide summarizes the normal Betabots workflow. The README contains the full command reference.

## 1. Install Locally

```bash
git clone https://github.com/yevgeniusr/betabots.git
cd betabots
node scripts/install-deps.cjs --all
node scripts/install-browsers.cjs
tests/smoke.sh
scripts/install-local.sh all
```

Restart the agent runtime or open a new thread after installing.

## 2. Run Browser Betabots

Use Betabots when you need browser-level feedback about comprehension, trust, emotion, copy, onboarding, layout, and whether a product feels worth returning to.

Truth pressure is always on because the key question is not “can an AI say something plausible?” but “would this kind of person honestly spend scarce attention, trust, money, or social capital here?”

The usual order is:

1. Provide audience guidance or a reviewed cohort/persona file.
2. Run browser Betabots against local or staging.
3. Read raw stories, screenshots, and evidence timelines.
4. Patch repeated high-severity issues.
5. Rerun with a fresh cohort.

## 3. Run Browser Sessions

```bash
BETABOT_AVATAR_STYLE=bottts-neutral \
BETABOT_APP_URL=http://localhost:5173 \
BETABOT_THOUGHTFUL_COUNT=5 \
BETABOT_PERSONA_GUIDANCE='Represent the main audience, a skeptical alternative user, and accessibility constraints.' \
BETABOT_THOUGHTFUL_MINUTES=8 \
BETABOT_HEADLESS=false \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Browser sessions use the pinned Playwright runtime installed by the Betabots dependency installer or local installer. Betabots interact through the visible product surface; they do not call product APIs or use hidden implementation maps.

`node scripts/install-browsers.cjs` installs Chrome for Testing, Chrome Headless Shell, and FFmpeg for Chromium support. It does not install Firefox or WebKit. If Chromium cannot be installed on a machine, set `BETABOT_BROWSER_EXECUTABLE_PATH` to an existing Chrome or Chromium executable.

On minimal Linux images, run `node scripts/install-browsers.cjs --with-deps` when Playwright reports missing system libraries. That path may invoke the platform package manager.

With no cohort or persona file, the default startup flow is visible product
analysis -> deep persona generation -> browser sessions. It writes
`product-analysis.json`, `product-analysis.png`, and `generated-personas.json` in
the run directory before proceeding. Source priority is:

1. `BETABOT_COHORT_FILE`
2. `BETABOT_PERSONAS_FILE`
3. reviewed `generated-personas.json` with `BETABOT_PERSONAS_APPROVED=true`
4. new generation

For review before execution:

```bash
BETABOT_PERSONA_APPROVAL_MODE=required \
BETABOT_RUN_DIR=.betabots/runs/reviewed-cohort \
BETABOT_APP_URL=http://localhost:5173 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs

BETABOT_PERSONA_APPROVAL_MODE=required \
BETABOT_PERSONAS_APPROVED=true \
BETABOT_RUN_DIR=.betabots/runs/reviewed-cohort \
BETABOT_APP_URL=http://localhost:5173 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

`auto` is the default approval mode. Supplied cohort and persona files are
already approved and do not perform the generation preflight.

For return-session research, add:

```bash
BETABOT_SESSION_COUNT=3 \
BETABOT_SESSION_GAP_MINUTES=60 \
BETABOT_STORAGE_STATE_TEMPLATE='/tmp/product-auth/{id}.json' \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

The initial state must come from visible UI login. Every visit writes the state
back for the next cohort round. Use `BETABOT_MIN_AI_USER_TURNS` and
`BETABOT_MIN_COMPLETED_ACTIVITIES` when a happy result must prove those actions.

Betabots assign each persona a DiceBear avatar. The default style is `bottts-neutral`; set `BETABOT_AVATAR_STYLE` to another DiceBear style slug or style URL to change the visual system.

## 4. Tune Truth Pressure

```bash
BETABOT_TRUTH_YEARS=100 \
BETABOT_TRUTH_ACTION_MONTHS=1 \
BETABOT_TRUTH_DOLLAR_YEARS=1 \
BETABOT_COHORT_FILE=skills/betabots/examples/generic-saas.cohort.json \
BETABOT_APP_URL=http://localhost:5173 \
BETABOT_THOUGHTFUL_COUNT=5 \
BETABOT_THOUGHTFUL_MINUTES=8 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Truth pressure gives each bot a life goal and asks it to judge the product against that life, not against the builder's feelings. Raw logs should include `Truth assessment:` and `Life-cost decision:` entries.

## 5. Review Artifacts

Look for:

- `raw/<bot-id>.md`: first-person journey logs.
- `product-analysis.json` and `product-analysis.png`: visible evidence and LLM analysis used for generated personas.
- `generated-personas.json`: deep personas, user guidance, provenance, and approval state.
- `analysis.md`: synthesized issues and patterns.
- `summary.json`: machine-readable metrics.
- `betabook.json`: social-board activity when Betabook is enabled.
- `destiny.json`: orchestration events when Destiny is enabled.

For truth-pressure runs, also inspect:

- `truthPressure.truthAssessments` in `summary.json`;
- per-bot life goals, years remaining, and truth assessments;
- whether negative reactions are specific and role-grounded rather than generic criticism;
- whether positive reactions include evidence and uncertainty instead of flattery.

Do not rely only on aggregate scores. Read representative unhappy and confused bot stories before deciding what to change.

Every successful browser decision in `summary.json` has a `decisionId` and
`origin: "persona-llm"`. Missing or invalid LLM actions fail instead of becoming
implicit waits. Persona-authored Betabook writes carry the same origin rule, and
Destiny nudges appear only as advisory context in a later persona decision.

Product-quality scores require a verified real-environment attestation. Runs
without one remain useful only as layout smoke tests and are scored at zero.
Required AI turns need a visible response transition on the same chat; required
activity completions need a new completion transition after a named activity
control. Echoes, stale completion text, and unrelated iframe clicks do not count.

## 6. Validate the Repo

```bash
tests/smoke.sh
```

For release checks, run the clean-install verifier from a prepared machine that already has Chromium for the pinned Playwright revision:

```bash
node scripts/verify-clean-install.cjs --skip-browser-install
```

With `--skip-browser-install`, the verifier reuses the caller's Playwright browser cache, or the cache named by `PLAYWRIGHT_BROWSERS_PATH`, while keeping the temporary repository and dependency tree isolated. Omit the flag to let the verifier run the Chromium install command.
