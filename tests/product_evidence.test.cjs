const test = require('node:test')
const assert = require('node:assert/strict')

const {
  applyEvidenceAssessmentToScore,
  createEvidenceTracker,
  evaluateEvidenceRequirements,
  normalizeEvidenceRequirements,
  mergeEvidenceRequirements,
  recordEvidenceAction,
  recordEvidenceObservation,
} = require('../skills/betabots/scripts/product_evidence.cjs')

test('counts an AI user turn only after typed text is visibly submitted in chat', () => {
  const tracker = createEvidenceTracker({ minAiUserTurns: 2 })

  recordEvidenceAction(tracker, {
    action: { type: 'click' },
    control: { kind: 'button', name: 'Send message' },
    url: 'https://example.test/chat/thread-1',
  })
  assert.equal(tracker.aiUserTurns, 0)

  for (const value of ['First question', 'Follow-up question']) {
    recordEvidenceAction(tracker, {
      action: { type: 'fill', value },
      control: { kind: 'textbox', name: 'Message' },
      url: 'https://example.test/chat/thread-1',
    })
    recordEvidenceAction(tracker, {
      action: { type: 'click' },
      control: { kind: 'button', name: 'Send message' },
      url: 'https://example.test/chat/thread-1',
      beforeText: 'AI coach ready',
    })
    assert.equal(tracker.aiUserTurns, value === 'First question' ? 0 : 1)
    recordEvidenceObservation(tracker, {
      url: 'https://example.test/chat/thread-1',
      text: `AI coach ready. You: ${value}. Assistant: Here is a substantive response with practical next steps.`,
    })
  }

  assert.equal(tracker.aiUserTurns, 2)
  assert.equal(evaluateEvidenceRequirements(tracker).met, true)
})

test('counts the first AI turn when chat creation redirects to a new thread URL', () => {
  const tracker = createEvidenceTracker({ minAiUserTurns: 1 })

  recordEvidenceAction(tracker, {
    action: { type: 'fill', value: 'Coach me through a refund decision' },
    control: { kind: 'textbox', name: 'Message' },
    url: 'https://example.test/chat?model=default',
  })
  recordEvidenceAction(tracker, {
    action: { type: 'click' },
    control: { kind: 'button', name: 'Send message' },
    url: 'https://example.test/chat?model=default',
    beforeText: 'AI coach ready',
  })
  recordEvidenceObservation(tracker, {
    url: 'https://example.test/chat/thread-1',
    text: 'Coach me through a refund decision. Start by checking the transaction evidence and escalation policy.',
  })

  assert.equal(tracker.aiUserTurns, 1)
  assert.equal(evaluateEvidenceRequirements(tracker).met, true)
})

test('counts a substantive same-chat response when the submitted prompt scrolls out of view', () => {
  const tracker = createEvidenceTracker({ minAiUserTurns: 1 })

  recordEvidenceAction(tracker, {
    action: { type: 'fill', value: 'Challenge my authorization-hold judgment' },
    control: { kind: 'textbox', name: 'Message' },
    url: 'https://example.test/chat/thread-1',
  })
  recordEvidenceAction(tracker, {
    action: { type: 'click' },
    control: { kind: 'button', name: 'Send message' },
    url: 'https://example.test/chat/thread-1',
    beforeText: 'Earlier billing discussion. Send message',
  })
  recordEvidenceObservation(tracker, {
    url: 'https://example.test/chat/thread-1',
    text: 'Explain that the authorization hold will expire, document the reference number, and escalate if the bank does not release it within the stated window.',
  })

  assert.equal(tracker.aiUserTurns, 1)
  assert.equal(evaluateEvidenceRequirements(tracker).met, true)
})

