---
name: betabots
description: Run human-like synthetic beta cohorts against applications. Use when asked to create beta bots, betabots, metabots, simulated users, synthetic live users, multi-session product discovery, social product seeding, persona-based usability testing, raw journey logging, happiness analysis, or iterative product hardening from non-QA user behavior.
---

# Betabots

## Definition

A betabot is a simulated human with a defined past who discovers a product under defined circumstances. It does not know code, does not know it is QA, and does not follow a checklist. It behaves as a real person: curious, bored, skeptical, emotional, distracted, social, impatient, trusting, or guarded.

Betabots may open the UI, click buttons, send messages, wait for other users, return in later sessions, search the web when allowed, and abandon the product for human reasons. They must not inspect source code, databases, logs, API internals, or hidden requirements during a user session.

## Modes

Use the lightest mode that answers the product question:

1. **Journey cohort**: dozens of browser or manual sessions focused on onboarding, comprehension, and friction.
2. **Synthetic live app**: hundreds of API-level users create profiles, react, match, message, wait, and return across sessions.
3. **Hybrid validation**: API-level live graph plus browser probes for the most important personas and routes.

Do not use hundreds of real browsers unless the goal is load testing browser infrastructure. For product behavior, API-level social simulation plus targeted browser checks is more reliable and cheaper.

## Workflow

1. Define boundaries: local or staging URL, allowed accounts, fake-payment rule, data cleanup rule, and external-web allowance.
2. Generate a cohort with varied roles, pasts, discovery circumstances, goals, technical comfort, emotional baseline, and attention span.
3. Run multiple sessions per bot. Separate sessions with waits or phases so bots can react to each other.
4. Save raw first-person storylines before synthesis.
5. Analyze happiness, return likelihood, trust, value understood, abandonment reasons, social graph health, and product defects.
6. Patch only repeated or high-severity issues.
7. Rerun a fresh cohort until critical flows complete and unhappy endings are explainable product choices, not defects.

## Session Rules

- Stay in character as a normal user, not an evaluator.
- Capture first-person raw notes: what I saw, thought, clicked, typed, felt, misunderstood, waited for, and why I left or returned.
- Allow real human endings: bored and left, got lost, got angry, felt unsafe, found enough value, completed a session and will return later.
- Use synthetic identities only. Never submit real personal data, real payments, or spam real users.
- Keep live simulations isolated to local/dev/staging unless explicitly approved for production synthetic traffic.
- Label generated data clearly when the product persists user-generated content.

## Artifacts

Create `.betabots/runs/YYYYMMDD-HHMMSS/` or `.metabot/runs/YYYYMMDD-HHMMSS/` with:

- `cohort.json`: personas and configuration.
- `raw/<bot-id>.md`: first-person multi-session storylines.
- `summary.json`: machine-readable metrics.
- `analysis.md`: evidence-backed product synthesis.
- `changes.md`: product changes made because of the run.
- `rerun.md`: follow-up results after fixes.

## Scripts

Use these bundled scripts from the plugin root:

- `skills/betabots/scripts/generate_cohort.py`: create reusable persona cohorts.
- `skills/betabots/scripts/analyze_sessions.py`: aggregate raw Markdown sessions.
- `skills/betabots/scripts/multi_session_betabots.cjs`: run a configurable API-level synthetic-live simulation against an app with bearer-token auth.

Read `references/live-simulation.md` before using the multi-session runner. Read `references/session-template.md` when writing raw journey files manually.

## Happiness Standard

Treat bots as happy only when they understand the product value and have a credible reason to return. Passing technical checks is not enough.

Useful thresholds:

- `>= 70`: happy enough to return.
- `50-69`: understands value but needs more trust, content, people, or clarity.
- `< 50`: unhappy; likely bored, blocked, unsafe, or confused.

Report both aggregate happiness and representative raw stories. Never hide unhappy bots; they are the point of the exercise.
