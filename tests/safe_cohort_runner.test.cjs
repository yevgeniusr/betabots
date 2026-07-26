const test = require('node:test')
const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('runner seeds isolated states before cohort preparation without exposing storage contents', () => {
  const root = path.join(__dirname, '..')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-safe-cohort-'))
  const seedPath = path.join(directory, 'seed.json')
  const runDir = path.join(directory, 'run')
  const secret = 'synthetic-test-only-cookie-value'
  fs.writeFileSync(seedPath, JSON.stringify({ cookies: [{ name: 'session', value: secret }], origins: [] }))
  const result = childProcess.spawnSync(process.execPath, ['skills/betabots/scripts/thoughtful_browser_betabots.cjs'], {
    cwd: root,
    env: {
      ...process.env,
      BETABOT_COHORT_FILE: path.join(root, 'demo-cohorts', 'cryptonary-authenticated-platform.json'),
      BETABOT_COHORT_ONLY: 'true',
      BETABOT_THOUGHTFUL_COUNT: '2',
      BETABOT_STORAGE_STATE_SEED: seedPath,
      BETABOT_STORAGE_STATE_TEMPLATE: path.join(directory, 'states', '{id}.json'),
      BETABOT_RUN_DIR: runDir,
    },
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false)
  const snapshot = fs.readFileSync(path.join(runDir, 'cohort.json'), 'utf8')
  assert.equal(snapshot.includes(secret), false)
  assert.match(snapshot, /\[redacted\]/)
  for (const id of ['thoughtful-betabot-001', 'thoughtful-betabot-002']) {
    const destination = path.join(directory, 'states', `${id}.json`)
    assert.equal(fs.statSync(destination).mode & 0o777, 0o600)
  }
})