test('counts three AI turns when the first message starts outside the eventual chat route', () => {
  const tracker = createEvidenceTracker({
    minAiUserTurns: 3,
    aiChatUrlPatterns: ['/chat'],
    aiSubmitControlPatterns: ['Send message'],
  })
  const turns = [
    {
      composeUrl: 'https://example.test/home',
      responseUrl: 'https://example.test/chat/thread-1',
      value: 'Coach me through a duplicate billing complaint',
    },
    {
      composeUrl: 'https://example.test/chat/thread-1',
      responseUrl: 'https://example.test/chat/thread-1',
      value: 'Which transaction evidence should change my next step?',
    },
    {
      composeUrl: 'https://example.test/chat/thread-1',
      responseUrl: 'https://example.test/chat/thread-1',
      value: 'When should I escalate an authorization hold?',
    },
  ]

  for (const turn of turns) {
    recordEvidenceAction(tracker, {
      action: { type: 'fill', value: turn.value },
      control: { kind: 'textbox', name: 'Type your message...' },
      url: turn.composeUrl,
    })
    recordEvidenceAction(tracker, {
      action: { type: 'click' },
      control: { kind: 'button', name: 'Send message' },
      url: turn.composeUrl,
      beforeText: 'Dr. Sage is your private tutor.',
    })
    recordEvidenceObservation(tracker, {
      url: turn.responseUrl,
      text: `${turn.value} Assistant: Here is a substantive workplace response with practical escalation steps.`,
    })
  }

  const assessment = evaluateEvidenceRequirements(tracker)
  assert.equal(assessment.observed.aiUserTurns, 3)
  assert.equal(assessment.met, true)
})

test('aggregates distinct activity completions across logical sessions', () => {
  const tracker = createEvidenceTracker({ minCompletedActivities: 2 })

  for (const questId of ['conversation-console', 'policy-triage']) {
    const url = `https://example.test/verification/quests/${questId}`
    recordEvidenceAction(tracker, {
      action: { type: 'click' },
      control: { kind: 'button', name: 'Submit evidence' },
      url,
      beforeText: 'Scenario ready',
    })
    recordEvidenceObservation(tracker, {
      url,
      text: 'Valid attempt. Verification passed.',
    })
  }

  const assessment = evaluateEvidenceRequirements(tracker)
  assert.equal(assessment.observed.activityInteractions, 2)
  assert.equal(assessment.observed.completedActivities, 2)
  assert.equal(assessment.met, true)
})

test('does not count echoed text or a non-chat substring as an AI response', () => {
  const tracker = createEvidenceTracker({ minAiUserTurns: 1 })

  recordEvidenceAction(tracker, {
    action: { type: 'fill', value: 'hi' },
    control: { kind: 'textbox', name: 'Message' },
    url: 'https://example.test/chat/thread-1',
  })
  recordEvidenceAction(tracker, {
    action: { type: 'click' },
    control: { kind: 'button', name: 'Send message' },
    url: 'https://example.test/chat/thread-1',
    beforeText: 'AI coach ready',
  })

  recordEvidenceObservation(tracker, {
    url: 'https://example.test/dashboard',
    text: 'This dashboard has no AI response.',
  })
  recordEvidenceObservation(tracker, {
    url: 'https://example.test/chat/thread-1',
    text: 'AI coach ready. You: hi',
  })

  assert.equal(tracker.aiUserTurns, 0)
  assert.equal(evaluateEvidenceRequirements(tracker).met, false)
})

test('counts a completed activity only after an activity interaction and visible completion', () => {
  const tracker = createEvidenceTracker({ minCompletedActivities: 1 })

  recordEvidenceObservation(tracker, {
    url: 'https://example.test/verification/quests/quest-1',
    text: 'Scenario ready',
  })
  assert.equal(tracker.completedActivities, 0)

  recordEvidenceAction(tracker, {
    action: { type: 'click' },
    control: {
      kind: 'button',
      name: 'Continue',
      isMainFrame: false,
      frameUrl: 'https://simulator.example.test/run',
    },
    url: 'https://example.test/verification/quests/quest-1',
    beforeText: 'Scenario ready',
  })
  recordEvidenceObservation(tracker, {
    url: 'https://example.test/verification/quests/quest-1',
    text: 'Connected. Verification passed.',
  })
  recordEvidenceObservation(tracker, {
    url: 'https://example.test/verification/quests/quest-1',
    text: 'Connected. Verification passed.',
  })

  assert.equal(tracker.activityInteractions, 1)
  assert.equal(tracker.completedActivities, 1)
  assert.equal(evaluateEvidenceRequirements(tracker).met, true)
})

test('does not count stale completion text or an unrelated iframe control', () => {
  const tracker = createEvidenceTracker({ minCompletedActivities: 1 })

  recordEvidenceAction(tracker, {
    action: { type: 'click' },
    control: {
      kind: 'button',
      name: 'Pause video',
      isMainFrame: false,
      frameUrl: 'https://simulator.example.test/run',
    },
    url: 'https://example.test/verification/quests/quest-1',
    beforeText: 'Activity completed previously',
  })
  recordEvidenceObservation(tracker, {
    url: 'https://example.test/verification/quests/quest-1',
    text: 'Activity completed previously',
  })

  assert.equal(tracker.activityInteractions, 0)
  assert.equal(tracker.completedActivities, 0)
})

