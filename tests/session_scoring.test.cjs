const test = require('node:test')
const assert = require('node:assert/strict')

const { scoreSession } = require('../skills/betabots/scripts/session_scoring.cjs')

const base = {
  value: 55,
  trust: 65,
  errors: [],
  strictScoring: true,
  stats: {
    repeatedScreens: 0,
    passes: 0,
    likes: 0,
    meaningfulSocialActions: 0,
    loopHelpRequests: 0,
    loopRescuesFollowed: 0,
    navigationFallbacks: 0,
  },
  requiresSocialAction: false,
  elapsedMs: 6 * 60_000,
  minimumSessionMs: 6 * 60_000,
  goalAssessment: { achieved: true, confidence: 0.9 },
}

test('an unfinished persona goal cannot be scored as happy', () => {
  const score = scoreSession({
    ...base,
    goalAssessment: { achieved: false, confidence: 0.9 },
  })

  assert.equal(score, 69)
})

test('an unexplained early ending cannot be scored as happy', () => {
  const score = scoreSession({
    ...base,
    elapsedMs: 2 * 60_000,
    endedByChoice: false,
  })

  assert.equal(score, 49)
})

test('address-bar recovery lowers strict happiness scoring', () => {
  const score = scoreSession({
    ...base,
    value: 35,
    trust: 45,
    stats: { ...base.stats, navigationFallbacks: 3 },
  })

  assert.equal(score, 71)
})

test('browser errors remain a major penalty', () => {
  const score = scoreSession({
    ...base,
    value: 35,
    trust: 45,
    errors: ['HTTP 500 on /results'],
  })

  assert.equal(score, 60)
})
