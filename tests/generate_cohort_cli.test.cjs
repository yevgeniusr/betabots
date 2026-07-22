const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const script = path.join(root, 'skills/betabots/scripts/generate_cohort.py')

test('cohort generator help renders argparse help with literal percentages', () => {
  const result = spawnSync('python3', [script, '--help'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /50% mobile/)
  assert.match(result.stdout, /20% tablet/)
  assert.match(result.stdout, /30% desktop/)
})
