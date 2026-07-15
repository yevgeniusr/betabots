# Browser Betabots

Browser Betabots is the real-browser mode for simulated users.

## Purpose

Use Betabots when you need to know how simulated people experience the product surface. It answers:

- Does the UI explain itself?
- Does the product feel trustworthy?
- Does onboarding match a real person's mental model?
- Which copy, empty states, buttons, routes, or waits create anxiety or momentum?
- Would a user come back for a human reason?
- Would this specific kind of person honestly care, trust, spend, subscribe, contact, or leave?

## Rules

- Launch actual browser contexts.
- Repeat a screenshot -> LLM decision -> validated browser action loop for every bot.
- Give the LLM the current screenshot and an inventory of visible controls with stable IDs.
- Execute only the one structured action the LLM chose from that inventory.
- Move at human speed with real pauses.
- Feed the LLM mind text from the current visible viewport, including the destination of in-page anchor navigation.
- Preserve bounded session memory of prior screens, reactions, and actions so later reflections remain continuous without replacing current-viewport evidence.
- Keep first-person thoughts in the raw log.
- Do not inspect source code, APIs, devtools, DB, or hidden implementation details during a bot session.
- Prefer visible UI affordances over direct route jumps.
- Save screenshots as supporting evidence, not as the primary artifact.
- End sessions for human reasons: boredom, confusion, trust failure, success, curiosity, anxiety, or enough value.
- Keep thinking attached to product use. A bot should form first impressions, reactions, comparisons, and ideas after seeing or doing something, not sit in a long reflection-only loop.

## Time

Default `BETABOT_TIME_SCALE=1` means real pacing. A 10-minute session should take about 10 minutes. Thoughtful mode is human-paced; the bundled runner clamps values below `1` back to `1`. Do not present accelerated dry-runs as product-quality research.

For minimum-duration studies, set both target and minimum session length:

```bash
BETABOT_THOUGHTFUL_MINUTES=60 \
BETABOT_THOUGHTFUL_MIN_SESSION_MINUTES=60 \
BETABOT_THOUGHTFUL_MAX_SESSION_MINUTES=75 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

## Return Sessions

Use cohort-wide rounds for genuine return visits. Every bot completes session 1,
the runner waits for the configured gap, and then the cohort returns for the next
session. Each visit gets a fresh browser context. The same per-bot storage-state
path is loaded and atomically written back after every visit, including cookies,
localStorage, and IndexedDB.

```bash
BETABOT_SESSION_COUNT=3 \
BETABOT_SESSION_GAP_MINUTES=60 \
BETABOT_STORAGE_STATE_TEMPLATE='/tmp/product-auth/{id}.json' \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Multi-session runs require a storage-state template that resolves to a unique
path for every bot. Create the initial files through visible UI login. The runner
writes one combined `raw/<bot-id>.md`, nested `sessionResults` in `summary.json`,
and session-specific screenshot folders. Persona memory and truth-pressure costs
continue across visits; repeated-screen state resets for each visit. The in-process
scheduler is intended for hour-scale studies. It is not a crash-resumable multi-day
job scheduler.

## LLM Minds

Thoughtful mode uses actual multimodal LLM calls for screenshot-grounded action decisions, thoughts, opinions, ideas, social messages, Betabook help/comment text, and Destiny planning. The LLM mind layer is mandatory; the bundled runner rejects `BETABOT_LLM_PROVIDER=none`.

Default provider:

```bash
BETABOT_LLM_PROVIDER=codex \
BETABOT_LLM_MODEL=gpt-5 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

If the Playwright package available to the runner does not match the browser
revision installed on the machine, point the runner at an existing Chromium or
Chrome executable instead of downloading another browser:

```bash
BETABOT_BROWSER_EXECUTABLE_PATH=/absolute/path/to/chrome \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

The override changes only the browser binary. The session still uses Playwright
and the same human-paced rules.

