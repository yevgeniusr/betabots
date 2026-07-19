#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 "$ROOT/skills/betabots/scripts/generate_cohort.py" --count 3 --seed 42 --product "Smoke app" >/tmp/betabots-cohort.json
python3 -m json.tool /tmp/betabots-cohort.json >/dev/null
python3 - <<'PY'
import json
from pathlib import Path
persona = json.loads(Path('/tmp/betabots-cohort.json').read_text())['personas'][0]
for field in ('lifeSituation', 'trigger', 'jobToBeDone', 'trustThreshold', 'decisionCriteria', 'abandonmentConditions', 'provenance'):
    assert persona[field], field
PY
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
node --check "$ROOT/skills/betabots/scripts/environment_integrity.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/screen_identity.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/keyword_scoring.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/goal_evidence.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/curiosity_memory.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/confidence_tiers.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/route_planning.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/thinking_body.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/session_scheduler.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/browser_issue_recovery.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/destiny_actions.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/persona_generation.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/social_provenance.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/product_evidence.cjs" >/dev/null
node --check "$ROOT/skills/betabots/scripts/vision_payload.cjs" >/dev/null
node --test "$ROOT/tests/environment_integrity.test.cjs" >/dev/null
node --test "$ROOT/tests/screen_identity.test.cjs" >/dev/null
node --test "$ROOT/tests/keyword_scoring.test.cjs" >/dev/null
node --test "$ROOT/tests/session_scoring.test.cjs" >/dev/null
node --test "$ROOT/tests/goal_evidence.test.cjs" >/dev/null
node --test "$ROOT/tests/curiosity_memory.test.cjs" >/dev/null
node --test "$ROOT/tests/confidence_tiers.test.cjs" >/dev/null
node --test "$ROOT/tests/route_planning.test.cjs" >/dev/null
node --test "$ROOT/tests/thinking_body.test.cjs" >/dev/null
node --test "$ROOT/tests/thinking_body_browser.test.cjs" >/dev/null
node --test "$ROOT/tests/thinking_body_runner.test.cjs" >/dev/null
node --test "$ROOT/tests/session_scheduler.test.cjs" >/dev/null
node --test "$ROOT/tests/session_state_browser.test.cjs" >/dev/null
node --test "$ROOT/tests/browser_issue_recovery.test.cjs" >/dev/null
node --test "$ROOT/tests/request_failure_browser.test.cjs" >/dev/null
node --test "$ROOT/tests/destiny_actions.test.cjs" >/dev/null
node --test "$ROOT/tests/persona_generation.test.cjs" >/dev/null
node --test "$ROOT/tests/social_provenance.test.cjs" >/dev/null
node --test "$ROOT/tests/product_evidence.test.cjs" >/dev/null
node --test "$ROOT/tests/vision_payload.test.cjs" >/dev/null
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
grep -q "BETABOT_PERSONAS_FILE" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_PERSONA_GUIDANCE" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_PERSONA_APPROVAL_MODE" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_PERSONAS_APPROVED" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_BROWSER_EXECUTABLE_PATH" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_REQUIRE_REAL_BACKEND" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_APP_ORIGINS" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_ENVIRONMENT_ATTESTATION_URL" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_STORAGE_STATE_TEMPLATE" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_SESSION_COUNT" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_SESSION_GAP_MINUTES" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_MIN_AI_USER_TURNS" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "BETABOT_MIN_COMPLETED_ACTIVITIES" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "browserExecutablePath" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "requiresSocialAction" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "shouldEndSession" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -Fq "stats.passes += 1" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -Fq "stats.passes || 0) * 35" "$ROOT/skills/betabots/scripts/session_scoring.cjs"
grep -q "reflectionTimeoutMs" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "continuityInstruction" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "seenScreens: seenScreens.slice" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "intersectsViewport" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -Fq "dt, dd, th, td" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "collectInteractiveControls" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "executeMindAction" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "screenshotAttached" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "codexImageArgs" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
grep -q "openRouterUserContent" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
! grep -q "page.goto.*route.fallback" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
! grep -q "page.goto.*nudge.route" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
! grep -q "findVisibleDestinyAction" "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs"
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
cat >/tmp/betabots-role-routes.json <<'JSON'
{
  "appName": "Role route smoke",
  "routes": [{"labels": ["global"], "fallback": "/global"}],
  "roles": [{
    "role": "administrator",
    "goal": "Inspect permissions",
    "successSignals": ["Permission controls"],
    "routes": [{"labels": ["permissions"], "fallback": "/permissions"}]
  }]
}
JSON
BETABOT_COHORT_FILE=/tmp/betabots-role-routes.json \
BETABOT_COHORT_ONLY=true \
BETABOT_THOUGHTFUL_COUNT=1 \
BETABOT_RUN_DIR=/tmp/betabots-role-routes-check \
node "$ROOT/skills/betabots/scripts/thoughtful_browser_betabots.cjs" >/tmp/betabots-role-routes-check.json
python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path('/tmp/betabots-role-routes-check/cohort.json').read_text())
bot = data['bots'][0]
assert bot['successSignals'] == ['Permission controls']
assert [route['fallback'] for route in bot['routes']] == ['/permissions']
PY
echo "betabots smoke ok"
