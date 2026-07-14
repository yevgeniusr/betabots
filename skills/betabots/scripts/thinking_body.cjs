const BODY_ACTIONS = new Set(['click', 'fill', 'select', 'scroll', 'wait', 'back', 'leave'])
const TARGET_ACTIONS = new Set(['click', 'fill', 'select'])
const UNSAFE_CONTROL = /\b(delete|remove|revoke|erase|destroy|sign out|log ?out|pay|purchase|buy|checkout|subscribe|publish|send money|transfer)\b/i

function cleanText(value, limit = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function normalizeMindDecision(value = {}) {
  const sourceAction = value.action && typeof value.action === 'object'
    ? value.action
    : { type: value.desiredAction }
  const requestedType = cleanText(sourceAction.type || 'wait', 30).toLowerCase()
  const type = BODY_ACTIONS.has(requestedType) ? requestedType : 'wait'

  return {
    thought: cleanText(value.thought),
    opinion: cleanText(value.opinion),
    idea: cleanText(value.idea),
    truthfulAssessment: cleanText(value.truthfulAssessment || value.truthAssessment),
    lifeCostJustification: cleanText(value.lifeCostJustification || value.lifeDecision),
    actionReason: cleanText(value.actionReason || sourceAction.reason),
    action: {
      type,
      targetId: cleanText(sourceAction.targetId || sourceAction.target, 120),
      value: cleanText(sourceAction.value, 500),
    },
  }
}

function validateMindAction(action = {}, controls = []) {
  const type = cleanText(action.type, 30).toLowerCase()
  if (!BODY_ACTIONS.has(type)) {
    return { ok: false, reason: `Unknown body action: ${type || '(empty)'}` }
  }
  if (!TARGET_ACTIONS.has(type)) return { ok: true, action: { ...action, type } }

  const targetId = cleanText(action.targetId || action.target, 120)
  const control = controls.find((candidate) => candidate.id === targetId)
  if (!control) return { ok: false, reason: `Target ${targetId || '(empty)'} was not visible to the mind.` }
  if (control.disabled) return { ok: false, reason: `Target ${targetId} is disabled.` }
  if (UNSAFE_CONTROL.test(`${control.name || ''} ${control.kind || ''}`)) {
    return { ok: false, reason: `Target ${targetId} is unsafe for synthetic beta traffic.` }
  }

  const kind = String(control.kind || '').toLowerCase()
  if (type === 'fill' && !['textbox', 'searchbox', 'input', 'textarea'].includes(kind)) {
    return { ok: false, reason: `Target ${targetId} cannot accept text.` }
  }
  if (type === 'select' && !['combobox', 'select'].includes(kind)) {
    return { ok: false, reason: `Target ${targetId} is not a selection control.` }
  }
  if (type === 'fill' && !cleanText(action.value, 500)) {
    return { ok: false, reason: `Text action for ${targetId} has no value.` }
  }
  if (type === 'select' && !cleanText(action.value, 500)) {
    return { ok: false, reason: `Selection action for ${targetId} has no option value.` }
  }

  return {
    ok: true,
    action: { ...action, type, targetId, value: cleanText(action.value, 500) },
    control,
  }
}

async function collectInteractiveControls(page, limit = 80) {
  const controls = []
  const locators = new Map()
  const viewport = page.viewportSize() || await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  const selector = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="radio"]',
    '[role="checkbox"]',
    '[role="combobox"]',
  ].join(',')

  for (const frame of page.frames()) {
    const candidates = frame.locator(selector)
    const count = await candidates.count().catch(() => 0)
    for (let index = 0; index < count && controls.length < limit; index += 1) {
      const candidate = candidates.nth(index)
      if (!(await candidate.isVisible({ timeout: 250 }).catch(() => false))) continue
      const box = await candidate.boundingBox().catch(() => null)
      const intersectsViewport = box &&
        box.width > 0 &&
        box.height > 0 &&
        box.x + box.width >= 0 &&
        box.y + box.height >= 0 &&
        box.x <= viewport.width &&
        box.y <= viewport.height
      if (!intersectsViewport) continue
      const id = `control-${controls.length + 1}`
      const control = await candidate.evaluate((element, ref) => {
        element.setAttribute('data-betabot-ref', ref)
        const tag = element.tagName.toLowerCase()
        const explicitRole = element.getAttribute('role') || ''
        const inputType = element.getAttribute('type') || ''
        let kind = explicitRole || tag
        if (tag === 'textarea' || element.isContentEditable) kind = 'textbox'
        if (tag === 'input') {
          kind = ['search'].includes(inputType) ? 'searchbox' : ['checkbox', 'radio'].includes(inputType) ? inputType : 'textbox'
        }
        if (tag === 'select') kind = 'combobox'
        const labelledBy = element.getAttribute('aria-labelledby')
        const labelledText = labelledBy
          ? labelledBy.split(/\s+/).map((labelId) => document.getElementById(labelId)?.textContent || '').join(' ')
          : ''
        const name = [
          element.getAttribute('aria-label'),
          labelledText,
          element.getAttribute('placeholder'),
          element.labels ? [...element.labels].map((label) => label.textContent).join(' ') : '',
          element.textContent,
          element.getAttribute('title'),
          element.getAttribute('name'),
        ].find((value) => String(value || '').trim()) || `${kind} ${ref}`
        return {
          id: ref,
          kind,
          name: String(name).replace(/\s+/g, ' ').trim().slice(0, 180),
          disabled: Boolean(element.disabled) || element.getAttribute('aria-disabled') === 'true',
          value: inputType === 'password' ? '' : ('value' in element ? String(element.value || '').slice(0, 180) : ''),
          options: tag === 'select'
            ? [...element.options].slice(0, 30).map((option) => ({ label: option.textContent.trim(), value: option.value }))
            : [],
        }
      }, id).catch(() => null)
      if (!control) continue
      const locator = frame.locator(`[data-betabot-ref="${id}"]`).first()
      controls.push(control)
      locators.set(id, locator)
    }
    if (controls.length >= limit) break
  }

  return { controls, locators }
}

