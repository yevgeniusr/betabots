'use strict'

function readableRouteLabel(label) {
  return label instanceof RegExp ? label.source : String(label || '')
}

function destinyGuidanceForMind(nudges = [], routes = []) {
  return nudges.flatMap((nudge) => {
    const route = routes.find((candidate) => candidate.fallback === nudge.route)
    if (nudge.route && !route) return []
    return [{
      kind: String(nudge.kind || 'think'),
      thought: String(nudge.thought || '').trim().slice(0, 500),
      route: route?.fallback || '',
      routeLabels: (route?.labels || []).map(readableRouteLabel).filter(Boolean),
    }]
  })
}

function requireDestinyDisposition(decision = {}, guidance = []) {
  if (!guidance.length) return { decision: 'none', reason: '' }
  const disposition = decision.destinyDisposition || {}
  if (!['follow', 'reinterpret', 'reject'].includes(disposition.decision) || !String(disposition.reason || '').trim()) {
    throw new Error('Mind decision requires a follow, reinterpret, or reject Destiny disposition with a reason.')
  }
  return {
    decision: disposition.decision,
    reason: String(disposition.reason).trim().slice(0, 1000),
  }
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
  destinyGuidanceForMind,
  queueDestinyNudge,
  requireDestinyDisposition,
  setDestinyBotStatus,
  takeQueuedDestinyNudges,
}