test('opening an activity route is not evidence of interacting with the activity', () => {
  const tracker = createEvidenceTracker({ minCompletedActivities: 1 })

  recordEvidenceAction(tracker, {
    action: { type: 'click' },
    control: { kind: 'link', name: 'Start quest', isMainFrame: true },
    url: 'https://example.test/verification/quests/quest-1',
  })
  recordEvidenceObservation(tracker, {
    url: 'https://example.test/verification/quests/quest-1',
    text: 'Verification passed',
  })

  assert.equal(tracker.activityInteractions, 0)
  assert.equal(tracker.completedActivities, 0)
})

test('activity completion requires interaction on the same canonical activity URL', () => {
  const tracker = createEvidenceTracker({ minCompletedActivities: 1 })

  recordEvidenceAction(tracker, {
    action: { type: 'click' },
    control: {
      kind: 'button',
      name: 'Continue',
      isMainFrame: false,
      frameUrl: 'https://simulator.example.test/run',
    },
    url: 'https://example.test/verification/quests/quest-1?attempt=1',
    beforeText: 'Scenario ready',
  })
  recordEvidenceObservation(tracker, {
    url: 'https://example.test/dashboard',
    text: 'Verification passed',
  })
  recordEvidenceObservation(tracker, {
    url: 'https://example.test/verification/quests/quest-2',
    text: 'Verification passed',
  })
  assert.equal(tracker.completedActivities, 0)

  recordEvidenceObservation(tracker, {
    url: 'https://example.test/verification/quests/quest-1?attempt=2#result',
    text: 'Verification passed',
  })
  recordEvidenceObservation(tracker, {
    url: 'https://example.test/verification/quests/quest-1?attempt=3',
    text: 'Verification passed',
  })

  assert.equal(tracker.activityInteractions, 1)
  assert.equal(tracker.completedActivities, 1)
  assert.equal(evaluateEvidenceRequirements(tracker).met, true)
})

test('merges role patterns while preserving cohort and run-wide evidence floors', () => {
  const requirements = mergeEvidenceRequirements(
    { minAiUserTurns: 3, minCompletedActivities: 1, aiSubmitControlPatterns: ['Send'] },
    { minAiUserTurns: 0, minCompletedActivities: 2, aiSubmitControlPatterns: ['Ask coach'] },
    { minAiUserTurns: 4, minCompletedActivities: 0 },
  )

  assert.equal(requirements.minAiUserTurns, 4)
  assert.equal(requirements.minCompletedActivities, 2)
  assert.deepEqual(requirements.aiSubmitControlPatterns, ['Ask coach'])
})

test('unmet required product evidence caps happiness below fifty and explains gaps', () => {
  const tracker = createEvidenceTracker({
    minAiUserTurns: 3,
    minCompletedActivities: 1,
  })
  tracker.aiUserTurns = 1

  const assessment = evaluateEvidenceRequirements(tracker)

  assert.equal(assessment.met, false)
  assert.deepEqual(assessment.failures, [
    { key: 'aiUserTurns', required: 3, observed: 1 },
    { key: 'completedActivities', required: 1, observed: 0 },
  ])
  assert.equal(applyEvidenceAssessmentToScore(92, assessment), 49)
})

test('normalizes numeric requirements and configurable UI patterns', () => {
  const requirements = normalizeEvidenceRequirements({
    minAiUserTurns: '2',
    minCompletedActivities: '1',
    aiChatUrlPatterns: ['/coach/'],
    aiSubmitControlPatterns: ['Ask coach'],
    activityInteractionPatterns: ['Submit scenario'],
    activityCompletionPatterns: ['Scenario complete'],
  })

  assert.equal(requirements.minAiUserTurns, 2)
  assert.equal(requirements.minCompletedActivities, 1)
  assert.deepEqual(requirements.aiChatUrlPatterns, ['/coach/'])
  assert.deepEqual(requirements.aiSubmitControlPatterns, ['Ask coach'])
  assert.deepEqual(requirements.activityInteractionPatterns, ['Submit scenario'])
  assert.deepEqual(requirements.activityCompletionPatterns, ['Scenario complete'])
})
