const test = require('node:test')
const assert = require('node:assert/strict')

const {
  findVisibleDestinyAction,
  queueDestinyNudge,
  setDestinyBotStatus,
  takeQueuedDestinyNudges,
} = require('../skills/betabots/scripts/destiny_actions.cjs')

const routes = [
  {
    fallback: '/verification',
    labels: [/Verification/i, /Start quest/i],
  },
]

test('turns a Destiny route intention into a click on a visible matching control', () => {
  const action = findVisibleDestinyAction(
    { route: '/verification' },
    [
      { id: 'control-1', kind: 'link', name: 'Dashboard', disabled: false },
      { id: 'control-2', kind: 'link', name: 'Verification', disabled: false },
    ],
    routes,
  )

  assert.deepEqual(action, {
    type: 'click',
    targetId: 'control-2',
    value: '',
  })
})

test('does not invent navigation when no matching visible control exists', () => {
  assert.equal(
    findVisibleDestinyAction(
      { route: '/verification' },
      [{ id: 'control-1', kind: 'link', name: 'Dashboard', disabled: false }],
      routes,
    ),
    null,
  )
})

test('does not select disabled controls or routes outside the configured journey', () => {
  assert.equal(
    findVisibleDestinyAction(
      { route: '/verification' },
      [{ id: 'control-2', kind: 'link', name: 'Verification', disabled: true }],
      routes,
    ),
    null,
  )
  assert.equal(
    findVisibleDestinyAction(
      { route: '/invented' },
      [{ id: 'control-2', kind: 'link', name: 'Verification', disabled: false }],
      routes,
    ),
    null,
  )
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
