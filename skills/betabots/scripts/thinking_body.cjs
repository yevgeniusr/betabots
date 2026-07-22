const BODY_ACTIONS = new Set(['click', 'fill', 'select', 'scroll', 'wait', 'back', 'leave'])
const TARGET_ACTIONS = new Set(['click', 'fill', 'select'])
const UNSAFE_CONTROL = /\b(delete|remove|revoke|erase|destroy|sign out|log ?out|pay|purchase|buy|checkout|subscribe|publish|send money|transfer)\b/i
const DESTINY_DISPOSITIONS = new Set(['follow', 'reinterpret', 'reject', 'none'])
const DEFAULT_BODY_ACTION_TIMEOUT_MS = 5000

function cleanText(value, limit = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function normalizeMindDecision(value = {}) {
  if (!value.action || typeof value.action !== 'object' || Array.isArray(value.action)) {
    throw new Error('Mind decision must include an action object.')
  }
  const sourceAction = value.action
  const requestedType = cleanText(sourceAction.type, 30).toLowerCase()
  if (!requestedType) throw new Error('Mind decision action type is required.')
  if (!BODY_ACTIONS.has(requestedType)) {
    throw new Error(`Unknown body action: ${requestedType}`)
  }
  const sourceDisposition = value.destinyDisposition
  const destinyDecision = cleanText(sourceDisposition?.decision, 30).toLowerCase() || 'none'
  if (!DESTINY_DISPOSITIONS.has(destinyDecision)) {
    throw new Error(`Unknown Destiny disposition: ${destinyDecision}`)
  }

  return {
    thought: cleanText(value.thought),
    opinion: cleanText(value.opinion),
    idea: cleanText(value.idea),
    truthfulAssessment: cleanText(value.truthfulAssessment || value.truthAssessment),
    lifeCostJustification: cleanText(value.lifeCostJustification || value.lifeDecision),
    actionReason: cleanText(value.actionReason || sourceAction.reason),
    destinyDisposition: {
      decision: destinyDecision,
      reason: cleanText(sourceDisposition?.reason),
    },
    action: {
      type: requestedType,
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

  const requestedTarget = cleanText(action.targetId || action.target, 120)
  const semanticMatches = controls.filter(
    (candidate) => cleanText(candidate.name, 120).toLowerCase() === requestedTarget.toLowerCase(),
  )
  const control = controls.find((candidate) => candidate.id === requestedTarget) ||
    (semanticMatches.length === 1 ? semanticMatches[0] : null)
  if (!control) return { ok: false, reason: `Target ${requestedTarget || '(empty)'} was not visible to the mind.` }
  const targetId = control.id
  if (control.disabled) return { ok: false, reason: `Target ${targetId} is disabled.` }
  if (UNSAFE_CONTROL.test(`${control.name || ''} ${control.kind || ''}`)) {
    return { ok: false, reason: `Target ${targetId} is unsafe for synthetic beta traffic.` }
  }

  const kind = String(control.kind || '').toLowerCase()
  const normalizedType = type === 'select' && ['radio', 'checkbox'].includes(kind)
    ? 'click'
    : type
  if (normalizedType === 'fill' && !['textbox', 'searchbox', 'input', 'textarea'].includes(kind)) {
    return { ok: false, reason: `Target ${targetId} cannot accept text.` }
  }
  if (normalizedType === 'select' && !['combobox', 'select'].includes(kind)) {
    return { ok: false, reason: `Target ${targetId} is not a selection control.` }
  }
  if (normalizedType === 'fill' && !cleanText(action.value, 500)) {
    return { ok: false, reason: `Text action for ${targetId} has no value.` }
  }
  if (normalizedType === 'select' && !cleanText(action.value, 500)) {
    return { ok: false, reason: `Selection action for ${targetId} has no option value.` }
  }

  return {
    ok: true,
    action: { ...action, type: normalizedType, targetId, value: cleanText(action.value, 500) },
    control,
  }
}

async function isExposedInteractiveControl(candidate) {
  return candidate.evaluate((element) => {
    if (element.closest('[inert], [aria-hidden="true"]')) return false
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1)
    const y = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1)
    const topmost = document.elementFromPoint(x, y)
    return Boolean(topmost && (topmost === element || element.contains(topmost)))
  }).catch(() => false)
}

function equivalentLinkKey(control) {
  if (!control?.href) return ''
  const kind = cleanText(control.kind, 200).toLowerCase()
  const name = cleanText(control.name, 200).toLowerCase()
  const scope = control.isMainFrame ? 'main' : `frame:${control.frameUrl || ''}`
  return `${kind}\n${name}\n${scope}\n${cleanText(control.href, 2000)}`
}

async function collectInteractiveControls(page, limit = 80) {
  const controls = []
  const locators = new Map()
  const equivalentLinks = new Set()
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
    await frame.locator('[data-betabot-ref]').evaluateAll((elements) => {
      for (const element of elements) element.removeAttribute('data-betabot-ref')
    }).catch(() => {})
  }

  for (const frame of page.frames()) {
    const candidates = frame.locator(selector)
    const count = await candidates.count().catch(() => 0)
    for (let index = 0; index < count && controls.length < limit; index += 1) {
      const candidate = candidates.nth(index)
      if (!(await candidate.isVisible({ timeout: 250 }).catch(() => false))) continue
      if (!(await isExposedInteractiveControl(candidate))) continue
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
          href: tag === 'a' ? String(element.href || '') : '',
          value: inputType === 'password' ? '' : ('value' in element ? String(element.value || '').slice(0, 180) : ''),
          options: tag === 'select'
            ? [...element.options].slice(0, 30).map((option) => ({ label: option.textContent.trim(), value: option.value }))
            : [],
        }
      }, id).catch(() => null)
      if (!control) continue
      control.frameUrl = frame.url()
      control.isMainFrame = frame === page.mainFrame()
      const linkKey = equivalentLinkKey(control)
      if (linkKey && equivalentLinks.has(linkKey)) {
        await candidate.evaluate((element) => element.removeAttribute('data-betabot-ref')).catch(() => {})
        continue
      }
      if (linkKey) equivalentLinks.add(linkKey)
      const locator = frame.locator(`[data-betabot-ref="${id}"]`).first()
      controls.push(control)
      locators.set(id, locator)
    }
    if (controls.length >= limit) break
  }

  return { controls, locators }
}

