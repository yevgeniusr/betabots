# Live Simulation Guide

Use API-level simulation when the goal is to make a social or marketplace product behave as if people are present.

Fast mode is still LLM-backed. The speed comes from batching model calls and executing through APIs, not from replacing users with fixed scripts.

## Requirements

- A local or staging backend URL.
- A safe synthetic auth mechanism, usually an E2E bearer token.
- A data cleanup strategy or isolated database.
- Clear limits on external effects: no real payments, no messages to real users, no production spam.

## Default Social Lifecycle

The default fast runner is coordinated. It is not a single-session click-through.

1. **Signup and identity**: each bot creates/updates a profile and creates a character or product-specific identity.
2. **Directed discovery**: paired bots wait for each other, then send targeted likes/reactions instead of random isolated activity.
3. **Return and matching**: recipient bots come back later, review incoming likes, accept/dismiss, and create real matches where the API supports it.
4. **Chat and flirting**: matched pairs exchange multiple alternating messages, including roleplay and table/date planning.
5. **Table activation**: bots browse marketplace inventory, reserve/waitlist when possible, or request organizer/venue support when no table exists.
6. **First date outcome**: bots attend, ghost, or reschedule, and the raw storyline records the human reason.
7. **Second date or closure**: successful pairs return for a second interaction; ghosted pairs fade or recover.
8. **Party formation**: stable pairs combine into party groups and simulate group continuity.
9. **Campaign continuity**: groups keep playing or lose members through schedule friction.
10. **Multi-year return**: bots either retain because the app now contains relationships or drift away because social gravity never formed.
11. **Analysis**: compute happiness from identity, matching, messages, table activation, dates, groups, retention, trust, errors, and ghosting.

Set `BETABOT_SESSIONS=12` to run the full lifecycle. Smaller values stop at the corresponding lifecycle phase.

## LLM Mind Layer

Fast mode creates batched LLM-generated minds before lifecycle execution. Each generated mind includes character details, motivation, opener text, chat replies, flirt/roleplay lines, invitation text, ghosting likelihood, second-date likelihood, organizer motivation, retention reason, and churn reason.

Provider settings match thoughtful mode:

```bash
BETABOT_LLM_PROVIDER=codex \
BETABOT_LLM_BATCH_SIZE=25 \
node skills/betabots/scripts/multi_session_betabots.cjs
```

Supported knobs:

- `BETABOT_LLM_PROVIDER=codex|openrouter|none`
- `BETABOT_LLM_MODEL`
- `BETABOT_LLM_BATCH_SIZE`
- `BETABOT_LLM_TIMEOUT_MS`
- `BETABOT_LLM_MAX_CALLS`
- `BETABOT_CODEX_COMMAND`
- `OPENROUTER_API_KEY` or `BETABOT_OPENROUTER_API_KEY`

Use `BETABOT_LLM_PROVIDER=none` only to debug the runner itself. It is not a valid product-quality betabot run.

## Recommended Scale

- Smoke: 10-25 bots, 3-6 sessions.
- Product signal: 100-300 bots, 8-12 sessions.
- Load-adjacent: 500+ bots only after the smoke run has zero contract errors.

## Interpreting Results

High happiness with low interaction is suspicious. A healthy social run should show:

- most bots create identities;
- many bots send reactions;
- some mutual matches appear;
- message threads continue after waiting;
- table invitations or organizer fallback happen;
- some dates succeed and some ghost for human reasons;
- stable relationships produce groups or recurring sessions;
- unhappy users have legible reasons, not crashes or dead ends.

## Artifacts

Fast social lifecycle runs write:

- `cohort.json`: bots, relationship plan, group plan, and lifecycle configuration.
- `raw/<bot-id>.md`: first-person multi-session, multi-year storyline.
- `relationships.json`: pair status, match IDs, date invites, ghosting, second-date state, and relationship events.
- `groups.json`: party membership, campaign sessions, churn, and group status.
- `timeline.json`: phase-level execution timeline.
- `summary.json`: machine-readable metrics.
- `analysis.md`: human-readable synthesis.
