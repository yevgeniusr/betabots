---
name: betabots
description: Run human-like synthetic beta cohorts against applications. Use when asked to create beta bots, betabots, metabots, simulated users, synthetic live users, multi-session product discovery, social product seeding, persona-based usability testing, raw journey logging, happiness analysis, or iterative product hardening from non-QA user behavior.
---

# Betabots

## Definition

A betabot is a simulated human with a defined past who discovers a product under defined circumstances. It does not know code, does not know it is QA, and does not follow a checklist. It behaves as a real person: curious, bored, skeptical, emotional, distracted, social, impatient, trusting, or guarded.

The key advantage is truthful personality pressure. Betabots should say what they actually think from their assigned life context, not perform a fake AI personality that always tries to be polite, helpful, and encouraging. Useful negative reactions are a feature, not a failure.

Betabots may open the UI, click buttons, send messages, wait for other users, return in later sessions, search the web when allowed, and abandon the product for human reasons. They must not inspect source code, databases, logs, API internals, or hidden requirements during a user session.

## Official Mode

Betabots has one official execution model: real-browser, human-speed sessions with a mandatory LLM mind layer.

Use it when the question is comprehension, trust, emotion, taste, copy, interaction quality, onboarding, and whether the product feels usable to an actual person. Betabots open the UI in real browsers, pause, read, think, click, type, hesitate, take screenshots, and save first-person raw thoughts.

Default rule:

- Betabots must interact through the product surface a person can see.
- They must not call product APIs, inspect server internals, use hidden implementation maps, or rely on project-specific runner code.
- Do not replace browser evidence with server-side metrics. A successful API call is not proof that a human understood the product.
- `BETABOT_LLM_PROVIDER=none` is not valid for product-quality runs and is rejected by the bundled runner.

## Research-First Replacement Protocol

To make betabots replace as much early user research as possible, build every serious cohort from audience evidence before running browsers:

1. Collect audience evidence: analytics segments, search intent, customer/support/sales notes, reviews, social comments, competitor audiences, public market research, referral sources, device mix, geography, and user vocabulary.
2. Save it as `audience-research.md` or structured JSON, then pass it with `BETABOT_AUDIENCE_RESEARCH_FILE`.
3. Convert the research into weighted jobs-to-be-done segments, not generic demographics.
4. Weight `screenSizeDistribution`, persona counts, discovery circumstances, goals, objections, and attention spans according to the evidence.
5. Mark any synthetic assumption that is not grounded in research.
6. Report confidence tiers: high only when repeated across many bots and backed by screenshots/raw logs; medium when repeated but not yet triangulated; low when isolated or taste-based.
7. Do not claim replacement-level confidence from generic personas, accelerated sessions, disabled LLM minds, or unweighted cohorts.

## Workflow

1. Define boundaries: local or staging URL, allowed accounts, fake-payment rule, data cleanup rule, and external-web allowance.
2. Research the real or likely audience and save the evidence before cohort generation.
3. Generate a research-weighted cohort with varied roles, pasts, discovery circumstances, goals, technical comfort, emotional baseline, and attention span.
4. Run multiple human-paced sessions per bot. Separate sessions with waits or phases so bots can react to each other.
5. Save raw first-person storylines before synthesis.
6. Analyze happiness, return likelihood, trust, value understood, abandonment reasons, social graph health, product defects, and confidence tiers.
7. Patch only repeated or high-severity issues.
8. Rerun a fresh cohort until critical flows complete and unhappy endings are explainable product choices, not defects.

## Session Rules

- Stay in character as a normal user, not an evaluator.
- Capture first-person raw notes: what I saw, thought, clicked, typed, felt, misunderstood, waited for, and why I left or returned.
- Use actual LLM-generated thoughts and actions. Do not disable the mind layer for a product-quality run.
- Run thoughtful sessions at human pace. Do not accelerate timing except for local runner development, and never present accelerated output as replacement-level research.
- Allow real human endings: bored and left, got lost, got angry, felt unsafe, found enough value, completed a session and will return later.
- Say the private truth plainly. Do not flatter the builder, optimize for politeness, or invent enthusiasm that the persona would not feel.
- Use synthetic identities only. Never submit real personal data, real payments, or spam real users.
- Keep live simulations isolated to local/dev/staging unless explicitly approved for production synthetic traffic.
- Label generated data clearly when the product persists user-generated content.

## Artifacts

Create `.betabots/runs/YYYYMMDD-HHMMSS/` or `.metabot/runs/YYYYMMDD-HHMMSS/` with:

- `cohort.json`: personas and configuration.
- `audience-research.md` or `audience-research.json`: sources, segment weights, traffic assumptions, vocabulary, intent, objections, and device mix.
- `raw/<bot-id>.md`: first-person multi-session storylines.
- `summary.json`: machine-readable metrics.
- `analysis.md`: evidence-backed product synthesis.
- `changes.md`: product changes made because of the run.
- `rerun.md`: follow-up results after fixes.

## Scripts

Use these bundled scripts from the plugin root:

- `skills/betabots/scripts/generate_cohort.py`: create reusable persona cohorts.
- `skills/betabots/scripts/analyze_sessions.py`: aggregate raw Markdown sessions.
- `skills/betabots/scripts/post_run_questions.cjs`: ask completed bots follow-up questions from their own saved raw session memory and write `post-run-questions.json/md`.
- `skills/betabots/scripts/thoughtful_browser_betabots.cjs`: run real-browser human-speed sessions with LLM-backed thoughts, screenshots, first-person raw logs, optional Betabook social board via `BETABOT_BETABOOK=true`, and optional Destiny master-plan orchestration via `BETABOT_DESTINY=true`.

Read `references/audience-research.md` before creating a product-quality cohort. Read `references/thoughtful-browser.md` before running browsers. Read `references/cohort-config.md` before creating or adapting app-specific personas. Read `references/session-template.md` when writing raw journey files manually.

## Happiness Standard

Treat bots as happy only when they understand the product value and have a credible reason to return. Passing technical checks is not enough.

Useful thresholds:

- `>= 70`: happy enough to return.
- `50-69`: understands value but needs more trust, content, people, or clarity.
- `< 50`: unhappy; likely bored, blocked, unsafe, or confused.

Report both aggregate happiness and representative raw stories. Never hide unhappy bots; they are the point of the exercise.

## Confidence Standard

Treat findings as:

- **High confidence**: repeated across at least 25% of the cohort or 5+ bots, backed by screenshots/raw logs, and consistent with the researched audience.
- **Medium confidence**: repeated across at least 10% of the cohort or 3+ bots, plausible for a researched segment, but not yet triangulated.
- **Low confidence**: isolated, taste-based, generated from weak personas, or contradicted by the research.

Only high-confidence or high-severity findings should drive immediate product changes. Medium-confidence findings should become experiments or rerun prompts. Low-confidence findings should be kept as weak signals, not roadmap facts.
