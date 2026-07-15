'use strict'

function matchesLabel(label, text) {
  if (label instanceof RegExp) {
    label.lastIndex = 0
    return label.test(text)
  }
  return String(text || '').toLowerCase().includes(String(label || '').toLowerCase())
}

function findVisibleDestinyAction(nudge = {}, controls = [], routes = []) {
  const route = routes.find((candidate) => candidate.fallback === nudge.route)
  if (!route) return null
  const labels = Array.isArray(route.labels) ? route.labels : []
  const control = controls.find((candidate) => (
    !candidate.disabled && labels.some((label) => matchesLabel(label, candidate.name))
  ))
  if (!control) return null
  return { type: 'click', targetId: control.id, value: '' }
}

function setDestinyBotStatus(state, botId, status) {
  if (!['active', 'inactive', 'completed'].includes(status)) {
    throw new Error(`Unsupported Destiny bot status: ${status}`)
  }
  state.botStatusById ||= {}
  state.nudgesByBotId ||= {}
  if (state.botStatusById[botId] === 'completed' && status !== 'completed') {
    return { status: 'completed', droppedNudges: 0 }
  }
  const queued = state.nudgesByBotId[botId] || []
  state.botStatusById[botId] = status
  if (status !== 'active') state.nudgesByBotId[botId] = []
  return {
    status,
    droppedNudges: status === 'active' ? 0 : queued.length,
  }
}

function queueDestinyNudge(state, botId, nudge = {}, nowMs = Date.now()) {
  if (!state?.enabled) return { accepted: false, reason: 'disabled' }
  const status = state.botStatusById?.[botId] || 'inactive'
  if (status !== 'active') return { accepted: false, reason: status }

  state.nudgesByBotId ||= {}
  state.nudgesByBotId[botId] ||= []
  const route = String(nudge.route || '')
  if (route && state.nudgesByBotId[botId].some((queued) => String(queued.route || '') === route)) {
    return { accepted: false, reason: 'duplicate_queued' }
  }

  state.lastRouteNudgeAtByBotId ||= {}
  state.lastRouteNudgeAtByBotId[botId] ||= {}
  const routeHistory = state.lastRouteNudgeAtByBotId[botId]
  const cooldownMs = Math.max(0, Number(state.nudgeCooldownMs || 0))
  if (
    route &&
    Object.prototype.hasOwnProperty.call(routeHistory, route) &&
    nowMs - routeHistory[route] < cooldownMs
  ) {
    return { accepted: false, reason: 'cooldown' }
  }

  const queuedNudge = { ...nudge, at: new Date(nowMs).toISOString() }
  state.nudgesByBotId[botId].push(queuedNudge)
  if (route) routeHistory[route] = nowMs
  return { accepted: true, nudge: queuedNudge }
}

function takeQueuedDestinyNudges(state, botId) {
  if (!state?.enabled || state.botStatusById?.[botId] !== 'active') return []
  const nudges = state.nudgesByBotId?.[botId] || []
  state.nudgesByBotId[botId] = []
  return nudges
}

module.exports = {
  findVisibleDestinyAction,
  queueDestinyNudge,
  setDestinyBotStatus,
  takeQueuedDestinyNudges,
}
