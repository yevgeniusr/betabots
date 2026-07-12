'use strict'

function normalizeRouteMode(mode) {
  return ['action', 'select', 'fill'].includes(mode) ? mode : 'navigate'
}

function routeVisitKey(route, index) {
  return `${index}:${route.mode || 'navigate'}:${route.fallback || '/'}`
}

function shouldReconcileRouteByUrl(route) {
  return (route.mode || 'navigate') === 'navigate'
}

module.exports = {
  normalizeRouteMode,
  routeVisitKey,
  shouldReconcileRouteByUrl,
}