function semanticControlMatches(candidate, original) {
  const sameKind = cleanText(candidate.kind, 180).toLowerCase() === cleanText(original.kind, 180).toLowerCase()
  const sameName = cleanText(candidate.name, 180).toLowerCase() === cleanText(original.name, 180).toLowerCase()
  if (!sameKind || !sameName) return false
  if ((candidate.href || original.href) && candidate.href !== original.href) return false
  if (
    typeof candidate.isMainFrame === 'boolean' &&
    typeof original.isMainFrame === 'boolean' &&
    candidate.isMainFrame !== original.isMainFrame
  ) return false
  if (candidate.isMainFrame === false && original.frameUrl && candidate.frameUrl !== original.frameUrl) return false
  return true
}

function transientLocatorFailure(error) {
  return /detached|not attached|not connected|waiting for locator|resolved to hidden|element is not visible|no element found/i.test(
    String(error?.message || error || ''),
  )
}

async function visibleAriaOptions(page, value, exact) {
  const matches = []
  for (const frame of page.frames()) {
    const options = frame.getByRole('option', { name: value, exact })
    const count = await options.count().catch(() => 0)
    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index)
      if (await option.isVisible({ timeout: 250 }).catch(() => false)) matches.push(option)
    }
  }
  return matches
}

function bodyActionTimeoutMs(options = {}) {
  const configured = Number(options.bodyActionTimeoutMs)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_BODY_ACTION_TIMEOUT_MS
}

