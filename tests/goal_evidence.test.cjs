const test = require('node:test')
const assert = require('node:assert/strict')

const {
  appendGoalEvidence,
  buildGoalEvidenceText,
  validateSignalClaims,
} = require('../skills/betabots/scripts/goal_evidence.cjs')

test('goal evidence retains complete text from planned and curiosity screens', () => {
  const evidence = []
  appendGoalEvidence(evidence, {
    phase: 'planned route',
    url: 'http://localhost:3012/organization#exams',
    title: 'Organization',
    text: `${'navigation '.repeat(120)}Exam blueprints cover theory and practice. Approved activity inventory contains six simulators.`,
  })
  appendGoalEvidence(evidence, {
    phase: 'curiosity',
    url: 'http://localhost:3012/organization#results',
    title: 'Results',
    text: 'Evidence integrity trail SHA-256 abc123. Mentor attestation recorded.',
  })

  const text = buildGoalEvidenceText(evidence)

  assert.match(text, /Exam blueprints cover theory and practice/)
  assert.match(text, /Approved activity inventory contains six simulators/)
  assert.match(text, /Evidence integrity trail SHA-256 abc123/)
  assert.match(text, /Mentor attestation recorded/)
})

test('semantic success signals count only when the model cites recorded UI evidence', () => {
  const evidenceText = [
    'First-valid verification result for E2E employee.',
    'Evidence integrity trail SHA-256 abc123.',
  ].join('\n')

  const results = validateSignalClaims(
    ['Verification results', 'Signed evidence trail'],
    [
      {
        signal: 'Verification results',
        observed: true,
        evidence: 'First-valid verification result for E2E employee.',
      },
      {
        signal: 'Signed evidence trail',
        observed: true,
        evidence: 'Evidence integrity trail SHA-256 abc123.',
      },
    ],
    evidenceText,
  )

  assert.deepEqual(results.map(({ signal, observed }) => ({ signal, observed })), [
    { signal: 'Verification results', observed: true },
    { signal: 'Signed evidence trail', observed: true },
  ])
})

test('a hallucinated evidence citation cannot satisfy a success signal', () => {
  const results = validateSignalClaims(
    ['Mentor attestation'],
    [{ signal: 'Mentor attestation', observed: true, evidence: 'Mentor attestation signed by Jordan.' }],
    'Evidence integrity trail SHA-256 abc123.',
  )

  assert.equal(results[0].observed, false)
})
