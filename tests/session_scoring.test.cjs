const test = require('node:test')
const assert = require('node:assert/strict')

const {
  scoreMultiSessionJourney,
  scoreSession,
} = require('../skills/betabots/scripts/session_scoring.cjs')

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

test('an honest no-action return keeps its retained-goal score without hiding trust or error penalties', () => {
  const retainedReturn = scoreSession({
    ...base,
    value: 45,
    trust: 45,
    elapsedMs: 0,
    endedByChoice: false,
    goalAssessment: {
      achieved: true,
      retainedFromPriorSession: true,
      confidence: 0.94,
    },
  })
  const troubledReturn = scoreSession({
    ...base,
    value: 45,
    trust: 25,
    errors: ['HTTP 500 on /results'],
    elapsedMs: 0,
    endedByChoice: false,
    goalAssessment: {
      achieved: true,
      retainedFromPriorSession: true,
      confidence: 0.94,
    },
  })

  assert.equal(retainedReturn, 90)
  assert.equal(troubledReturn, 50)
  assert.equal(scoreMultiSessionJourney([
    { score: 60 },
    { score: retainedReturn },
  ], { met: true }), 75)
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

test('a completed cross-session goal keeps a real earlier browser error represented in the journey score', () => {
  const firstSessionScore = scoreSession({
    ...base,
    value: 35,
    trust: 45,
    errors: ['HTTP 500 on /results'],
    goalAssessment: { achieved: false, confidence: 0.7 },
  })
  const secondSessionScore = scoreSession({
    ...base,
    value: 45,
    trust: 45,
    errors: [],
    goalAssessment: { achieved: true, confidence: 0.94 },
  })

  assert.equal(firstSessionScore, 60)
  assert.equal(secondSessionScore, 90)
  assert.equal(scoreMultiSessionJourney([
    { score: firstSessionScore, errors: ['HTTP 500 on /results'] },
    { score: secondSessionScore, errors: [] },
  ], { met: true }), 70)
})

test('cumulative goal completion does not bypass unmet product-evidence requirements', () => {
  const returnScore = scoreSession({
    ...base,
    value: 45,
    trust: 45,
    errors: [],
    goalAssessment: { achieved: true, confidence: 0.93 },
  })

  assert.equal(returnScore, 90)
  assert.equal(scoreMultiSessionJourney([{ score: returnScore }], { met: false }), 49)
})

test('a low-information retained-goal return contributes lightly to the journey score', () => {
  const sessions = [
    {
      score: 81,
      actions: 9,
      errors: [],
      browserIssues: 0,
      goalAssessment: { achieved: true },
    },
    {
      score: 29,
      actions: 0,
      errors: [],
      browserIssues: 0,
      goalAssessment: { achieved: true, retainedFromPriorSession: true },
    },
  ]

  assert.equal(scoreMultiSessionJourney(sessions, { met: true }), 76)
  assert.equal(scoreMultiSessionJourney(sessions, { met: false }), 49)
})

test('a real issue increases a low-action session contribution instead of disappearing', () => {
  const score = scoreMultiSessionJourney([
    { score: 81, actions: 9, errors: [], browserIssues: 0 },
    {
      score: 29,
      actions: 0,
      errors: ['HTTP 500 on /results'],
      browserIssues: 1,
      goalAssessment: { achieved: true, retainedFromPriorSession: true },
    },
  ], { met: true })

  assert.equal(score, 72)
})
