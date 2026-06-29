# Thoughtful Browser Mode

Thoughtful mode is the slow, real-browser mode for betabots.

## Purpose

Use thoughtful mode when fast API traffic is not enough. It answers:

- Does the UI explain itself?
- Does the product feel trustworthy?
- Does onboarding match a real person's mental model?
- Which copy, empty states, buttons, routes, or waits create anxiety or momentum?
- Would a user come back for a human reason?

## Rules

- Launch actual browser contexts.
- Move at human speed with real pauses.
- Keep first-person thoughts in the raw log.
- Do not inspect source code, APIs, devtools, DB, or hidden implementation details during a bot session.
- Prefer visible UI affordances over direct route jumps.
- Save screenshots as supporting evidence, not as the primary artifact.
- End sessions for human reasons: boredom, confusion, trust failure, success, curiosity, anxiety, or enough value.
- Keep thinking attached to product use. A bot should form first impressions, reactions, comparisons, and ideas after seeing or doing something, not sit in a long reflection-only loop.

## Time

Default `BETABOT_TIME_SCALE=1` means real pacing. A 10-minute session should take about 10 minutes. Use lower scales only for development dry-runs and mark the limitation in `analysis.md`.

For minimum-duration studies, set both target and minimum session length:

```bash
BETABOT_THOUGHTFUL_MINUTES=60 \
BETABOT_THOUGHTFUL_MIN_SESSION_MINUTES=60 \
BETABOT_THOUGHTFUL_MAX_SESSION_MINUTES=75 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

## LLM Minds

Thoughtful mode uses actual LLM calls for bot thoughts, opinions, ideas, social messages, Betabook help/comment text, and Destiny planning. Deterministic text is only a fallback when the provider is disabled, exhausted, or unavailable.

Default provider:

```bash
BETABOT_LLM_PROVIDER=codex \
BETABOT_LLM_MODEL=gpt-5 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

The `codex` provider calls local Codex CLI in non-interactive exec mode and uses the currently signed-in ChatGPT/Codex account. Override the executable with `BETABOT_CODEX_COMMAND` when `codex` is not on `PATH`.

OpenRouter provider:

```bash
BETABOT_LLM_PROVIDER=openrouter \
BETABOT_LLM_MODEL=openai/gpt-4.1-mini \
OPENROUTER_API_KEY=... \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Provider knobs:

- `BETABOT_LLM_PROVIDER=codex|openrouter|none`
- `BETABOT_LLM_MODEL`
- `BETABOT_CODEX_COMMAND`
- `BETABOT_LLM_TIMEOUT_MS`
- `BETABOT_LLM_MAX_CALLS`
- `OPENROUTER_API_KEY` or `BETABOT_OPENROUTER_API_KEY`
- `BETABOT_OPENROUTER_BASE_URL`

Use `BETABOT_LLM_PROVIDER=none` only for runner smoke tests where model behavior is not under evaluation.

## Cohort Configuration

Thoughtful mode is app-agnostic when you pass a cohort file:

```bash
BETABOT_COHORT_FILE=skills/betabots/examples/generic-saas.cohort.json \
BETABOT_APP_URL=http://localhost:5173 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Use `references/cohort-config.md` for the full schema. In short:

Screen-size seeding is part of random character generation. By default, thoughtful mode uses 50% mobile phones, 20% tablets, and 30% desktop/laptop PCs. Set `screenSizeDistribution` in the cohort file or pass `BETABOT_SCREEN_SIZE_DISTRIBUTION` as a JSON array to change the weighted buckets.

- `roles` define who the betabots are, what happened before they arrived, how they discovered the app, and what they want today.
- `routes` define visible labels and fallback URLs the bots can realistically try.
- `keywords` define what counts as value, trust, risk, and empty-state evidence for that product.
- `ideaRules` turn observed product text into first-person product ideas.

The runner has generic defaults, but serious product testing should provide a cohort file for the target domain.

## Auth Isolation

When the target app supports local E2E auth, use per-bot browser storage so one bot does not inherit another bot's account:

- `BETABOT_AUTH_LOCAL_STORAGE_KEY`: localStorage key to seed before app JavaScript runs.
- `BETABOT_AUTH_TOKEN_TEMPLATE`: token template with `{id}`, `{name}`, or `{role}` placeholders.

Example:

```bash
BETABOT_AUTH_LOCAL_STORAGE_KEY=dndate.e2eAuthToken \
BETABOT_AUTH_TOKEN_TEMPLATE='base-dev-token:{id}' \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

## Betabook

Betabook is a simple Reddit-like board scoped only to the current simulation. It is not the product under test. It gives betabots a shared social surface where they can introduce themselves, post needs, comment, coordinate, and receive invites.

Use Betabook when a cohort needs social context without forcing every social action through the product UI:

- introductions;
- looking-for-party posts;
- comments and replies;
- invites;
- missed connections;
- venue or organizer requests.

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
- use product APIs when needed to make likes, matches, and messages happen through normal product contracts.

```bash
BETABOT_BETABOOK=true \
BETABOT_DESTINY=true \
BETABOT_BACKEND_URL=http://localhost:3001/api \
BETABOT_AUTH_LOCAL_STORAGE_KEY=dndate.e2eAuthToken \
BETABOT_AUTH_TOKEN_TEMPLATE='base-dev-token:{id}' \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

The runner writes `destiny.json` with the master plan, ready users, interventions, path-crossing states, nudges, API events, and errors. If Destiny repeatedly has to force crossings that should happen organically, treat that as product evidence: real users may also fail to find active people, receive likes, or continue a social journey.

## Strict Scoring

Thoughtful mode defaults to `BETABOT_STRICT_SCORING=true`. Strict scoring prevents shallow browser loops from looking like success:

- repeated screens stop adding full value/trust credit;
- repeated pass-heavy discovery behavior lowers happiness;
- high happiness requires at least one meaningful social action when the product is social;
- reports include UI likes, passes, match messages, repeated-screen penalties, and meaningful social actions.

Disable strict scoring only for low-level runner debugging:

```bash
BETABOT_STRICT_SCORING=false \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

## Loop Rescue and Curiosity

Thoughtful bots should not silently repeat the same route forever. When a screen repeats past `BETABOT_LOOP_REPEAT_THRESHOLD`, the bot posts a `loop-help` request in Betabook instead of pretending the loop is fine.

Destiny watches Betabook help posts and can rescue the bot by:

- commenting on the help post;
- sending a Betabook invite;
- nudging the bot toward a different route;
- reducing the score if the bot stays stuck.

Bots also have controlled curiosity. On some moves, they may click safe visible controls, change filters/selects, or adjust sliders to see how the product reacts. This is intentionally bounded and avoids destructive actions.

Useful knobs:

```bash
BETABOT_LOOP_REPEAT_THRESHOLD=4 \
BETABOT_CURIOSITY_CHANCE=0.18 \
BETABOT_MAX_CURIOSITY_ACTIONS=8 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

## Recommended Scale

- Smoke: 1-3 bots, 3-6 minutes each.
- Product signal: 5-12 bots, 8-20 minutes each.
- Deep research: 15+ bots, multiple real sessions over hours or days.

Thoughtful mode is not for hundreds of simultaneous browsers unless you are deliberately testing browser infrastructure.

## Artifacts

Save:

- `cohort.json`
- `raw/<bot-id>.md`
- `screenshots/<bot-id>/...png`
- `summary.json`
- `analysis.md`

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
