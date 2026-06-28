#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 "$ROOT/skills/betabots/scripts/generate_cohort.py" --count 3 --seed 42 --product "Smoke app" >/tmp/betabots-cohort.json
python3 -m json.tool /tmp/betabots-cohort.json >/dev/null
mkdir -p /tmp/betabots-raw
cat >/tmp/betabots-raw/bot.md <<'MD'
# bot — Raw Storyline

## Raw Journey
- I feel confused but then find value.

## Session End
- End reason: completed session and will come back later
MD
python3 "$ROOT/skills/betabots/scripts/analyze_sessions.py" /tmp/betabots-raw >/tmp/betabots-analysis.md
grep -q "Sessions analyzed: 1" /tmp/betabots-analysis.md
node --check "$ROOT/skills/betabots/scripts/multi_session_betabots.cjs" >/dev/null
