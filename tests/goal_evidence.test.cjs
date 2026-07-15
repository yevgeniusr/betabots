const test = require('node:test')
const assert = require('node:assert/strict')

const {
  appendGoalEvidence,
  buildCrossSessionGoalContext,
  buildGoalEvidenceText,
  finalizeGoalAssessment,
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

test('goal evidence retains the screenshot reference that grounded the visible text', () => {
  const evidence = []
  const entry = appendGoalEvidence(evidence, {
    phase: 'post-action',
    url: 'https://example.test/result',
    text: 'Verified result is visible.',
    screenshot: 'screenshots/bot-001/session-01/003-post-action.png',
  })

  assert.equal(entry.screenshot, 'screenshots/bot-001/session-01/003-post-action.png')
  assert.equal(evidence[0].screenshot, 'screenshots/bot-001/session-01/003-post-action.png')
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

test('cross-session goal context keeps prior screenshots and actions without carrying stale errors', () => {
  const context = buildCrossSessionGoalContext({
    runDir: '/tmp/betabots-run',
    previousSessions: [{
      sessionNumber: 1,
      errors: ['request failed: net::ERR_ABORTED on an old RSC request'],
      recentActions: ['clicked Inspect a sample result'],
      recentScreens: [{
        phase: 'post-mind-action',
        url: 'https://example.test/#sample-result',
        title: 'Sample result',
        visibleText: 'First-valid result with retained evidence and employee access.',
        screenshot: 'screenshots/bot-001/session-01/004-post-mind-action.png',
      }],
    }],
    currentActions: ['clicked Book a reskilling pilot'],
    currentScreens: [{
      phase: 'post-mind-action',
      url: 'https://example.test/#pilot',
      title: 'Pilot request',
      visibleText: 'Customer support pilot request form.',
      screenshot: 'screenshots/bot-001/session-02/003-post-mind-action.png',
    }],
  })

  assert.deepEqual(context.priorRecordedActions, [{
    sessionNumber: 1,
    action: 'clicked Inspect a sample result',
  }])
  assert.deepEqual(context.currentRecordedActions, ['clicked Book a reskilling pilot'])
  assert.equal(context.priorRecordedUiEvidence[0].sessionNumber, 1)
  assert.match(context.evidenceText, /First-valid result with retained evidence/)
  assert.match(context.evidenceText, /Customer support pilot request form/)
  assert.doesNotMatch(context.evidenceText, /ERR_ABORTED/)
  assert.deepEqual(context.screenshotPaths, [
    '/tmp/betabots-run/screenshots/bot-001/session-01/004-post-mind-action.png',
    '/tmp/betabots-run/screenshots/bot-001/session-02/003-post-mind-action.png',
  ])
})

test('cross-session goal context retains the complete prior goal ledger', () => {
  const oldTutorScreen = {
    phase: 'post-mind-action',
    url: 'https://example.test/chat/thread-1',
    visibleText: 'Third tutor response gave usable escalation criteria.',
  }
  const oldTutorAction = 'clicked Send message for the third tutor turn'
  const recentScreens = Array.from({ length: 4 }, (_, index) => ({
    visibleText: `Later result screen ${index + 1}`,
  }))
  const recentActions = Array.from({ length: 8 }, (_, index) => `later action ${index + 1}`)
  const context = buildCrossSessionGoalContext({
    previousSessions: [{
      sessionNumber: 1,
      goalScreens: [oldTutorScreen, ...recentScreens],
      goalActions: [oldTutorAction, ...recentActions],
      recentScreens,
      recentActions,
    }],
  })

  assert.match(context.evidenceText, /Third tutor response gave usable escalation criteria/)
  assert.match(context.evidenceText, /clicked Send message for the third tutor turn/)
  assert.equal(context.priorRecordedUiEvidence.length, 5)
  assert.equal(context.priorRecordedActions.length, 9)
})

test('a long-term goal may be proven by cited visible evidence split across sessions', () => {
  const context = buildCrossSessionGoalContext({
    previousSessions: [{
      sessionNumber: 1,
      recentActions: ['clicked Inspect a sample result'],
      recentScreens: [{
        visibleText: 'First-valid verification result for an employee.',
      }],
    }],
    currentActions: ['clicked Book a reskilling pilot'],
    currentScreens: [{
      visibleText: 'Customer support pilot request form is ready.',
    }],
  })
  const assessment = finalizeGoalAssessment({
    requiredSignals: ['Verification result inspected', 'Pilot request opened'],
    evidenceText: context.evidenceText,
    assessment: {
      achieved: true,
      confidence: 0.94,
      reason: 'The result was inspected in session 1 and the pilot form was opened in session 2.',
      signalResults: [
        {
          signal: 'Verification result inspected',
          observed: true,
          evidence: 'First-valid verification result for an employee.',
        },
        {
          signal: 'Pilot request opened',
          observed: true,
          evidence: 'Customer support pilot request form is ready.',
        },
      ],
    },
  })

  assert.equal(assessment.achieved, true)
  assert.equal(assessment.confidence, 0.94)
  assert.deepEqual(assessment.signalResults.map((result) => result.observed), [true, true])
})

test('a previously achieved long-term goal remains achieved on a no-action return session', () => {
  const priorAssessment = {
    achieved: true,
    confidence: 0.93,
    reason: 'The sample result and pilot request were visibly completed in session 1.',
    signalResults: [
      {
        signal: 'Verification result inspected',
        observed: true,
        evidence: 'Sample verification result inspected with retained evidence.',
      },
      {
        signal: 'Pilot request opened',
        observed: true,
        evidence: 'Pilot request opened for customer support.',
      },
    ],
  }
  const assessment = finalizeGoalAssessment({
    requiredSignals: ['Verification result inspected', 'Pilot request opened'],
    evidenceText: 'Welcome back. No new action was taken.',
    assessment: {
      achieved: false,
      confidence: 0.4,
      reason: 'This return session did not repeat the earlier actions.',
      signalResults: [],
    },
    priorAchievedAssessment: priorAssessment,
  })

  assert.equal(assessment.achieved, true)
  assert.equal(assessment.retainedFromPriorSession, true)
  assert.equal(assessment.confidence, 0.93)
  assert.match(assessment.reason, /already proven/i)
  assert.deepEqual(assessment.signalResults, priorAssessment.signalResults)
})

test('prior completion cannot satisfy a newly added required success signal', () => {
  const assessment = finalizeGoalAssessment({
    requiredSignals: ['Verification result inspected', 'New required activity'],
    evidenceText: 'Welcome back.',
    assessment: { achieved: false, signalResults: [] },
    priorAchievedAssessment: {
      achieved: true,
      confidence: 0.9,
      reason: 'The old goal was completed.',
      signalResults: [{
        signal: 'Verification result inspected',
        observed: true,
        evidence: 'Verification result inspected.',
      }],
    },
  })

  assert.equal(assessment.achieved, false)
  assert.equal(assessment.retainedFromPriorSession, false)
  assert.deepEqual(assessment.signalResults.map((result) => result.observed), [true, false])
})