The `codex` provider calls local Codex CLI in non-interactive exec mode and uses the currently signed-in ChatGPT/Codex account. Override the executable with `BETABOT_CODEX_COMMAND` when `codex` is not on `PATH`.

OpenRouter provider:

```bash
BETABOT_LLM_PROVIDER=openrouter \
BETABOT_LLM_MODEL=openai/gpt-4.1-mini \
OPENROUTER_API_KEY=... \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Provider knobs:

- `BETABOT_LLM_PROVIDER=codex|openrouter`
- `BETABOT_LLM_MODEL`
- `BETABOT_CODEX_COMMAND`
- `BETABOT_LLM_TIMEOUT_MS`
- `BETABOT_LLM_MAX_CALLS`
- `OPENROUTER_API_KEY` or `BETABOT_OPENROUTER_API_KEY`
- `BETABOT_OPENROUTER_BASE_URL`

Always inspect `summary.json -> llm.failures`, `llm.fallbacks`, and each result's `mindActionFailures`. Unsupported local Codex model names make action decisions fail visibly; repeated failures stop that bot instead of allowing deterministic text to move the browser.

## Cohort Configuration

Thoughtful mode is app-agnostic when you pass a research-backed cohort file:

```bash
BETABOT_COHORT_FILE=skills/betabots/examples/generic-saas.cohort.json \
BETABOT_AUDIENCE_RESEARCH_FILE=.betabots/audience-research.json \
BETABOT_APP_URL=http://localhost:5173 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Request failures are scored as product defects only for the app URL's origin.
If the product uses additional first-party API origins, list them explicitly:

```bash
BETABOT_APP_ORIGINS='https://api.example.com,https://uploads.example.com' \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Failures from other origins remain in each session's
`externalRequestFailureDetails` but do not reduce the product score. Same-origin
request failures remain fail-closed. An aborted Next.js RSC or prefetch fetch is
excluded only when a later browser observation shows non-empty UI at that exact
destination.

Read `references/audience-research.md` before creating a product-quality cohort. Use `references/cohort-config.md` for the full schema. In short:

Screen-size seeding is part of random character generation. By default, thoughtful mode uses 50% mobile phones, 20% tablets, and 30% desktop/laptop PCs. Set `screenSizeDistribution` in the cohort file or pass `BETABOT_SCREEN_SIZE_DISTRIBUTION` as a JSON array to change the weighted buckets.

- `roles` define who the betabots are, what happened before they arrived, how they discovered the app, and what they want today.
- `routes` provide optional visible-label journey hints to the persona mind. They do not script or execute navigation.
- `keywords` define what counts as value, trust, risk, and empty-state evidence for that product.

Each bot also gets a DiceBear avatar. Set `BETABOT_AVATAR_STYLE` to a style slug such as `bottts-neutral` or a DiceBear style URL. The seed includes persona fields, so the image is stable for a bot and shifts when the persona changes.
- `ideaRules` turn observed product text into first-person product ideas.

The runner has generic defaults, but serious product testing must provide a cohort file and audience research for the target domain. Generic defaults are only for smoke tests.

## Required Product Evidence

Use evidence requirements when a high score must prove interaction depth, not
just exposure to the right screen:

```bash
BETABOT_MIN_AI_USER_TURNS=3 \
BETABOT_MIN_COMPLETED_ACTIVITIES=1 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

The environment variables are cohort-wide minimums. A cohort or individual role
can define higher requirements and product-specific visible patterns with
`evidenceRequirements`; see `cohort-config.md`. A role cannot lower the cohort
or environment floor. An AI user turn counts only after the bot fills a chat
input, uses a matching visible submit control, and a later observation on the
same chat shows both the exact submitted text and new response content after it.
An activity counts only after a named activity control is used and a configured
completion signal newly appears on that same activity URL. Echoed chat text,
unrelated iframe clicks, and stale completion screens do not count.

Unmet required evidence is not an infrastructure error, but it prevents a happy
result by capping that bot below `50`. Per-bot checks appear under
`result.evidenceRequirements`; aggregate counts appear under `productEvidence`.

