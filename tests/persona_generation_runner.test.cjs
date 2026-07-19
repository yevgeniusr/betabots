const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const runner = path.join(root, 'skills/betabots/scripts/thoughtful_browser_betabots.cjs')
const appUrl = `file://${path.join(root, 'tests/fixtures/thinking-body-app.html')}`
const fakeMind = path.join(root, 'tests/fixtures/fake-codex-mind.cjs')

function runGenerated(runDir, extraEnv = {}) {
  return spawnSync(process.execPath, [runner], {
    cwd: path.dirname(runDir),
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      BETABOT_APP_URL: appUrl,
      BETABOT_RUN_DIR: runDir,
      BETABOT_THOUGHTFUL_COUNT: '1',
      BETABOT_COHORT_ONLY: 'true',
      BETABOT_HEADLESS: 'true',
      BETABOT_LLM_PROVIDER: 'codex',
      BETABOT_CODEX_COMMAND: fakeMind,
      BETABOT_LLM_TIMEOUT_MS: '5000',
      BETABOT_PERSONA_GUIDANCE: 'Prioritize skeptical team adoption decisions.',
      ...extraEnv,
    },
  })
}

test('generates product-grounded personas and proceeds automatically by default', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-generated-personas-'))
  const runDir = path.join(temp, 'run')
  const result = runGenerated(runDir)

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const analysis = JSON.parse(fs.readFileSync(path.join(runDir, 'product-analysis.json'), 'utf8'))
  const generated = JSON.parse(fs.readFileSync(path.join(runDir, 'generated-personas.json'), 'utf8'))
  const cohort = JSON.parse(fs.readFileSync(path.join(runDir, 'cohort.json'), 'utf8'))
  assert.equal(analysis.analysis.productName, 'Thinking Body Fixture')
  assert.match(generated.guidance, /skeptical team adoption/i)
  assert.equal(generated.approval.mode, 'auto')
  assert.equal(generated.approval.proceeded, true)
  assert.equal(generated.personas[0].trustThreshold, 'I need a visible state change tied directly to my action.')
  assert.equal(cohort.bots[0].name, 'Samira Khan')
  assert.equal(cohort.bots[0].provenance.source, 'generated')
})

test('required approval writes artifacts and stops before cohort execution', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-required-personas-'))
  const runDir = path.join(temp, 'run')
  const result = runGenerated(runDir, { BETABOT_PERSONA_APPROVAL_MODE: 'required' })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const output = JSON.parse(result.stdout)
  const generated = JSON.parse(fs.readFileSync(path.join(runDir, 'generated-personas.json'), 'utf8'))
  assert.equal(output.approvalRequired, true)
  assert.equal(generated.approval.proceeded, false)
  assert.equal(fs.existsSync(path.join(runDir, 'summary.json')), false)
})

test('approved resume reuses the reviewed generated persona artifact', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-approved-personas-'))
  const runDir = path.join(temp, 'run')
  const first = runGenerated(runDir, { BETABOT_PERSONA_APPROVAL_MODE: 'required' })
  assert.equal(first.status, 0, first.stderr || first.stdout)
  const artifactFile = path.join(runDir, 'generated-personas.json')
  const reviewed = JSON.parse(fs.readFileSync(artifactFile, 'utf8'))
  reviewed.personas[0].name = 'Reviewed Samira'
  fs.writeFileSync(artifactFile, JSON.stringify(reviewed, null, 2))

  const resumed = runGenerated(runDir, {
    BETABOT_PERSONA_APPROVAL_MODE: 'required',
    BETABOT_PERSONAS_APPROVED: 'true',
    BETABOT_CODEX_COMMAND: path.join(temp, 'mind-must-not-run'),
  })

  assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout)
  const cohort = JSON.parse(fs.readFileSync(path.join(runDir, 'cohort.json'), 'utf8'))
  assert.equal(cohort.bots[0].name, 'Reviewed Samira')
})
