# LLM Minds

Every Thoughtful browser betabot is driven by a real multimodal LLM. This
document lists the providers the bundled runner knows about, the environment
variables each one reads, and the kind of run it is appropriate for.

## Quick reference

| Provider     | Env                            | Default model                | Multimodal | Best for                                                       |
| ------------ | ------------------------------ | ---------------------------- | ---------- | -------------------------------------------------------------- |
| `codex`      | (signed-in Codex CLI)          | whatever Codex CLI defaults  | yes        | Local Codex account, fastest path during development           |
| `openrouter` | `OPENROUTER_API_KEY`           | `openai/gpt-4.1-mini`        | yes        | Hosted models on OpenRouter, including MiniMax M3 and GPT-5    |
| `minimax`    | `BETABOT_MINIMAX_API_KEY`      | `MiniMax-M3`                 | yes        | Production-mind mirror: same M3 family production routes through OpenRouter (OpenRouter alias `minimax/minimax-m3`) |
| `opencode`   | `BETABOT_OPENCODE_COMMAND`     | whatever `opencode` defaults | no         | Dev-only smoke runs; not for product-quality evaluation        |

The bundled runner rejects `BETABOT_LLM_PROVIDER=none`. A run without a real
LLM mind is not a betabot run.

## Provider details

### `codex`

Default provider. Spawns `codex exec` in non-interactive mode. Requires a
signed-in ChatGPT or Codex CLI session on the same machine.

```bash
BETABOT_LLM_PROVIDER=codex \
BETABOT_LLM_MODEL=gpt-5 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Override the binary with `BETABOT_CODEX_COMMAND`.

### `openrouter`

Sends OpenAI-compatible Chat Completions requests to the OpenRouter
endpoint. Reads `OPENROUTER_API_KEY` (or `BETABOT_OPENROUTER_API_KEY`).

```bash
BETABOT_LLM_PROVIDER=openrouter \
BETABOT_LLM_MODEL=openai/gpt-4.1-mini \
OPENROUTER_API_KEY=... \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Useful when you want to A/B a specific hosted model without re-pointing the
rest of the platform. See `thoughtful-browser.md` for the rest of the
provider knobs.

### `minimax`

Production mirror: defaults to the same MiniMax M3 family that production
LLM workflows route through on OpenRouter (see
`services/directory/src/ai/checkpoint-lesson-generator.service.ts` in the
Self-degree codebase). This lets betabot cohorts surface the same
qualitative failure modes real users hit, without bouncing through a
different vendor.

```bash
BETABOT_LLM_PROVIDER=minimax \
BETABOT_MINIMAX_API_KEY=... \
BETABOT_LLM_MODEL=MiniMax-M3 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Knobs:

- `BETABOT_MINIMAX_API_KEY` (falls back to `OPENAI_COMPAT_API_KEY` for shared
  credentials)
- `BETABOT_MINIMAX_BASE_URL` (default `https://api.minimax.io/v1`)
- `BETABOT_MINIMAX_MODEL` (default `MiniMax-M3`)
- `BETABOT_MINIMAX_TIMEOUT_MS`
- `BETABOT_MINIMAX_SITE_URL` and `BETABOT_MINIMAX_APP_NAME` (for OpenRouter-style referer headers when proxying)

Multimodal coverage mirrors OpenRouter: screenshots are sent as base64
`image_url` blocks.

### `opencode`

Spawns the local `opencode` CLI in `exec` mode and reads its structured
JSON output. Documented as **dev-only** because image-injection flags vary
across `opencode` versions and the bundled runner does not pre-negotiate
them. Useful for offline smoke runs and CI gating.

```bash
BETABOT_LLM_PROVIDER=opencode \
BETABOT_OPENCODE_COMMAND=opencode \
BETABOT_OPENCODE_MODEL=MiniMax-M3 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Knobs:

- `BETABOT_OPENCODE_COMMAND` (default `opencode`)
- `BETABOT_OPENCODE_MODEL`
- `BETABOT_OPENCODE_TIMEOUT_MS`
- `BETABOT_OPENCODE_FLAGS` (extra flags, space-separated)

## Failure handling

All providers route through the runner's `llmJson` wrapper:

- provider failure → `llm.failures` and `llm.fallbacks` increment
- repeated failures stop the bot before it executes a deterministic action
- persona-authored text carries a successful LLM decision ID; fallback or
  templated persona speech never publishes

The runner never silently substitutes a fallback action. If the LLM cannot
produce an executable action, the bot records a mind failure and ends.

## Adding a new provider

1. Implement `call<Provider>(prompt, imagePaths)` in
   `skills/betabots/scripts/<provider>_provider.cjs` and return a string.
2. Add the provider name to `validProviders` in both
   `thoughtful_browser_betabots.cjs` and `post_run_questions.cjs`.
3. Extend the dispatch switch in `invokeLlmProvider` /
   `llmJson` in each script.
4. Add provider knobs to the `publicConfig()` shape and document them in
   this file.
5. Add a smoke test entry to `tests/llm_providers_smoke.test.cjs`.
