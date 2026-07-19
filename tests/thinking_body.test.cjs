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

test('normalizes an explicit Destiny disposition', () => {
  const decision = normalizeMindDecision({
    thought: 'The hunch fits what I can see.',
    destinyDisposition: { decision: 'reinterpret', reason: 'I will inspect the visible route first.' },
    action: { type: 'click', targetId: 'control-1' },
  })

  assert.deepEqual(decision.destinyDisposition, {
    decision: 'reinterpret',
    reason: 'I will inspect the visible route first.',
  })
  assert.throws(() => normalizeMindDecision({
    destinyDisposition: { decision: 'obey', reason: 'Destiny said so.' },
    action: { type: 'wait' },
  }), /Destiny disposition/i)
})

test('rejects missing, malformed, and unknown mind actions', () => {
  assert.throws(() => normalizeMindDecision({ thought: 'No action supplied.' }), /action object/i)
  assert.throws(() => normalizeMindDecision({ action: 'click' }), /action object/i)
  assert.throws(() => normalizeMindDecision({ action: {} }), /action type/i)
  assert.throws(() => normalizeMindDecision({ action: { type: 'hover' } }), /unknown body action/i)
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

test('recovers a unique visible control when the mind returns its exact name', () => {
  const result = validateMindAction(
    { type: 'fill', targetId: 'Message', value: 'Hello there' },
    controls,
  )

  assert.equal(result.ok, true)
  assert.equal(result.action.targetId, 'control-2')
})

test('does not guess when a visible control name is ambiguous', () => {
  const result = validateMindAction(
    { type: 'click', targetId: 'View details' },
    [...controls, { id: 'control-4', kind: 'button', name: 'View details', disabled: false }],
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

test('normalizes selecting an exposed radio control to a click', () => {
  const result = validateMindAction(
    { type: 'select', targetId: 'control-4', value: '' },
    [...controls, { id: 'control-4', kind: 'radio', name: 'Billing identity mismatch', disabled: false }],
  )

  assert.equal(result.ok, true)
  assert.equal(result.action.type, 'click')
})

test('allows body-only actions without a target', () => {
  for (const type of ['scroll', 'wait', 'back', 'leave']) {
    assert.equal(validateMindAction({ type }, controls).ok, true)
  }
})

test('recovers a back action that leaves the browser on about:blank', async () => {
  const calls = []
  const page = {
    goBack: async () => calls.push('back'),
    url: () => 'about:blank',
    goto: async (url) => calls.push(['goto', url]),
  }

  const result = await executeMindAction(
    page,
    { controls: [], locators: new Map() },
    { type: 'back' },
    { fallbackUrl: 'https://app.test/workspace' },
  )

  assert.equal(result.ok, true)
  assert.equal(result.recovered, true)
  assert.deepEqual(calls, ['back', ['goto', 'https://app.test/workspace']])
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
