const test = require('node:test')
const assert = require('node:assert/strict')

const {
  executeMindAction,
  normalizeMindDecision,
  validateMindAction,
} = require('../skills/betabots/scripts/thinking_body.cjs')

const controls = [
  { id: 'control-1', kind: 'button', name: 'View details', disabled: false },
  { id: 'control-2', kind: 'textbox', name: 'Message', disabled: false },
  { id: 'control-3', kind: 'button', name: 'Delete account', disabled: false },
]

test('normalizes one structured observe-think-act decision', () => {
  const decision = normalizeMindDecision({
    thought: 'The details may answer my question.',
    action: { type: 'click', targetId: 'control-1' },
  })

  assert.equal(decision.thought, 'The details may answer my question.')
  assert.deepEqual(decision.action, {
    type: 'click',
    targetId: 'control-1',
    value: '',
  })
})

test('accepts an action against a compatible visible control', () => {
  const result = validateMindAction(
    { type: 'fill', targetId: 'control-2', value: 'Hello there' },
    controls,
  )

  assert.equal(result.ok, true)
  assert.equal(result.control.name, 'Message')
})

test('rejects actions whose target was not visible to the mind', () => {
  const result = validateMindAction(
    { type: 'click', targetId: 'invented-control' },
    controls,
  )

  assert.equal(result.ok, false)
  assert.match(result.reason, /not visible/i)
})

test('rejects destructive and payment actions', () => {
  const result = validateMindAction(
    { type: 'click', targetId: 'control-3' },
    controls,
  )

  assert.equal(result.ok, false)
  assert.match(result.reason, /unsafe/i)
})

test('rejects a selection action without an option value', () => {
  const result = validateMindAction(
    { type: 'select', targetId: 'control-4', value: '' },
    [...controls, { id: 'control-4', kind: 'combobox', name: 'Plan', disabled: false }],
  )

  assert.equal(result.ok, false)
  assert.match(result.reason, /option/i)
})

test('allows body-only actions without a target', () => {
  for (const type of ['scroll', 'wait', 'back', 'leave']) {
    assert.equal(validateMindAction({ type }, controls).ok, true)
  }
})

test('executes the validated action through its captured locator', async () => {
  const calls = []
  const locator = {
    isVisible: async () => true,
    fill: async (value) => calls.push(['fill', value]),
  }
  const snapshot = {
    controls: [{ id: 'control-2', kind: 'textbox', name: 'Message', disabled: false }],
    locators: new Map([['control-2', locator]]),
  }

  const result = await executeMindAction({}, snapshot, {
    type: 'fill',
    targetId: 'control-2',
    value: 'A real response',
  })

  assert.equal(result.ok, true)
  assert.deepEqual(calls, [['fill', 'A real response']])
  assert.match(result.description, /Message/)
})