async function selectAriaOption(page, locator, value, options = {}) {
  const expanded = await locator.getAttribute('aria-expanded').catch(() => null)
  if (expanded !== 'true') await locator.click({ timeout: bodyActionTimeoutMs(options) })

  let matches = []
  for (let attempt = 0; attempt < 4 && matches.length === 0; attempt += 1) {
    matches = await visibleAriaOptions(page, value, true)
    if (matches.length === 0) matches = await visibleAriaOptions(page, value, false)
    if (matches.length === 0) await page.waitForTimeout(150)
  }
  if (matches.length !== 1) {
    throw new Error(`Expected one visible option named "${value}", found ${matches.length}.`)
  }
  await matches[0].click({ timeout: bodyActionTimeoutMs(options) })
}

async function performTargetAction(page, locator, action, options = {}) {
  const timeout = bodyActionTimeoutMs(options)
  if (action.type === 'click') await locator.click({ timeout })
  if (action.type === 'fill') await locator.fill(action.value, { timeout })
  if (action.type === 'select') {
    const tagName = await locator.evaluate((element) => element.tagName.toLowerCase())
    if (tagName === 'select') {
      await locator.selectOption({ label: action.value }, { timeout }).catch(() => locator.selectOption(action.value, { timeout }))
    } else {
      await selectAriaOption(page, locator, action.value, options)
    }
  }
}

function successfulTargetAction(action, control, retried = false) {
  const verb = action.type === 'fill' ? 'filled' : action.type === 'select' ? 'selected' : 'clicked'
  return {
    ok: true,
    description: `${verb} ${control.name}`,
    control,
    ...(retried ? { retried: true } : {}),
  }
}

async function retrySemanticTarget(page, originalControl, action, originalReason, options = {}) {
  const freshSnapshot = await collectInteractiveControls(page)
  const matches = freshSnapshot.controls.filter((candidate) => (
    semanticControlMatches(candidate, originalControl)
  ))
  if (matches.length !== 1) {
    return {
      ok: false,
      reason: `Target ${action.targetId} became stale; found ${matches.length} visible semantic matches for ${originalControl.kind} "${originalControl.name}". ${originalReason}`,
    }
  }

  const replacement = matches[0]
  const retryAction = { ...action, targetId: replacement.id }
  const revalidated = validateMindAction(retryAction, freshSnapshot.controls)
  if (!revalidated.ok) return revalidated
  const locator = freshSnapshot.locators.get(replacement.id)
  if (!locator || !(await locator.isVisible({ timeout: 1000 }).catch(() => false))) {
    return { ok: false, reason: `Semantic replacement ${replacement.id} disappeared before the retry.` }
  }
  try {
    await options.beforeTargetAction?.({ action: revalidated.action, control: revalidated.control })
    await performTargetAction(page, locator, revalidated.action, options)
    return successfulTargetAction(revalidated.action, revalidated.control, true)
  } catch (error) {
    return {
      ok: false,
      reason: `Semantic retry for ${replacement.id} failed: ${cleanText(error.message, 500)}`,
    }
  }
}

async function scrollVisibleRegion(page, direction) {
  if (typeof page.evaluate !== 'function') return false

  const scrollFrame = (frame) => frame.evaluate((scrollDirection) => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const documentScroller = document.scrollingElement
    const candidates = [documentScroller, ...document.querySelectorAll('*')]
      .filter((element, index, all) => element && all.indexOf(element) === index)
      .map((element) => {
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        const isDocument = element === documentScroller
        const canOverflow = isDocument || /(auto|scroll|overlay)/.test(style.overflowY)
        const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0))
        const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0))
        const remaining = scrollDirection > 0
          ? element.scrollHeight - element.clientHeight - element.scrollTop
          : element.scrollTop
        return {
          element,
          canScroll: canOverflow && remaining > 1 && visibleWidth > 0 && visibleHeight > 0,
          score: visibleWidth * visibleHeight,
        }
      })
      .filter((candidate) => candidate.canScroll)
      .sort((left, right) => right.score - left.score)

    const target = candidates[0]?.element
    if (!target) return false
    const before = target.scrollTop
    const distance = Math.max(320, Math.min(800, target.clientHeight * 0.75))
    target.scrollTop += scrollDirection * distance
    return target.scrollTop !== before
  }, direction).catch(() => false)

  const mainFrame = page.mainFrame?.()
  const visibleChildFrames = []
  for (const frame of page.frames?.() || []) {
    if (frame === mainFrame) continue
    const frameElement = await frame.frameElement().catch(() => null)
    if (!frameElement || !(await frameElement.isVisible({ timeout: 250 }).catch(() => false))) continue
    const box = await frameElement.boundingBox().catch(() => null)
    if (!box || box.width <= 0 || box.height <= 0) continue
    visibleChildFrames.push({ frame, area: box.width * box.height })
  }
  visibleChildFrames.sort((left, right) => right.area - left.area)

  for (const { frame } of visibleChildFrames) {
    if (await scrollFrame(frame)) return true
  }
  return scrollFrame(mainFrame || page)
}

