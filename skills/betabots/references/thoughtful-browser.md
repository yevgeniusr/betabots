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

## Time

Default `BETABOT_TIME_SCALE=1` means real pacing. A 10-minute session should take about 10 minutes. Use lower scales only for development dry-runs and mark the limitation in `analysis.md`.

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
