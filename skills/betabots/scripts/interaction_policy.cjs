'use strict'

function strings(value) {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean)
}

function normalizeRule(rule = {}, index, kind) {
  return {
    id: String(rule.id || `${kind}-${index + 1}`).replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80),
    actionTypes: strings(rule.actionTypes || rule.types),
    methods: strings(rule.methods),
    urlPatterns: strings(rule.urlPatterns || rule.urls),
    requestUrlPatterns: strings(rule.requestUrlPatterns || rule.requestUrls),
    controlNamePatterns: strings(rule.controlNamePatterns || rule.controlNames || rule.names),
    controlKindPatterns: strings(rule.controlKindPatterns || rule.controlKinds || rule.kinds),
    hrefPatterns: strings(rule.hrefPatterns || rule.hrefs),
    valuePatterns: strings(rule.valuePatterns || rule.values),
  }
}

function normalizeInteractionPolicy(policy = {}) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('Interaction policy must be an object.')
  }
  return {
    actionDenyRules: (Array.isArray(policy.actionDenyRules) ? policy.actionDenyRules : [])
      .map((rule, index) => normalizeRule(rule, index, 'action')),
    requestDenyRules: (Array.isArray(policy.requestDenyRules) ? policy.requestDenyRules : [])
      .map((rule, index) => normalizeRule(rule, index, 'request')),
  }
}

function includesAny(value, patterns) {
  if (!patterns.length) return true
  const text = String(value || '').toLowerCase()
  return patterns.some((pattern) => text.includes(pattern))
}

function actionRuleMatches(rule, input = {}) {
  const action = input.action || {}
  const control = input.control || {}
  if (rule.actionTypes.length && !rule.actionTypes.includes(String(action.type || '').toLowerCase())) return false
  if (rule.urlPatterns.length && !includesAny(input.currentUrl, rule.urlPatterns)) return false
  if (rule.controlNamePatterns.length && !includesAny(control.name, rule.controlNamePatterns)) return false
  if (rule.controlKindPatterns.length && !includesAny(control.kind, rule.controlKindPatterns)) return false
  if (rule.hrefPatterns.length && !includesAny(control.href, rule.hrefPatterns)) return false
  if (rule.valuePatterns.length && !includesAny(action.value, rule.valuePatterns)) return false
  return true
}

function requestRuleMatches(rule, input = {}) {
  if (rule.methods.length && !rule.methods.includes(String(input.method || '').toLowerCase())) return false
  if (rule.requestUrlPatterns.length && !includesAny(input.requestUrl, rule.requestUrlPatterns)) return false
  const indicators = [input.requestUrl, input.currentUrl, input.requestBody]
  if (rule.urlPatterns.length && !indicators.some((value) => includesAny(value, rule.urlPatterns))) return false
  if (rule.valuePatterns.length && !indicators.some((value) => includesAny(value, rule.valuePatterns))) return false
  return true
}

function createPolicyEventCollector() {
  return { events: [], blocked: 0 }
}

function recordPolicyBlock(collector, event) {
  if (!collector) return
  collector.blocked = Number(collector.blocked || 0) + 1
  collector.events.push(event)
}

function enforceActionPolicy(policy, input = {}) {
  const normalized = normalizeInteractionPolicy(policy || {})
  const rule = normalized.actionDenyRules.find((candidate) => actionRuleMatches(candidate, input))
  if (!rule) return { ok: true }
  recordPolicyBlock(input.collector, {
    type: 'policy-block',
    surface: 'action',
    ruleId: rule.id,
    actionType: String(input.action?.type || '').toLowerCase(),
  })
  return { ok: false, ruleId: rule.id, reason: `Blocked by interaction policy (${rule.id}).` }
}

function boundedRequestBody(value) {
  return String(value || '').slice(0, 2048)
}

function evaluateNetworkRequestPolicy(policy, input = {}) {
  const normalized = normalizeInteractionPolicy(policy || {})
  const request = {
    ...input,
    requestBody: boundedRequestBody(input.requestBody),
  }
  const rule = normalized.requestDenyRules.find((candidate) => requestRuleMatches(candidate, request))
  if (!rule) return { ok: true }
  recordPolicyBlock(input.collector, {
    type: 'policy-block',
    surface: 'network',
    ruleId: rule.id,
    method: String(input.method || '').toUpperCase(),
    category: 'prohibited-mutation',
  })
  return { ok: false, ruleId: rule.id, reason: `Blocked by interaction policy (${rule.id}).` }
}

async function installNetworkMutationBackstop(context, policy, currentUrl, collector, options = {}) {
  await context.route('**/*', async (route) => {
    const request = route.request()
    try {
      const decision = evaluateNetworkRequestPolicy(policy, {
        method: request.method(),
        requestUrl: request.url(),
        currentUrl: typeof currentUrl === 'function' ? currentUrl() : currentUrl,
        requestBody: request.postData(),
        collector,
      })
      if (!decision.ok) {
        options.onBlockedRequest?.(request)
        return route.abort()
      }
      return route.continue()
    } catch {
      recordPolicyBlock(collector, {
        type: 'policy-block',
        surface: 'network',
        ruleId: 'policy-evaluation-failed',
        method: 'UNKNOWN',
        category: 'prohibited-mutation',
      })
      return route.abort()
    }
  })
}

module.exports = {
  createPolicyEventCollector,
  enforceActionPolicy,
  evaluateNetworkRequestPolicy,
  installNetworkMutationBackstop,
  normalizeInteractionPolicy,
}
