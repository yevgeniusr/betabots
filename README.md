# Betabots

Betabots is a plugin and skill bundle for filling a product with synthetic beta users: human-like personas with defined pasts, discovery circumstances, attention spans, emotions, and multi-session behavior.

It is inspired by the multi-harness plugin layout of [Superpowers](https://github.com/obra/superpowers): one repository ships skills, references, scripts, and manifests for multiple coding-agent runtimes.

## What Betabots Do

A betabot is not QA. It does not know code and does not know it is testing. It is a simulated person who discovers your product, tries to understand it, uses it, waits, returns, interacts with other simulated people, and may leave for normal human reasons.

Betabots can help you answer:

- Do new users understand the product?
- Does the product feel alive without real users yet?
- Do social, dating, marketplace, chat, or booking flows work across multiple sessions?
- Where do users get bored, scared, confused, or convinced?
- Which changes make users happier enough to return?

## Official Modes

Betabots has two official execution modes.

### Fast Mode

Fast mode is API-level synthetic-live simulation. It is for speed, scale, backend confidence, social graph population, and repeated multi-session behavior. For social products, it now runs a coordinated lifecycle rather than isolated single-user sessions.

Use it when you need hundreds of users to sign up, like/pass, match, chat, flirt, roleplay, invite each other to tables, reserve or request venue/organizer support, ghost or attend dates, form groups, churn, and return across simulated years:

```bash
BETABOT_COUNT=200 \
BETABOT_SESSIONS=12 \
BETABOT_YEARS=3 \
BETABOT_CONCURRENCY=16 \
BETABOT_BACKEND_URL=http://localhost:3001/api \
BETABOT_AUTH_TOKEN=your-dev-e2e-token \
node skills/betabots/scripts/multi_session_betabots.cjs
```

Fast mode writes `relationships.json`, `groups.json`, and `timeline.json` in addition to raw per-bot stories. Real APIs are used where available; missing lifecycle entities such as date attendance or first-class party groups are recorded as synthetic lifecycle events so product gaps remain visible.

### Thoughtful Mode

Thoughtful mode launches real browsers and runs human-speed sessions. It is for comprehension, trust, emotion, copy, onboarding, visual UI, and product taste. Each bot records what it sees, thinks, clicks, types, misunderstands, likes, and why it leaves or returns.

Use it after fast mode is clean:

```bash
BETABOT_COHORT_FILE=skills/betabots/examples/generic-saas.cohort.json \
BETABOT_APP_URL=http://localhost:5173 \
BETABOT_THOUGHTFUL_COUNT=5 \
BETABOT_THOUGHTFUL_MINUTES=8 \
BETABOT_HEADLESS=false \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

By default, thoughtful mode uses real-time pacing (`BETABOT_TIME_SCALE=1`). Lower the scale only for development dry-runs.

Thoughtful mode also uses an actual LLM mind layer by default:

- `BETABOT_LLM_PROVIDER=codex` uses local Codex CLI with the signed-in ChatGPT/Codex account.
- `BETABOT_LLM_PROVIDER=openrouter` uses OpenRouter chat completions.
- `BETABOT_LLM_PROVIDER=none` disables model calls and uses deterministic fallback text for runner debugging only.

```bash
BETABOT_LLM_PROVIDER=codex \
BETABOT_LLM_MODEL=gpt-5 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

For OpenRouter:

```bash
BETABOT_LLM_PROVIDER=openrouter \
BETABOT_LLM_MODEL=openai/gpt-4.1-mini \
OPENROUTER_API_KEY=... \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

For apps with local E2E auth, seed a separate browser account per bot:

```bash
BETABOT_AUTH_LOCAL_STORAGE_KEY=your.auth.storage.key \
BETABOT_AUTH_TOKEN_TEMPLATE='dev-token:{id}' \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

`{id}`, `{name}`, and `{role}` are replaced per bot so sessions do not accidentally share user state.

For social products, enable **Betabook** and **Destiny** as separate layers.

Betabook is a simple Reddit-like board scoped to the current simulation. Betabots can introduce themselves, post looking-for-party notes, comment, receive invites, and coordinate outside the product UI while still behaving like independent people.

Destiny is the orchestration layer. It watches the cohort in real time, follows a global master plan, and makes paths cross, almost cross, or intentionally not cross. Destiny can manipulate Betabook and can nudge individual betabots by giving them believable hunches, timing, and actions.

```bash
BETABOT_BETABOOK=true \
BETABOT_DESTINY=true \
BETABOT_BACKEND_URL=http://localhost:3001/api \
BETABOT_AUTH_LOCAL_STORAGE_KEY=your.auth.storage.key \
BETABOT_AUTH_TOKEN_TEMPLATE='dev-token:{id}' \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Betabook writes `betabook.json`. Destiny writes `destiny.json`. The raw bot stories record Betabook moments and Destiny nudges separately.

For long-form research, set explicit minimum and maximum session lengths:

```bash
BETABOT_THOUGHTFUL_COUNT=50 \
BETABOT_THOUGHTFUL_MINUTES=60 \
BETABOT_THOUGHTFUL_MIN_SESSION_MINUTES=60 \
BETABOT_THOUGHTFUL_MAX_SESSION_MINUTES=75 \
BETABOT_THOUGHTFUL_CONCURRENCY=10 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

The runner aggregates first-person thoughts and ideas into `analysis.md` and `summary.json`.
Thoughtful sessions keep thinking tied to product use: each observation can produce a thought, first reaction, similarity/comparison, or idea, but the runner should not spend most of a session in reflection-only mode.
By default, thoughtful mode uses a generic cross-product cohort. For domain-specific testing, pass `BETABOT_COHORT_FILE` with roles, pasts, discovery circumstances, routes, value keywords, trust keywords, and idea rules. See `skills/betabots/references/cohort-config.md`.

Run the DnDate cohort explicitly:

```bash
BETABOT_COHORT_FILE=skills/betabots/examples/dndate.cohort.json \
BETABOT_APP_URL=http://localhost:5173 \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

## Repository Layout

```text
.codex-plugin/plugin.json      Codex plugin manifest
.claude-plugin/plugin.json     Claude Code plugin manifest
.cursor-plugin/plugin.json     Cursor plugin manifest
skills/betabots/SKILL.md       Main Betabots skill
skills/betabots/scripts/       Cohort, analysis, and live simulation scripts
skills/betabots/examples/      Reusable cohort files for generic and domain-specific apps
skills/betabots/references/    Session templates, safety, fast, and thoughtful guidance
scripts/install-local.sh       Local installer for Codex, Claude, and Cursor
tests/smoke.sh                 Lightweight validation
```

## Install Locally

Clone and install into local agent runtimes:

```bash
git clone https://github.com/yevgeniusr/betabots.git
cd betabots
scripts/install-local.sh all
```

Install a single runtime:

```bash
scripts/install-local.sh codex
scripts/install-local.sh claude
scripts/install-local.sh cursor
```

Start a new agent thread after installation so the runtime reloads skills/plugins.

## Codex

The installer copies the plugin to `~/plugins/betabots`, updates the personal Codex marketplace at `~/.agents/plugins/marketplace.json`, runs `codex plugin add betabots@personal` when available, and mirrors the skill into `~/.codex/skills/betabots`.

Manual install:

```bash
mkdir -p ~/plugins
cp -R . ~/plugins/betabots
codex plugin add betabots@personal
```

## Claude Code

The installer copies the plugin to `~/.claude/plugins/local/betabots`, registers that local marketplace with Claude, installs `betabots@betabots-dev` when available, and mirrors the skill into `~/.claude/skills/betabots`.

Manual install:

```bash
claude plugin marketplace add /path/to/betabots
claude plugin install betabots@betabots-dev --scope user
```

For one-off testing without installing:

```bash
claude --plugin-dir /path/to/betabots -p "Use betabots to plan a cohort for this app."
```

## Cursor

The installer copies the plugin to `~/.cursor/plugins/betabots` and mirrors the skill into both `~/.cursor/skills/betabots` and `~/.cursor/skills-cursor/betabots` for local discovery.

Cursor marketplace support varies by build. If your Cursor build supports chat plugin commands, you can also install from the repository after publishing:

```text
/add-plugin https://github.com/yevgeniusr/betabots
```

## Scripts

Generate a cohort:

```bash
python3 skills/betabots/scripts/generate_cohort.py --count 50 --product "My app" --out cohort.json
```

Aggregate raw sessions:

```bash
python3 skills/betabots/scripts/analyze_sessions.py .betabots/runs/latest/raw --out analysis.md
```

Run a DnDate-style synthetic live simulation:

```bash
BETABOT_COUNT=200 \
BETABOT_SESSIONS=12 \
BETABOT_YEARS=3 \
BETABOT_CONCURRENCY=16 \
BETABOT_BACKEND_URL=http://localhost:3001/api \
BETABOT_AUTH_TOKEN=your-dev-e2e-token \
node skills/betabots/scripts/multi_session_betabots.cjs
```

The bundled live runner is an adapter for products with endpoints similar to DnDate: profiles, characters, reactions, matches, messages, tabletop marketplace, reservations, organizer requests, and organizer venues. It also records synthetic lifecycle events for domain concepts that are not yet first-class API resources, such as date attendance, ghosting, second dates, and party group continuity. For other products, adapt the endpoint functions and keep the same artifact format.

Run thoughtful browser sessions:

```bash
BETABOT_COHORT_FILE=skills/betabots/examples/generic-saas.cohort.json \
BETABOT_APP_URL=http://localhost:5173 \
BETABOT_THOUGHTFUL_COUNT=3 \
BETABOT_THOUGHTFUL_MINUTES=10 \
BETABOT_HEADLESS=false \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

Thoughtful mode requires Playwright to be available in the target project or globally.

Optional auth isolation:

- `BETABOT_AUTH_LOCAL_STORAGE_KEY`: localStorage key to seed before the app loads.
- `BETABOT_AUTH_TOKEN_TEMPLATE`: token template; supports `{id}`, `{name}`, and `{role}` placeholders.
- `BETABOT_COHORT_FILE`: optional JSON file defining product-specific personas, roles, routes, keywords, and idea rules.
- `BETABOT_BETABOOK=true`: enables the run-scoped Reddit-like social board for bot-to-bot posts, comments, and invites.
- `BETABOT_DESTINY=true`: enables the master-plan layer that makes paths cross, not cross, or almost cross.
- `BETABOT_DESTINY_INTERVAL_MS`: interval for Destiny to inspect the cohort and apply interventions.
- `BETABOT_BACKEND_URL`: API base URL Destiny uses when it needs product-level likes, matches, or messages.
- `BETABOT_STRICT_SCORING=true`: default; discounts repeated screens, penalizes pass-heavy behavior, and requires meaningful social actions before declaring high happiness.
- `BETABOT_LOOP_REPEAT_THRESHOLD=4`: repeated-screen threshold that makes a stuck bot ask Betabook for help.
- `BETABOT_CURIOSITY_CHANCE=0.18`: chance per move that a bot tries a safe curiosity action instead of the planned route.
- `BETABOT_MAX_CURIOSITY_ACTIONS=8`: cap on curiosity clicks/config changes per bot session.
- `BETABOT_LLM_PROVIDER=codex`: model provider for betabot thoughts, social text, Betabook comments, and Destiny plans. Supports `codex`, `openrouter`, or `none`.
- `BETABOT_LLM_MODEL`: optional provider model override.
- `BETABOT_CODEX_COMMAND=codex`: Codex CLI command path for the local ChatGPT/Codex provider.
- `BETABOT_LLM_TIMEOUT_MS=90000`: timeout per model call.
- `BETABOT_LLM_MAX_CALLS=500`: cap per run before falling back.
- `OPENROUTER_API_KEY` or `BETABOT_OPENROUTER_API_KEY`: OpenRouter key when `BETABOT_LLM_PROVIDER=openrouter`.
- `BETABOT_OPENROUTER_BASE_URL`: optional OpenRouter-compatible base URL.

Persona and role definition:

- The runner accepts `roles` or `personas` as strings or objects.
- Role objects can define `role`, `name`, `past`, `discovery`, `goal`, `traits`, `emotionalBaseline`, `technicalComfort`, `viewport`, and `attentionSpanMinutes`.
- Product-specific routes and words belong in cohort JSON, not in runner code.
- Use `skills/betabots/examples/dndate.cohort.json` as a domain-specific pattern and `skills/betabots/examples/generic-saas.cohort.json` as a portable baseline.

## Safety

- Use local/dev/staging by default.
- Use synthetic identities only.
- Never send real payments or messages to real users.
- Stop scaling if the run finds backend 500s, auth leaks, privacy issues, or destructive behavior.
- Save raw stories before analysis so product decisions remain evidence-backed.

## Validate

```bash
tests/smoke.sh
python3 /Users/mac/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

## License

MIT
