const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')

test('runner captures a screenshot, asks the mind, and executes its action', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-thinking-runner-'))
  const runDir = path.join(temp, 'run')
  const result = spawnSync(process.execPath, [
    path.join(root, 'skills/betabots/scripts/thoughtful_browser_betabots.cjs'),
  ], {
    cwd: temp,
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      BETABOT_APP_URL: `file://${path.join(root, 'tests/fixtures/thinking-body-app.html')}`,
      BETABOT_COHORT_FILE: path.join(root, 'tests/fixtures/thinking-body-cohort.json'),
      BETABOT_RUN_DIR: runDir,
      BETABOT_THOUGHTFUL_COUNT: '1',
      BETABOT_HEADLESS: 'true',
      BETABOT_LLM_PROVIDER: 'codex',
      BETABOT_CODEX_COMMAND: path.join(root, 'tests/fixtures/fake-codex-mind.cjs'),
      BETABOT_LLM_TIMEOUT_MS: '5000',
      BETABOT_ACTION_TIMEOUT_MS: '5000',
    },
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = JSON.parse(fs.readFileSync(path.join(runDir, 'summary.json'), 'utf8'))
  const raw = fs.readFileSync(path.join(runDir, 'raw/thoughtful-betabot-001.md'), 'utf8')
  assert.equal(summary.results[0].mindActions, 1)
  assert.equal(summary.results[0].actions, 1)
  assert.equal(summary.results[0].screenshots, 2)
  assert.equal(summary.llm.tasks.betabot_reflection, 1)
  assert.match(raw, /Screenshot evidence \(arrival\)/)
  assert.match(raw, /I decide to click control-1/)
  assert.match(raw, /My body clicked Continue/)
  assert.match(raw, /Screenshot evidence \(post-mind-action\)/)
})
