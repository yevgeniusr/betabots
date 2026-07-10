#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 "$ROOT/skills/betabots/scripts/generate_cohort.py" --count 3 --seed 42 --product "Smoke app" >/tmp/betabots-cohort.json
python3 -m json.tool /tmp/betabots-cohort.json >/dev/null
python3 -m json.tool "$ROOT/skills/betabots/examples/generic-saas.cohort.json" >/dev/null
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
node --check "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs" >/dev/null
node --check "$ROOT/web/server.cjs" >/dev/null
test ! -e "$ROOT/skills/betabots/scripts/multi_session_betabots.cjs"
test ! -e "$ROOT/skills/betabots/references/live-simulation.md"
test ! -e "$ROOT/skills/betabots/examples/dndate.cohort.json"
! grep -R -E 'BETABOT_PRODUCT_ADAPTER_FILE|BETABOT_BACKEND_URL|multi_session_betabots|live-simulation|Fast mode|fast mode|DnDate|/characters|/reactions|/matches|/likes-you|/tables|charactersByBotId|table-talk|Create your first character|character required|discover characters|browse tables|productAdapter|backendUrl' "$ROOT/README.md" "$ROOT/docs" "$ROOT/skills/betabots" "$ROOT/web" >/dev/null
grep -q "BETABOT_BETABOOK" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_DESTINY" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_AVATAR_STYLE" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "bottts-neutral" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_LLM_PROVIDER" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_BROWSER_EXECUTABLE_PATH" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "browserExecutablePath" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "requiresSocialAction" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "shouldEndSession" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "reflectionTimeoutMs" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "fallbackActionAttempts" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "visitedRoutes" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "cohort.requiresSocialAction && stats.fallbackActionAttempts" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "intersectsViewport" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "callCodex" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "callOpenRouter" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
! grep -R -E 'BETABOT_MORTAL_TRUTH|mortalTruth|config\.mortalTruthEnabled|Mortal truth mode|mortal-truth mode|non-mortal-truth|Mortal Truth|Truth Notes' "$ROOT/README.md" "$ROOT/docs" "$ROOT/skills/betabots" "$ROOT/web" >/dev/null
grep -q "Truth pressure is always enabled" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "truthPressureRules" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "lifeCostJustification" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "Screenshot evidence" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "betabook.json" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "destiny.json" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "Betabots Dashboard" "$ROOT/web/static/index.html"
grep -q "betabots-logo.png" "$ROOT/web/static/index.html"
grep -q "betabots-mark.png" "$ROOT/web/static/index.html"
grep -q "Betabots" "$ROOT/assets/betabots.svg"
grep -q "/api/runs" "$ROOT/web/server.cjs"
BETABOT_COHORT_FILE="$ROOT/skills/betabots/examples/generic-saas.cohort.json" \
BETABOT_THOUGHTFUL_COUNT=1 \
BETABOT_RUN_DIR=/tmp/betabots-loader-check \
node -e "const fs=require('fs'); const p=require('path'); process.chdir('$ROOT'); const script=fs.readFileSync('skills/betabots/scripts/thoughtful_browser_betabots.cjs','utf8'); if (!script.includes('BETABOT_COHORT_FILE')) process.exit(1)"
BETABOT_COHORT_FILE="$ROOT/skills/betabots/examples/generic-saas.cohort.json" \
BETABOT_COHORT_ONLY=true \
BETABOT_THOUGHTFUL_COUNT=1 \
BETABOT_RUN_DIR=/tmp/betabots-avatar-check \
node "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs" >/tmp/betabots-avatar-check.json
python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path('/tmp/betabots-avatar-check/cohort.json').read_text())
avatar = data['bots'][0]['avatar']
assert avatar['provider'] == 'dicebear'
assert avatar['style'] == 'bottts-neutral'
assert 'https://api.dicebear.com/10.x/bottts-neutral/svg?' in avatar['url']
assert 'seed=' in avatar['url']
PY
echo "betabots smoke ok"
