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

Fast mode is API-level synthetic-live simulation. It is for speed, scale, backend confidence, social graph population, and repeated multi-session behavior.

Use it when you need hundreds of users to create profiles, like/pass, match, message, reserve, wait, and return:

```bash
BETABOT_COUNT=200 \
BETABOT_SESSIONS=4 \
BETABOT_CONCURRENCY=16 \
BETABOT_BACKEND_URL=http://localhost:3001/api \
BETABOT_AUTH_TOKEN=your-dev-e2e-token \
node skills/betabots/scripts/multi_session_betabots.cjs
```

### Thoughtful Mode

Thoughtful mode launches real browsers and runs human-speed sessions. It is for comprehension, trust, emotion, copy, onboarding, visual UI, and product taste. Each bot records what it sees, thinks, clicks, types, misunderstands, likes, and why it leaves or returns.

Use it after fast mode is clean:

```bash
BETABOT_APP_URL=http://localhost:5173 \
BETABOT_THOUGHTFUL_COUNT=5 \
BETABOT_THOUGHTFUL_MINUTES=8 \
BETABOT_HEADLESS=false \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

By default, thoughtful mode uses real-time pacing (`BETABOT_TIME_SCALE=1`). Lower the scale only for development dry-runs.

For apps with local E2E auth, seed a separate browser account per bot:

```bash
BETABOT_AUTH_LOCAL_STORAGE_KEY=your.auth.storage.key \
BETABOT_AUTH_TOKEN_TEMPLATE='dev-token:{id}' \
node skills/betabots/scripts/thoughtful_browser_betabots.cjs
```

`{id}`, `{name}`, and `{role}` are replaced per bot so sessions do not accidentally share user state.

## Repository Layout

```text
.codex-plugin/plugin.json      Codex plugin manifest
.claude-plugin/plugin.json     Claude Code plugin manifest
.cursor-plugin/plugin.json     Cursor plugin manifest
skills/betabots/SKILL.md       Main Betabots skill
skills/betabots/scripts/       Cohort, analysis, and live simulation scripts
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
BETABOT_SESSIONS=4 \
BETABOT_CONCURRENCY=16 \
BETABOT_BACKEND_URL=http://localhost:3001/api \
BETABOT_AUTH_TOKEN=your-dev-e2e-token \
node skills/betabots/scripts/multi_session_betabots.cjs
```

The bundled live runner is an adapter for products with endpoints similar to DnDate: profiles, characters, reactions, matches, messages, and tables. For other products, adapt the endpoint functions and keep the same artifact format.

Run thoughtful browser sessions:

```bash
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