## Auth Isolation

Injected local-storage auth is only for mock-backed UI smoke tests:

- `BETABOT_AUTH_LOCAL_STORAGE_KEY`: localStorage key to seed before app JavaScript runs.
- `BETABOT_AUTH_TOKEN_TEMPLATE`: token template with `{id}`, `{name}`, or `{role}` placeholders.

Example:

```bash
BETABOT_AUTH_LOCAL_STORAGE_KEY=myapp.e2eAuthToken \
BETABOT_AUTH_TOKEN_TEMPLATE='base-dev-token:{id}' \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Injected auth and missing attestation both cap the run at `0`. For a
product-quality cohort, authenticate through the visible product UI first, save a
Playwright storage-state file per bot, and configure:

```bash
BETABOT_REQUIRE_REAL_BACKEND=true \
BETABOT_ENVIRONMENT_ATTESTATION_URL=http://localhost:8080/health/integrity \
BETABOT_STORAGE_STATE_TEMPLATE='/tmp/product-auth/{id}.json' \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

The integrity endpoint must return JSON equivalent to:

```json
{
  "mode": "real",
  "auth": { "mode": "real" },
  "database": {
    "connected": true,
    "driver": "postgres",
    "persistent": true
  },
  "mocksDetected": false
}
```

The runner also watches for `x-betabots-mock`, `x-mock-response`, and
`x-mock-server`. Any detected mock or failed required attestation invalidates
the run and forces every score to `0`.

## Betabook

Betabook is a simple Reddit-like board scoped only to the current simulation. It is not the product under test. It gives betabots a shared social surface where they can introduce themselves, post needs, comment, coordinate, and receive invites.

Use Betabook when a cohort needs social context without forcing every social action through the product UI:

- introductions;
- help requests;
- comments and replies;
- invites;
- near-misses;
- product notes.

```bash
BETABOT_BETABOOK=true \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

The runner writes `betabook.json` with posts, comments, invites, participants, and events. Raw bot stories record when a bot reads or reacts to Betabook.

## Destiny

Destiny is separate from Betabook and from each bot's mind. It is the run-level force that people believe exists in real life: timing, coincidence, missed timing, lucky discovery, and being pulled toward one more action.

Destiny watches the cohort in real time and applies a master plan:

- make specific paths cross;
- intentionally keep some compatible people apart;
- create near-misses;
- manipulate Betabook by surfacing posts and invites;
- nudge individual bots with believable hunches or actions;

```bash
BETABOT_BETABOOK=true \
BETABOT_DESTINY=true \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

The runner writes `destiny.json` with the master plan, interventions, path-crossing states, nudges, and errors. Destiny never changes the address bar. A route intention can be followed only when its configured accessible label matches a currently visible control and the normal body safety validator accepts that control. When no matching control is visible, the nudge is recorded but not counted as followed. If Destiny repeatedly has to force crossings that should happen organically, treat that as product evidence: real users may also fail to find relevant people, content, inventory, or next steps.

## Strict Scoring

Thoughtful mode defaults to `BETABOT_STRICT_SCORING=true`. Strict scoring prevents shallow browser loops from looking like success:

- repeated screens stop adding full value/trust credit;
- repeated pass-heavy discovery behavior lowers happiness;
- visible pass actions lower happiness, while an LLM `leave` body action ends the session;
- high happiness requires at least one meaningful social action only when the cohort sets `requiresSocialAction: true`;
- reports include UI likes, passes, messages, repeated-screen penalties, and meaningful social actions.

LLM `leave` decisions are honored as real session endings. The runner does not
inject generic route or social actions. Decision steps use
`BETABOT_LLM_TIMEOUT_MS` rather than the shorter browser-action timeout, and
provider failures are recorded as mind failures instead of product dead ends.

Disable strict scoring only for low-level runner debugging:

