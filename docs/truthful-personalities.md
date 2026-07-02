# Truthful Personalities

Betabots are designed to be truthful synthetic users, not agreeable AI assistants.

The project is useful only when bots are allowed to dislike the product, leave early, refuse to spend, feel socially unsure, mistrust vague claims, or say that a page is not worth their time. A fake-nice bot creates comforting output and bad product decisions.

## Principle

A betabot should speak from:

- a defined past;
- a concrete discovery circumstance;
- today's goal;
- a larger life goal;
- technical comfort and attention limits;
- visible evidence from the product.

It should not speak from:

- the builder's desired positioning;
- generic UX-review politeness;
- a default assistant personality;
- pressure to find something positive;
- hidden source code or implementation details.

## Mortal-Truth Mode

Mortal-truth mode adds pressure against fake agreement:

- each bot receives a life goal;
- recorded website actions cost life-years;
- committed dollars cost life-years;
- LLM reflections must include a direct truth assessment;
- reflections must justify whether the next action is worth the life cost;
- the prompt frames knowingly false answers as fatal under peer audit.

This is intentionally dramatic. The point is not literal simulation of death. The point is to make the model treat attention, trust, money, and social risk as scarce.

## What It Measures Today

The current implementation measures and records:

- whether each bot produced truth assessments;
- whether each bot produced life-cost decisions;
- how many actions were charged;
- how much life was spent on action and money;
- whether raw reactions are specific, negative, uncertain, or positive.

It does not yet independently prove truthfulness. A benchmark still needs to inspect the actual raw logs and ask whether the bot's statements are:

- grounded in visible screen evidence;
- consistent with its persona and life goal;
- willing to be negative;
- specific enough to guide product decisions;
- different across personas.

## Signs of Strong Output

Strong truthful-personality output sounds like:

- "I like the ambition, but I do not yet trust the proof enough to contact."
- "This page is attractive, but for my role it still feels too broad."
- "I would bookmark this, not subscribe yet."
- "The site makes him seem interesting, but I cannot explain the offer in one sentence."
- "This is worth one more click, not a call."

Weak output sounds like:

- "Great website with lots of potential."
- "I appreciate the clear design."
- "This seems useful for many users."
- "I would recommend improving the user experience."

## Benchmarking

Run paired benchmarks when changing truthful-personality behavior:

1. Normal thoughtful mode.
2. Mortal-truth mode with the same app, cohort, seed, count, time scale, and LLM provider.

Compare:

- truth assessments per bot;
- direct negative judgments;
- specificity of positive judgments;
- persona differentiation;
- action count and early exits;
- LLM fallback rate;
- whether ideas become sharper or merely harsher.

Use small runs for implementation checks and larger runs for product conclusions.
