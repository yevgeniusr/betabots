# Post-Run Questions

Use post-run questions when you need to ask completed betabots follow-up questions after a run.

The browser contexts are closed after a run, so post-run Q&A uses each bot's saved first-person raw journey as durable session memory. This preserves what the bot saw, clicked, felt, trusted, misunderstood, and why it ended the session. It is not a hidden browser-state replay.

## Usage

```bash
BETABOT_RUN_DIR=.betabots/runs/20260701-example \
BETABOT_POST_RUN_QUESTIONS='[
  "What would make you trust this product more?",
  "What would you tell a friend about it?"
]' \
BETABOT_LLM_PROVIDER=codex \
node skills/betabots/scripts/post_run_questions.cjs
```

Or use a questions file:

```bash
node skills/betabots/scripts/post_run_questions.cjs \
  --run-dir .betabots/runs/20260701-example \
  --questions-file .betabots/questions.json
```

The questions file may be:

- a JSON array of strings;
- `{ "questions": ["..."] }`;
- plain text with one question per line.

## Outputs

The script writes:

- `post-run-questions.json`: structured per-bot answers.
- `post-run-questions.md`: readable per-bot answers.

## Rules

- Keep questions tied to what bots actually saw and felt.
- Ask all follow-up questions in one pass when possible, so each bot answers from the same memory context.
- Use a real LLM provider. `BETABOT_LLM_PROVIDER=none` is not valid.
- For large cohorts, use low concurrency to avoid nested LLM timeouts.
