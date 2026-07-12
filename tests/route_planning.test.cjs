const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeRouteMode,
  routeVisitKey,
  shouldReconcileRouteByUrl,
} = require('../skills/betabots/scripts/route_planning.cjs')

test('same-page actions remain distinct planned steps', () => {
  const routes = [
    { mode: 'navigate', fallback: '/organization#results' },
    { mode: 'action', fallback: '/organization#results' },
    { mode: 'action', fallback: '/organization#results' },
  ]

  assert.equal(shouldReconcileRouteByUrl(routes[0]), true)
  assert.equal(shouldReconcileRouteByUrl(routes[1]), false)
  assert.notEqual(routeVisitKey(routes[1], 1), routeVisitKey(routes[2], 2))
})

test('select controls are not mistaken for visited navigation routes', () => {
  const route = {
    mode: 'select',
    fallback: '/roadmap/roadmap-1?sharing=true',
  }

  assert.equal(shouldReconcileRouteByUrl(route), false)
})

test('text-entry controls are not mistaken for visited navigation routes', () => {
  assert.equal(normalizeRouteMode('fill'), 'fill')
  assert.equal(
    shouldReconcileRouteByUrl({ mode: 'fill', fallback: '/quest/1' }),
    false,
  )
})