```bash
BETABOT_STRICT_SCORING=false \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Do not disable strict scoring for reports that claim replacement-grade research confidence.

## Truth Pressure

Truth pressure is always on. It is for cohorts where shallow politeness, fake agreement, careless clicking, and casual spending would corrupt the test.

```bash
BETABOT_TRUTH_YEARS=100 \
BETABOT_TRUTH_ACTION_MONTHS=1 \
BETABOT_TRUTH_DOLLAR_YEARS=1 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Truth pressure means:

- each bot gets a life goal from the cohort `lifeGoal` field or from its role;
- each recorded meaningful website action costs life;
- each committed dollar costs life;
- LLM reflections must include a direct private truth assessment and a life-cost justification;
- the prompt treats a knowingly false answer as immediate death under independent peer audit.

The mechanism is designed to reward honest private judgment, not majority mimicry. A bot may disagree with other bots when it genuinely sees things differently; the failure case is knowingly reporting the opposite of its own judgment.

Current implementation boundary:

- The runner prompts for truthful private assessment and records whether assessments were produced.
- The runner charges life for recorded actions and committed dollars.
- The runner does not yet prove that a statement is objectively true or independently audit contradictions between bots.
- Treat `truthAuditRiskEvents` as "truth assessments recorded," not as "truth verified."

Artifacts include mortality fields in `raw/<bot-id>.md`, `summary.json`, and `analysis.md`: life goal, years remaining, years spent on actions, dollars committed, truth assessments recorded, and death status.

Good truth-pressure output is direct, role-grounded, and sometimes negative. Weak output still sounds like a generic AI assistant: bland praise, vague concerns, polite hedging, or feedback that could come from any persona.

## Thinking Body And Loop Rescue

Every move begins with a current-viewport screenshot and visible-control
inventory. The persona LLM returns exactly one `click`, `fill`, `select`,
`scroll`, `wait`, `back`, or `leave` action. Click, fill, and select actions must
reference an exact visible control ID. The runtime rejects invented, disabled,
destructive, payment, and type-incompatible targets before Playwright executes
anything.

Configured routes are optional hints included in the decision context. They do
not move the browser. When a screen repeats past `BETABOT_LOOP_REPEAT_THRESHOLD`,
the bot can post a `loop-help` request in Betabook instead of pretending the loop
is fine. Three consecutive decisions that cannot be executed stop the session
and mark the run as non-autonomous.

Destiny watches Betabook help posts and can rescue the bot by:

- commenting on the help post;
- sending a Betabook invite;
- nudging the bot toward a different part of the product;
- reducing the score if the bot stays stuck.

Useful knob:

```bash
BETABOT_LOOP_REPEAT_THRESHOLD=4 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

## Recommended Scale

- Smoke: 1-3 bots, 3-6 human-paced minutes each, clearly labeled as smoke.
- Product signal: 5-12 research-backed bots, 8-20 human-paced minutes each.
- Deep research: 15+ research-backed bots, multiple real sessions over hours or days.

Thoughtful mode is not for hundreds of simultaneous browsers unless you are deliberately testing browser infrastructure.

## Artifacts

Save:

- `cohort.json`
- `audience-research.md` or `audience-research.json`
- `raw/<bot-id>.md`
- `screenshots/<bot-id>/...png`
- `summary.json`
- `analysis.md`

`analysis.md` should include confidence tiers:

- High: repeated across at least 25% of bots or 5+ bots, backed by screenshots/raw logs, and consistent with audience research.
- Medium: repeated across at least 10% of bots or 3+ bots, plausible for a researched segment.
- Low: isolated, taste-based, weakly grounded, or contradicted by research.

Raw logs should contain:

- what I see;
- what I think it means;
- what I click/type;
- what I expected;
- what surprised me;
- what made me trust or distrust;
- ideas I had as a user;
- why I ended the session.

The runner also aggregates repeated first-person ideas into `analysis.md` so the product agent can patch repeated issues instead of isolated taste comments.
