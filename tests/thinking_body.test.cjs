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

test('uses the primary action label for safety while retaining explicit dangerous descriptions', () => {
  const policy = {
    id: 'control-policy', kind: 'link', name: 'Privacy Policy How account, purchase, and movement data are handled',
    actionLabel: 'Privacy Policy', href: 'https://app.test/privacy', disabled: false,
  }
  assert.equal(validateMindAction({ type: 'click', targetId: 'control-policy' }, [policy]).ok, true)
  assert.equal(validateMindAction({ type: 'click', targetId: 'Privacy Policy' }, [policy]).ok, true,
    'the LLM can refer to the primary label while the full name remains available as context')

  const checkout = { id: 'control-checkout', kind: 'button', name: 'Continue to secure checkout', actionLabel: 'Continue to secure checkout' }
  assert.match(validateMindAction({ type: 'click', targetId: checkout.id }, [checkout]).reason, /unsafe/i)
  const deletion = { id: 'control-delete', kind: 'button', name: 'Delete account', actionLabel: 'Delete account' }
  assert.match(validateMindAction({ type: 'click', targetId: deletion.id }, [deletion]).reason, /unsafe/i)
  const disclosedPurchase = {
    id: 'control-payment', kind: 'button', name: 'Continue', actionLabel: 'Continue',
    description: 'This action completes a purchase.',
  }
  assert.match(validateMindAction({ type: 'click', targetId: disclosedPurchase.id }, [disclosedPurchase]).reason, /unsafe/i)
})

test('only disambiguates purchase as policy data copy, never as an action or transaction instruction', () => {
  const policyWithShortAriaName = {
    id: 'control-policy-aria', kind: 'link', name: 'Privacy Policy',
    actionLabel: 'Privacy Policy',
    visibleText: 'Privacy Policy How account, purchase, and movement data are handled',
  }
  assert.equal(validateMindAction({ type: 'click', targetId: policyWithShortAriaName.id }, [policyWithShortAriaName]).ok, true)

  const primaryPurchase = {
    id: 'control-primary-purchase', kind: 'link', name: 'Purchase',
    actionLabel: 'Purchase', href: 'https://app.test/purchase',
  }
  assert.match(validateMindAction({ type: 'click', targetId: primaryPurchase.id }, [primaryPurchase]).reason, /unsafe/i)

  const policyWithPurchasePrompt = {
    id: 'control-policy-prompt', kind: 'link', name: 'Privacy Policy Purchase now',
    actionLabel: 'Privacy Policy', description: 'Purchase now to continue.',
  }
  assert.match(validateMindAction({ type: 'click', targetId: policyWithPurchasePrompt.id }, [policyWithPurchasePrompt]).reason, /unsafe/i)

  const ariaPolicyWithPurchasePrompt = {
    id: 'control-policy-aria-prompt', kind: 'link', name: 'Privacy Policy',
    actionLabel: 'Privacy Policy',
    visibleText: 'Privacy Policy Purchase now to continue.',
  }
  assert.match(validateMindAction({ type: 'click', targetId: ariaPolicyWithPurchasePrompt.id }, [ariaPolicyWithPurchasePrompt]).reason, /unsafe/i)

  const harmlessLabelAndDeletionCopy = {
    id: 'control-free-bonus', kind: 'button', name: 'Free bonus Delete account',
    actionLabel: 'Free bonus',
  }
  assert.match(validateMindAction({ type: 'click', targetId: harmlessLabelAndDeletionCopy.id }, [harmlessLabelAndDeletionCopy]).reason, /unsafe/i)

  const learnMoreCheckout = {
    id: 'control-learn-more', kind: 'link', name: 'Learn more Checkout',
    actionLabel: 'Learn more', href: 'https://app.test/checkout',
  }
  assert.match(validateMindAction({ type: 'click', targetId: learnMoreCheckout.id }, [learnMoreCheckout]).reason, /unsafe/i)
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
    fill: async (value, options) => calls.push(['fill', value, options]),
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
  assert.deepEqual(calls, [['fill', 'A real response', { timeout: 5000 }]])
  assert.match(result.description, /Message/)
})

test('uses a bounded default timeout for click body actions', async () => {
  const calls = []
  const locator = {
    isVisible: async () => true,
    click: async (options) => calls.push(options),
  }
  const snapshot = {
    controls: [{ id: 'control-1', kind: 'button', name: 'View details', disabled: false }],
    locators: new Map([['control-1', locator]]),
  }

  const result = await executeMindAction({}, snapshot, {
    type: 'click',
    targetId: 'control-1',
  })

  assert.equal(result.ok, true)
  assert.deepEqual(calls, [{ timeout: 5000 }])
})

test('body action timeout override does not inherit the global page action timeout', async () => {
  const calls = []
  const locator = {
    isVisible: async () => true,
    fill: async (_value, options) => calls.push(options),
  }
  const snapshot = {
    controls: [{ id: 'control-2', kind: 'textbox', name: 'Message', disabled: false }],
    locators: new Map([['control-2', locator]]),
  }

  const result = await executeMindAction({}, snapshot, {
    type: 'fill',
    targetId: 'control-2',
    value: 'Short timeout',
  }, {
    actionTimeoutMs: 60000,
    bodyActionTimeoutMs: 7000,
  })

  assert.equal(result.ok, true)
  assert.deepEqual(calls, [{ timeout: 7000 }])
})

test('uses the bounded body timeout for native select actions', async () => {
  const calls = []
  const locator = {
    isVisible: async () => true,
    evaluate: async () => 'select',
    selectOption: async (value, options) => calls.push([value, options]),
  }
  const snapshot = {
    controls: [{ id: 'control-4', kind: 'combobox', name: 'Plan', disabled: false }],
    locators: new Map([['control-4', locator]]),
  }

  const result = await executeMindAction({}, snapshot, {
    type: 'select',
    targetId: 'control-4',
    value: 'Pro',
  })

  assert.equal(result.ok, true)
  assert.deepEqual(calls, [[{ label: 'Pro' }, { timeout: 5000 }]])
})
