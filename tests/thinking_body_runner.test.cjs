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

test('runner executes multiple return sessions, checkpoints state, and combines the storyline', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-multi-session-runner-'))
  const runDir = path.join(temp, 'run')
  const storageState = path.join(temp, 'storage', 'thoughtful-betabot-001.json')
  fs.mkdirSync(path.dirname(storageState), { recursive: true })
  fs.writeFileSync(storageState, JSON.stringify({ cookies: [], origins: [] }))
  const result = spawnSync(process.execPath, [
    path.join(root, 'skills/betabots/scripts/thoughtful_browser_betabots.cjs'),
  ], {
    cwd: temp,
    encoding: 'utf8',
    timeout: 45000,
    env: {
      ...process.env,
      BETABOT_APP_URL: `file://${path.join(root, 'tests/fixtures/thinking-body-app.html')}`,
      BETABOT_COHORT_FILE: path.join(root, 'tests/fixtures/thinking-body-cohort.json'),
      BETABOT_RUN_DIR: runDir,
      BETABOT_THOUGHTFUL_COUNT: '1',
      BETABOT_SESSION_COUNT: '2',
      BETABOT_SESSION_GAP_MINUTES: '0',
      BETABOT_STORAGE_STATE_TEMPLATE: storageState,
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
  const persisted = JSON.parse(fs.readFileSync(storageState, 'utf8'))

  assert.equal(summary.config.sessionCount, 2)
  assert.equal(summary.results[0].sessionsCompleted, 2)
  assert.equal(summary.results[0].sessionResults.length, 2)
  assert.match(raw, /## Session 1 — Discovery/)
  assert.match(raw, /## Session 2 — Return/)
  assert.ok(Array.isArray(persisted.cookies))
})

test('runner completes a goal whose visible proof is split across two sessions', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-cross-session-goal-runner-'))
  const runDir = path.join(temp, 'run')
  const storageState = path.join(temp, 'storage', 'cross-session-betabot-001.json')
  fs.mkdirSync(path.dirname(storageState), { recursive: true })
  fs.writeFileSync(storageState, JSON.stringify({ cookies: [], origins: [] }))
  const result = spawnSync(process.execPath, [
    path.join(root, 'skills/betabots/scripts/thoughtful_browser_betabots.cjs'),
  ], {
    cwd: temp,
    encoding: 'utf8',
    timeout: 45000,
    env: {
      ...process.env,
      BETABOT_APP_URL: `file://${path.join(root, 'tests/fixtures/cross-session-goal-app.html')}`,
      BETABOT_COHORT_FILE: path.join(root, 'tests/fixtures/cross-session-goal-cohort.json'),
      BETABOT_RUN_DIR: runDir,
      BETABOT_THOUGHTFUL_COUNT: '1',
      BETABOT_SESSION_COUNT: '2',
      BETABOT_SESSION_GAP_MINUTES: '0',
      BETABOT_STORAGE_STATE_TEMPLATE: storageState,
      BETABOT_HEADLESS: 'true',
      BETABOT_LLM_PROVIDER: 'codex',
      BETABOT_CODEX_COMMAND: path.join(root, 'tests/fixtures/fake-cross-session-codex-mind.cjs'),
      BETABOT_LLM_TIMEOUT_MS: '5000',
      BETABOT_ACTION_TIMEOUT_MS: '5000',
    },
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = JSON.parse(fs.readFileSync(path.join(runDir, 'summary.json'), 'utf8'))
  const bot = summary.results[0]

  assert.equal(bot.sessionResults[0].goalAssessment.achieved, false)
  assert.equal(bot.sessionResults[1].goalAssessment.achieved, true)
  assert.equal(bot.goalAssessment.achieved, true)
  assert.ok(bot.sessionResults[1].errors.every((error) => /environment integrity invalid/i.test(error)))
})

test('runner preserves a completed goal when a no-action return assessment forgets old proof', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-completed-goal-return-runner-'))
  const runDir = path.join(temp, 'run')
  const storageState = path.join(temp, 'storage', 'thoughtful-betabot-001.json')
  fs.mkdirSync(path.dirname(storageState), { recursive: true })
  fs.writeFileSync(storageState, JSON.stringify({ cookies: [], origins: [] }))
  const result = spawnSync(process.execPath, [
    path.join(root, 'skills/betabots/scripts/thoughtful_browser_betabots.cjs'),
  ], {
    cwd: temp,
    encoding: 'utf8',
    timeout: 45000,
    env: {
      ...process.env,
      BETABOT_APP_URL: `file://${path.join(root, 'tests/fixtures/thinking-body-app.html')}`,
      BETABOT_COHORT_FILE: path.join(root, 'tests/fixtures/thinking-body-cohort.json'),
      BETABOT_RUN_DIR: runDir,
      BETABOT_THOUGHTFUL_COUNT: '1',
      BETABOT_SESSION_COUNT: '2',
      BETABOT_SESSION_GAP_MINUTES: '0',
      BETABOT_STORAGE_STATE_TEMPLATE: storageState,
      BETABOT_HEADLESS: 'true',
      BETABOT_LLM_PROVIDER: 'codex',
      BETABOT_CODEX_COMMAND: path.join(root, 'tests/fixtures/fake-completed-goal-return-mind.cjs'),
      BETABOT_LLM_TIMEOUT_MS: '5000',
      BETABOT_ACTION_TIMEOUT_MS: '5000',
    },
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = JSON.parse(fs.readFileSync(path.join(runDir, 'summary.json'), 'utf8'))
  const bot = summary.results[0]

  assert.equal(bot.sessionResults[0].goalAssessment.achieved, true)
  assert.equal(bot.sessionResults[1].actions, 0)
  assert.equal(bot.sessionResults[1].goalAssessment.achieved, true)
  assert.match(bot.sessionResults[1].goalAssessment.reason, /already proven/i)
})

test('runner surfaces unmet product evidence and prevents a happy score', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-required-evidence-runner-'))
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
      BETABOT_MIN_AI_USER_TURNS: '2',
      BETABOT_MIN_COMPLETED_ACTIVITIES: '1',
      BETABOT_HEADLESS: 'true',
      BETABOT_LLM_PROVIDER: 'codex',
      BETABOT_CODEX_COMMAND: path.join(root, 'tests/fixtures/fake-codex-mind.cjs'),
      BETABOT_LLM_TIMEOUT_MS: '5000',
      BETABOT_ACTION_TIMEOUT_MS: '5000',
    },
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const summary = JSON.parse(fs.readFileSync(path.join(runDir, 'summary.json'), 'utf8'))
  const evidence = summary.results[0].evidenceRequirements

  assert.equal(evidence.met, false)
  assert.equal(evidence.observed.aiUserTurns, 0)
  assert.equal(evidence.observed.completedActivities, 0)
  assert.ok(summary.results[0].score <= 49)
  assert.match(summary.results[0].endReason, /required product evidence/i)
})
