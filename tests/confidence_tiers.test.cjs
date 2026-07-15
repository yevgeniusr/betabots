const test = require('node:test')
const assert = require('node:assert/strict')

const { buildConfidenceRows } = require('../skills/betabots/scripts/confidence_tiers.cjs')

test('repeated ideas from one bot remain low confidence', () => {
  const results = [
    { id: 'bot-1', ideas: Array(8).fill('Show evidence behind the result.') },
    { id: 'bot-2', ideas: [] },
    { id: 'bot-3', ideas: [] },
    { id: 'bot-4', ideas: [] },
    { id: 'bot-5', ideas: [] },
  ]

  const [row] = buildConfidenceRows(results)

  assert.equal(row.botCount, 1)
  assert.equal(row.mentions, 8)
  assert.equal(row.tier, 'low')
})

test('a theme repeated by at least 25 percent of a cohort is high confidence', () => {
  const results = [
    { id: 'bot-1', ideas: ['Show evidence behind the result.'] },
    { id: 'bot-2', ideas: ['Give the result an evidence trail.'] },
    { id: 'bot-3', ideas: [] },
    { id: 'bot-4', ideas: [] },
    { id: 'bot-5', ideas: [] },
  ]

  const [row] = buildConfidenceRows(results)

  assert.equal(row.botCount, 2)
  assert.equal(row.tier, 'high')
})
