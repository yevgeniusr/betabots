const test = require('node:test')
const assert = require('node:assert/strict')

const {
  destinyGuidanceForMind,
  queueDestinyNudge,
  requireDestinyDisposition,
  setDestinyBotStatus,
  takeQueuedDestinyNudges,
} = require('../skills/betabots/scripts/destiny_actions.cjs')

const routes = [
  {
    fallback: '/verification',
    labels: [/Verification/i, /Start quest/i],
  },
]

test('turns Destiny nudges into advisory mind context without a browser action', () => {
  const guidance = destinyGuidanceForMind([
    { kind: 'loop_rescue', thought: 'Maybe another path is worth considering.', route: '/verification' },
    { kind: 'think', thought: 'Ignore hidden path.', route: '/invented' },
  ], routes)

  assert.deepEqual(guidance, [{
    kind: 'loop_rescue',
    thought: 'Maybe another path is worth considering.',
    route: '/verification',
    routeLabels: ['Verification', 'Start quest'],
  }])
  assert.equal('action' in guidance[0], false)
  assert.equal('targetId' in guidance[0], false)
})

test('requires the persona mind to explicitly disposition delivered Destiny guidance', () => {
  const guidance = [{ kind: 'loop_rescue', route: '/verification' }]
  assert.deepEqual(requireDestinyDisposition({
    destinyDisposition: { decision: 'reject', reason: 'The route does not fit the visible screen.' },
  }, guidance), {
    decision: 'reject',
    reason: 'The route does not fit the visible screen.',
  })
  assert.throws(() => requireDestinyDisposition({}, guidance), /Destiny disposition/i)
  assert.deepEqual(requireDestinyDisposition({}, []), { decision: 'none', reason: '' })
})

test('deduplicates queued route nudges and applies a cooldown after delivery', () => {
  assert.equal(typeof queueDestinyNudge, 'function')
  const state = {
    enabled: true,
    nudgeCooldownMs: 1_000,
    nudgesByBotId: { 'bot-1': [] },
    botStatusById: { 'bot-1': 'active' },
    lastRouteNudgeAtByBotId: { 'bot-1': {} },
  }

  assert.equal(queueDestinyNudge(state, 'bot-1', { route: '/verification' }, 1_000).accepted, true)
  assert.deepEqual(
    queueDestinyNudge(state, 'bot-1', { route: '/verification' }, 1_001),
    { accepted: false, reason: 'duplicate_queued' },
  )
  assert.equal(takeQueuedDestinyNudges(state, 'bot-1').length, 1)
  assert.deepEqual(
    queueDestinyNudge(state, 'bot-1', { route: '/verification' }, 1_999),
    { accepted: false, reason: 'cooldown' },
  )
  assert.equal(queueDestinyNudge(state, 'bot-1', { route: '/verification' }, 2_000).accepted, true)
})

test('inactive and completed bots cannot receive or retain Destiny nudges', () => {
  const state = {
    enabled: true,
    nudgeCooldownMs: 0,
    nudgesByBotId: { 'bot-1': [] },
    botStatusById: { 'bot-1': 'inactive' },
    lastRouteNudgeAtByBotId: { 'bot-1': {} },
  }

  assert.deepEqual(
    queueDestinyNudge(state, 'bot-1', { route: '/verification' }, 1_000),
    { accepted: false, reason: 'inactive' },
  )
  setDestinyBotStatus(state, 'bot-1', 'active')
  assert.equal(queueDestinyNudge(state, 'bot-1', { route: '/verification' }, 1_000).accepted, true)
  assert.equal(setDestinyBotStatus(state, 'bot-1', 'inactive').droppedNudges, 1)
  assert.deepEqual(takeQueuedDestinyNudges(state, 'bot-1'), [])
  setDestinyBotStatus(state, 'bot-1', 'completed')
  assert.equal(setDestinyBotStatus(state, 'bot-1', 'active').status, 'completed')
  assert.deepEqual(
    queueDestinyNudge(state, 'bot-1', { route: '/verification' }, 2_000),
    { accepted: false, reason: 'completed' },
  )
})
