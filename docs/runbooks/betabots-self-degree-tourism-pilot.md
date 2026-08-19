# Self-Degree tourism-pilot betabots run — 2026-08-19

## What ran

3 personas, mobile-first iPhone 13 viewport, headless Chromium, authenticated
via Playwright `storageState` pre-seeded at
`/tmp/betabot-storage-2026-08-18/tourism-{id}-{name}.json`. LLM mind:
`minimax` → `MiniMax-M3` (production-mind mirror). Total cohort runtime:
1740 s (29 min wall). 70 screenshots, 34 thoughts, 34 ideas.

## Where each persona got to

| Bot | Persona | Viewport | Final screen |
| --- | --- | --- | --- |
| 001 Marcus Ellington | operations manager pivoting to data analytics | desktop 1440x900 (used default) | "Building today's diagnostic…" after Start verified diagnostic |
| 002 Priya Ramachandran | returning mother, clinical research | iPhone 13 (correct) | Roadmap form → still filling |
| 003 Devon Okafor | self-taught web developer, ML | desktop 1440x900 (default) | Same create-roadmap flow |

None of them reached the new **AI credits / subscription chip** on the Profile tab
because every session timed out before crossing the diagnostic step.

## Most-cited UX findings (parsed from the 34 ideas, all 3 personas)

| Confidence | Finding | Bot |
| --- | --- | --- |
| HIGH (3/3, 8 mentions) | Need sample / preview on the landing page before signup | all |
| HIGH (2/3, 3 mentions) | "Still working…" generation status is opaque | Marcus, Priya |
| LOW | Roadmap subject placeholder is "e.g. Financial accounting" — wrong audience signal | Priya |
| LOW | Daily pace defaults to 10 min and no estimated finish date | Marcus |
| LOW | No pricing, no social proof, no founder name on landing page | all |

## Critical bug: MiniMax JSON failures

`summary.json` reports 2 `betabot_reflection` failures with:
```
Expected property name or '}' in JSON at position 2 (line 1 column 3)
```

This means the runner's `extractJson` got a 2-character response and
`<position 2>` is past the leading `{`. Most likely cause: empty response
truncated into a single garbage char + brace after thinking-tag stripping.
Repro ratio at default settings: ~2/39 calls ≈ 5 % per session.

### Patch for upstream

Add a JSON-equality check that aborts the mind-cycle (not the persona)
when parse fails repeatedly:

```diff
 - extractJson
 - try … brace-slice … fallback regex
 + try … JSON.parse
 + accept either a single object or a single wrapped-in-thinking object
 + retry once with a higher `BETABOT_LLM_TEMPERATURE` cap instead of
   failing the persona.
```

PR branch: `feat/minimax-opencode-providers-20260818`. Test:
`tests/llm_providers_smoke.test.cjs` already exercises thinking-tag stripping;
add a fixture for the "leading whitespace + brace" pattern.

## Why we couldn't reach the new mobile UI

1. Personas hit an unauthenticated landing page even with storage state
   because `safePlaceholder` (Camel-vs-lowercase) was previously case-folding
   `Marcus Ellington` → `Marcus-Ellington.json` while the seed script wrote
   `marcus-ellington.json`. Fixed in `tools/seed-personas.cjs`. Anyone
   reproducing should re-run the seed script.
2. Sessions are 5 min / 4–7 min and the cohort budget doesn't include the
   diagnostic wait + diagnostic questions. To exercise the credit chip end-
   to-end, either:
   - extend the cohort to `--thoughtful-minutes 18 --thoughtful-min-session-minutes 16`
     (each bot consumes ~16 minutes of which ~5 are the persona thinking
     and ~5 are the live 5-min roadmap generation wait), or
   - pre-route each persona past the create-roadmap flow by directly
     injecting a saved roadmap before the run.

## Re-run commands (token-aware)

```bash
# 1. fresh signup window — needed because JWT_EXPIRATION_TIME=60m on prod
node tools/seed-personas.cjs \
  --cohort .betabots/runs/<latest>-thoughtful/cohort.json \
  --base-url https://learn.self-degree.com \
  --api-url https://api.self-degree.com \
  --out-dir /tmp/betabot-storage-2026-08-18 \
  --prefix tourism

# 2. cohort with mobile-first
export BETABOT_LLM_PROVIDER=minimax
export BETABOT_MINIMAX_API_KEY=$(cat ~/.config/opencode/private/minimax.key)
export BETABOT_LLM_MODEL=MiniMax-M3
export BETABOT_PERSONAS_FILE=$(realpath .betabots/runs/<latest>-thoughtful/personas-supplied.json)
export BETABOT_PERSONA_PREFLIGHT_STORAGE_STATE=/tmp/betabot-storage-2026-08-18/tourism-thoughtful-betabot-001-Marcus-Ellington.json
export BETABOT_STORAGE_STATE_TEMPLATE='/tmp/betabot-storage-2026-08-18/tourism-{id}-{name}.json'
export BETABOT_SCREEN_SIZE_DISTRIBUTION='{"category":"mobile","weight":100,"devices":[{"name":"iPhone 13","width":390,"height":844,"deviceScaleFactor":3,"isMobile":true,"hasTouch":true}]}'
export BETABOT_HEADLESS=true
export BETABOT_APP_URL=https://learn.self-degree.com

node skills/betabots/scripts/thoughtful_browser_betabots.cjs \
  --run-dir .betabots/runs/2026-08-19-tourism-v$N \
  --count 3 \
  --thoughtful-minutes 18 --thoughtful-min-session-minutes 16 --thoughtful-max-session-minutes 22
```

The 18-min budget lets the persona: arrive, click Create roadmap, fill the
form, hit Generate, wait out the 5-minute generation status, click "Start
verified diagnostic", and survive the diagnostic build screen long enough
to either reach the Profile tab or surface the credits / subscription UI.

## Recommended upstream PR

The MiniMax JSON-parsing fix is small (single test fixture + one
helper function) and lands cleanly. Branch already pushed.
