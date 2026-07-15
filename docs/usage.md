# Usage Guide

This guide summarizes the normal Betabots workflow. The README contains the full command reference.

## 1. Install Locally

```bash
git clone https://github.com/yevgeniusr/betabots.git
cd betabots
scripts/install-local.sh all
```

Restart the agent runtime or open a new thread after installing.

## 2. Run Browser Betabots

Use Betabots when you need browser-level feedback about comprehension, trust, emotion, copy, onboarding, layout, and whether a product feels worth returning to.

Truth pressure is always on because the key question is not “can an AI say something plausible?” but “would this kind of person honestly spend scarce attention, trust, money, or social capital here?”

The usual order is:

1. Build or choose a research-backed cohort.
2. Run browser Betabots against local or staging.
3. Read raw stories, screenshots, and evidence timelines.
4. Patch repeated high-severity issues.
5. Rerun with a fresh cohort.

## 3. Run Browser Sessions

```bash
BETABOT_COHORT_FILE=skills/betabots/examples/generic-saas.cohort.json \
BETABOT_AVATAR_STYLE=bottts-neutral \
BETABOT_APP_URL=http://localhost:5173 \
BETABOT_THOUGHTFUL_COUNT=5 \
BETABOT_THOUGHTFUL_MINUTES=8 \
BETABOT_HEADLESS=false \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Browser sessions require Playwright in the target project or globally. Betabots interact through the visible product surface; they do not call product APIs or use hidden implementation maps.

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

Product-quality scores require a verified real-environment attestation. Runs
without one remain useful only as layout smoke tests and are scored at zero.
Required AI turns need a visible response transition on the same chat; required
activity completions need a new completion transition after a named activity
control. Echoes, stale completion text, and unrelated iframe clicks do not count.

## 6. Validate the Repo

```bash
tests/smoke.sh
```
