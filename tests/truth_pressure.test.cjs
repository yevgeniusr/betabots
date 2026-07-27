const test = require('node:test')
const assert = require('node:assert/strict')

const { extractCommittedDollars } = require('../skills/betabots/scripts/truth_pressure.cjs')

test('does not treat visible prices, budgets, headlines, or hypothetical allocations as committed money', () => {
  assert.equal(extractCommittedDollars('clicked Oil crossed $100 and rates rose'), 0)
  assert.equal(extractCommittedDollars('my assigned budget is $10,000'), 0)
  assert.equal(extractCommittedDollars('hypothetical $25,000 allocation'), 0)
  assert.equal(extractCommittedDollars('clicked Go Pro $997/year'), 0)
})

test('counts only explicit past-tense spending or commitment phrases', () => {
  assert.equal(extractCommittedDollars('paid $12.50'), 12.5)
  assert.equal(extractCommittedDollars('committed $1,200 to the reservation'), 1200)
  assert.equal(extractCommittedDollars('spent $500 and paid $25'), 525)
})
