#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 "$ROOT/skills/betabots/scripts/generate_cohort.py" --count 3 --seed 42 --product "Smoke app" >/tmp/betabots-cohort.json
python3 -m json.tool /tmp/betabots-cohort.json >/dev/null
python3 -m json.tool "$ROOT/skills/betabots/examples/generic-saas.cohort.json" >/dev/null
python3 -m json.tool "$ROOT/skills/betabots/examples/dndate.cohort.json" >/dev/null
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
node --check "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs" >/dev/null
grep -q "BETABOT_BETABOOK" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_DESTINY" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "betabook.json" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "destiny.json" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
BETABOT_COHORT_FILE="$ROOT/skills/betabots/examples/generic-saas.cohort.json" \
BETABOT_THOUGHTFUL_COUNT=1 \
BETABOT_RUN_DIR=/tmp/betabots-loader-check \
node -e "const fs=require('fs'); const p=require('path'); process.chdir('$ROOT'); const script=fs.readFileSync('skills/betabots/scripts/thoughtful_browser_betabots.cjs','utf8'); if (!script.includes('BETABOT_COHORT_FILE')) process.exit(1)"
echo "betabots smoke ok"