async function executeMindAction(page, snapshot, requestedAction) {
  const validated = validateMindAction(requestedAction, snapshot.controls)
  if (!validated.ok) return validated

  const action = validated.action
  if (action.type === 'leave') return { ok: true, ended: true, description: 'left the session' }
  if (action.type === 'wait') {
    await page.waitForTimeout?.(1500)
    return { ok: true, description: 'waited to see whether the product changed' }
  }
  if (action.type === 'scroll') {
    const direction = /up/i.test(action.value) ? -1 : 1
    await page.mouse?.wheel(0, direction * 0.75 * 800)
    return { ok: true, description: `scrolled ${direction < 0 ? 'up' : 'down'}` }
  }
  if (action.type === 'back') {
    await page.goBack?.({ waitUntil: 'commit', timeout: 15000 }).catch(() => null)
    return { ok: true, description: 'went back' }
  }

  const locator = snapshot.locators.get(action.targetId)
  if (!locator || !(await locator.isVisible({ timeout: 1000 }).catch(() => false))) {
    return { ok: false, reason: `Target ${action.targetId} disappeared before the action.` }
  }
  if (action.type === 'click') await locator.click({ timeout: 5000 })
  if (action.type === 'fill') await locator.fill(action.value, { timeout: 5000 })
  if (action.type === 'select') {
    await locator.selectOption({ label: action.value }).catch(() => locator.selectOption(action.value))
  }

  const verb = action.type === 'fill' ? 'filled' : action.type === 'select' ? 'selected' : 'clicked'
  return { ok: true, description: `${verb} ${validated.control.name}`, control: validated.control }
}

module.exports = {
  BODY_ACTIONS,
  collectInteractiveControls,
  executeMindAction,
  normalizeMindDecision,
  validateMindAction,
}
