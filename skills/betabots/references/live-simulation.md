# Live Simulation Guide

Use API-level simulation when the goal is to make a social or marketplace product behave as if people are present.

## Requirements

- A local or staging backend URL.
- A safe synthetic auth mechanism, usually an E2E bearer token.
- A data cleanup strategy or isolated database.
- Clear limits on external effects: no real payments, no messages to real users, no production spam.

## Default Phases

1. **Onboarding**: each bot creates/updates a profile and creates a character or product-specific identity.
2. **Discovery**: bots wait for the cohort, then browse and send likes/passes/reactions.
3. **Return**: bots check incoming reactions, accept/dismiss, read matches, and message.
4. **Concrete value**: bots browse marketplace/events/bookings or another activation surface.
5. **Analysis**: compute happiness from created value, matches, messages, trust, errors, and return likelihood.

## Recommended Scale

- Smoke: 10-25 bots, 2-4 sessions.
- Product signal: 100-300 bots, 3-5 sessions.
- Load-adjacent: 500+ bots only after the smoke run has zero contract errors.

## Interpreting Results

High happiness with low interaction is suspicious. A healthy social run should show:

- most bots create identities;
- many bots send reactions;
- some mutual matches appear;
- message threads continue after waiting;
- unhappy users have legible reasons, not crashes or dead ends.
