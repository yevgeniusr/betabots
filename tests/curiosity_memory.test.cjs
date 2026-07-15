const test = require('node:test')
const assert = require('node:assert/strict')

const { claimCuriosityTarget } = require('../skills/betabots/scripts/curiosity_memory.cjs')

test('a curiosity target can only be claimed once per session', () => {
  const seen = new Set()

  assert.equal(claimCuriosityTarget(seen, ' Social '), true)
  assert.equal(claimCuriosityTarget(seen, 'social'), false)
  assert.equal(claimCuriosityTarget(seen, 'Results'), true)
})