async function executeMindAction(page, snapshot, requestedAction, options = {}) {
  const validated = validateMindAction(requestedAction, snapshot.controls)
  if (!validated.ok) {
    const requestedType = cleanText(requestedAction.type, 30).toLowerCase()
    const optionValue = cleanText(requestedAction.value, 500)
    if (
      requestedType === 'select' &&
      optionValue &&
      /was not visible to the mind/i.test(validated.reason)
    ) {
      if (UNSAFE_CONTROL.test(optionValue)) {
        return { ok: false, reason: `Selection option "${optionValue}" is unsafe for synthetic beta traffic.` }
      }
      let matches = await visibleAriaOptions(page, optionValue, true)
      if (matches.length === 0) matches = await visibleAriaOptions(page, optionValue, false)
      if (matches.length === 1) {
        await matches[0].click({ timeout: bodyActionTimeoutMs(options) })
        return {
          ok: true,
          description: `selected ${cleanText(requestedAction.targetId || requestedAction.target || optionValue, 180)}`,
          control: { kind: 'option', name: optionValue },
          recovered: true,
        }
      }
    }
    return validated
  }

  const action = validated.action
  if (action.type === 'leave') return { ok: true, ended: true, description: 'left the session' }
  if (action.type === 'wait') {
    await page.waitForTimeout?.(1500)
    return { ok: true, description: 'waited to see whether the product changed' }
  }
  if (action.type === 'scroll') {
    const direction = /up/i.test(action.value) ? -1 : 1
    const moved = await scrollVisibleRegion(page, direction)
    if (!moved) await page.mouse?.wheel(0, direction * 0.75 * 800)
    return { ok: true, description: `scrolled ${direction < 0 ? 'up' : 'down'}` }
  }
  if (action.type === 'back') {
    await page.goBack?.({ waitUntil: 'commit', timeout: 15000 }).catch(() => null)
    const currentUrl = cleanText(page.url?.(), 2000).toLowerCase()
    if (
      options.fallbackUrl &&
      (!currentUrl || currentUrl === 'about:blank' || currentUrl.startsWith('data:,'))
    ) {
      await page.goto?.(options.fallbackUrl, {
        waitUntil: 'commit',
        timeout: options.actionTimeoutMs || 15000,
      })
      return {
        ok: true,
        recovered: true,
        description: 'went back and recovered to the app',
      }
    }
    return { ok: true, description: 'went back' }
  }

  const locator = snapshot.locators.get(action.targetId)
  if (!locator || !(await locator.isVisible({ timeout: 1000 }).catch(() => false))) {
    return retrySemanticTarget(
      page,
      validated.control,
      action,
      `Target ${action.targetId} disappeared before the action.`,
      options,
    )
  }
  try {
    await options.beforeTargetAction?.({ action, control: validated.control })
    await performTargetAction(page, locator, action, options)
    return successfulTargetAction(action, validated.control)
  } catch (error) {
    if (!transientLocatorFailure(error)) {
      return {
        ok: false,
        reason: `Target ${action.targetId} could not perform ${action.type}: ${cleanText(error.message, 500)}`,
      }
    }
    return retrySemanticTarget(
      page,
      validated.control,
      action,
      `The original locator failed transiently: ${cleanText(error.message, 500)}`,
      options,
    )
  }
}

module.exports = {
  BODY_ACTIONS,
  DEFAULT_BODY_ACTION_TIMEOUT_MS,
  collectInteractiveControls,
  executeMindAction,
  normalizeMindDecision,
  validateMindAction,
}
