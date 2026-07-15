const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const modulePath = path.resolve(
  __dirname,
  '../skills/betabots/scripts/browser_issue_recovery.cjs',
)

test('suppresses a 498 signal only after a same-method same-URL successful retry', () => {
  assert.equal(fs.existsSync(modulePath), true, 'browser recovery tracker must exist')
  const {
    createBrowserIssueRecoveryTracker,
    finalizeBrowserIssueRecovery,
    trackBrowserConsoleError,
    trackBrowserResponse,
    isProductUrl,
  } = require(modulePath)

  const recovered = createBrowserIssueRecoveryTracker()
  trackBrowserResponse(recovered, { method: 'POST', url: 'https://app.test/api/verify?attempt=1', status: 498 })
  assert.equal(trackBrowserConsoleError(recovered, {
    text: 'Failed to load resource: the server responded with a status of 498',
  }).deferred, true)
  trackBrowserResponse(recovered, { method: 'POST', url: 'https://app.test/api/verify?attempt=1', status: 200 })
  assert.deepEqual(finalizeBrowserIssueRecovery(recovered), [])

  for (const events of [
    [
      { method: 'POST', url: 'https://app.test/api/verify', status: 200 },
      { method: 'POST', url: 'https://app.test/api/verify', status: 498 },
    ],
    [
      { method: 'POST', url: 'https://app.test/api/verify', status: 498 },
      { method: 'GET', url: 'https://app.test/api/verify', status: 200 },
    ],
    [
      { method: 'POST', url: 'https://app.test/api/verify', status: 498 },
      { method: 'POST', url: 'https://app.test/api/verify', status: 401 },
    ],
  ]) {
    const tracker = createBrowserIssueRecoveryTracker()
    for (const event of events) trackBrowserResponse(tracker, event)
    assert.deepEqual(finalizeBrowserIssueRecovery(tracker), [{
      kind: 'HTTP failure',
      detail: '498 POST https://app.test/api/verify',
    }])
  }

  const unmatchedConsole = createBrowserIssueRecoveryTracker()
  assert.equal(trackBrowserConsoleError(unmatchedConsole, {
    text: 'Failed to load resource: the server responded with a status of 498',
  }).deferred, true)
  assert.deepEqual(finalizeBrowserIssueRecovery(unmatchedConsole), [{
    kind: 'console error',
    detail: 'Failed to load resource: the server responded with a status of 498',
  }])

  const mismatchedConsole = createBrowserIssueRecoveryTracker()
  trackBrowserResponse(mismatchedConsole, {
    method: 'POST',
    url: 'https://app.test/api/verify',
    status: 498,
  })
  trackBrowserConsoleError(mismatchedConsole, {
    text: 'Failed to load resource: the server responded with a status of 498',
    url: 'https://app.test/api/unrelated',
  })
  trackBrowserResponse(mismatchedConsole, {
    method: 'POST',
    url: 'https://app.test/api/verify',
    status: 200,
  })
  assert.deepEqual(finalizeBrowserIssueRecovery(mismatchedConsole), [{
    kind: 'console error',
    detail: 'Failed to load resource: the server responded with a status of 498',
  }])

  const ordinaryConsole = createBrowserIssueRecoveryTracker()
  assert.equal(trackBrowserConsoleError(ordinaryConsole, {
    text: 'Uncaught TypeError: cannot read properties of undefined',
  }).deferred, false)

  assert.equal(isProductUrl(['https://app.test'], 'https://app.test/api'), true)
  assert.equal(isProductUrl(['https://app.test'], 'https://cdn.test/asset'), false)

  const externalResponse = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  assert.deepEqual(trackBrowserResponse(externalResponse, {
    method: 'GET',
    url: 'https://cdn.test/unavailable.js',
    status: 503,
  }), {
    deferred: false,
    scoring: false,
    category: 'external',
    detail: '503 GET https://cdn.test/unavailable.js',
  })
})

test('scopes request failures and requires visible destination proof for aborted RSC requests', () => {
  const {
    createBrowserIssueRecoveryTracker,
    finalizeBrowserIssueRecovery,
    trackBrowserConsoleError,
    trackBrowserRequestFailure,
    trackNavigationIntent,
    trackVisiblePage,
  } = require(modulePath)
  assert.equal(typeof trackBrowserRequestFailure, 'function')

  const externalTracker = createBrowserIssueRecoveryTracker({
    appOrigins: ['https://app.test'],
  })
  assert.deepEqual(trackBrowserRequestFailure(externalTracker, {
    method: 'POST',
    url: 'https://www.google-analytics.com/g/collect',
    errorText: 'net::ERR_FAILED',
    resourceType: 'fetch',
  }), {
    deferred: false,
    scoring: false,
    category: 'external',
    detail: 'POST https://www.google-analytics.com/g/collect net::ERR_FAILED',
  })
  assert.deepEqual(trackBrowserConsoleError(externalTracker, {
    text: 'Failed to load resource: net::ERR_FAILED',
    url: 'https://www.google-analytics.com/g/collect',
  }), {
    deferred: false,
    scoring: false,
    category: 'external',
    detail: 'https://www.google-analytics.com/g/collect Failed to load resource: net::ERR_FAILED',
  })

  const recovered = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackNavigationIntent(recovered, { url: 'https://app.test/customer-support' })
  assert.equal(trackBrowserRequestFailure(recovered, {
    method: 'GET',
    url: 'https://app.test/customer-support?_rsc=abc123',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }).deferred, true)
  trackVisiblePage(recovered, {
    url: 'https://app.test/customer-support',
    text: 'Customer support roadmap ready',
    primaryText: 'Customer support roadmap ready',
  })
  assert.deepEqual(finalizeBrowserIssueRecovery(recovered), [])

  const staleShell = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackVisiblePage(staleShell, {
    url: 'https://app.test/account',
    text: 'Account overview',
    primaryText: 'Account overview',
  })
  trackNavigationIntent(staleShell, { url: 'https://app.test/broken' })
  trackBrowserRequestFailure(staleShell, {
    method: 'GET',
    url: 'https://app.test/broken?_rsc=abc123',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  trackVisiblePage(staleShell, {
    url: 'https://app.test/broken',
    text: 'Navigation Broken Account Help',
    primaryText: 'Account overview',
  })
  assert.deepEqual(finalizeBrowserIssueRecovery(staleShell), [{
    kind: 'request failed',
    detail: 'GET https://app.test/broken?_rsc=abc123 net::ERR_ABORTED',
  }])

  const unrecovered = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackVisiblePage(unrecovered, {
    url: 'https://app.test/customer-support',
    text: 'This observation happened before the failure',
  })
  trackNavigationIntent(unrecovered, { url: 'https://app.test/customer-support' })
  assert.equal(trackBrowserRequestFailure(unrecovered, {
    method: 'GET',
    url: 'https://app.test/customer-support?_rsc=late',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }).deferred, true)
  trackVisiblePage(unrecovered, {
    url: 'https://app.test/customer-support',
    text: '',
  })
  trackVisiblePage(unrecovered, {
    url: 'https://app.test/another-page',
    text: 'A different destination loaded',
  })
  assert.deepEqual(finalizeBrowserIssueRecovery(unrecovered), [{
    kind: 'request failed',
    detail: 'GET https://app.test/customer-support?_rsc=late net::ERR_ABORTED',
  }])

  const ordinary = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  assert.deepEqual(trackBrowserRequestFailure(ordinary, {
    method: 'POST',
    url: 'https://app.test/api/messages',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }), {
    deferred: false,
    scoring: true,
    category: 'product',
    detail: 'POST https://app.test/api/messages net::ERR_ABORTED',
  })
  assert.deepEqual(trackBrowserRequestFailure(ordinary, {
    method: 'GET',
    url: 'https://app.test/customer-support?_rsc=document-like',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'document',
    headers: { rsc: '1' },
  }), {
    deferred: false,
    scoring: true,
    category: 'product',
    detail: 'GET https://app.test/customer-support?_rsc=document-like net::ERR_ABORTED',
  })

  const expectedPrefetch = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  assert.deepEqual(trackBrowserRequestFailure(expectedPrefetch, {
    method: 'GET',
    url: 'https://app.test/customer-support?_rsc=prefetch',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { 'next-router-prefetch': '1' },
  }), {
    deferred: false,
    scoring: false,
    ignored: true,
    category: 'expected-prefetch',
    detail: 'GET https://app.test/customer-support?_rsc=prefetch net::ERR_ABORTED',
  })
  assert.deepEqual(finalizeBrowserIssueRecovery(expectedPrefetch), [])
})

test('ignores aborted requests only after browser-session shutdown begins', () => {
  const {
    beginBrowserIssueRecoveryShutdown,
    createBrowserIssueRecoveryTracker,
    finalizeBrowserIssueRecovery,
    trackBrowserRequestFailure,
    trackNavigationIntent,
    trackVisiblePage,
  } = require(modulePath)

  assert.equal(typeof beginBrowserIssueRecoveryShutdown, 'function')

  const activeTracker = createBrowserIssueRecoveryTracker({
    appOrigins: ['https://app.test'],
  })
  trackVisiblePage(activeTracker, {
    url: 'https://app.test/en',
    text: 'The verification layer for your learning ecosystem',
  })
  trackNavigationIntent(activeTracker, { url: 'https://app.test/en' })
  assert.equal(trackBrowserRequestFailure(activeTracker, {
    method: 'GET',
    url: 'https://app.test/en?_rsc=active-navigation',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }).deferred, true)
  assert.deepEqual(finalizeBrowserIssueRecovery(activeTracker), [{
    kind: 'request failed',
    detail: 'GET https://app.test/en?_rsc=active-navigation net::ERR_ABORTED',
  }])

  const shutdownTracker = createBrowserIssueRecoveryTracker({
    appOrigins: ['https://app.test'],
  })
  trackVisiblePage(shutdownTracker, {
    url: 'https://app.test/en',
    text: 'The verification layer for your learning ecosystem',
  })
  beginBrowserIssueRecoveryShutdown(shutdownTracker)
  assert.deepEqual(trackBrowserRequestFailure(shutdownTracker, {
    method: 'GET',
    url: 'https://app.test/en?_rsc=context-close',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }), {
    deferred: false,
    scoring: false,
    ignored: true,
    category: 'shutdown-abort',
    detail: 'GET https://app.test/en?_rsc=context-close net::ERR_ABORTED',
  })
  assert.deepEqual(finalizeBrowserIssueRecovery(shutdownTracker), [])

  const ordinaryDuringShutdown = createBrowserIssueRecoveryTracker({
    appOrigins: ['https://app.test'],
  })
  beginBrowserIssueRecoveryShutdown(ordinaryDuringShutdown)
  assert.deepEqual(trackBrowserRequestFailure(ordinaryDuringShutdown, {
    method: 'POST',
    url: 'https://app.test/api/messages',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: {},
  }), {
    deferred: false,
    scoring: true,
    category: 'product',
    detail: 'POST https://app.test/api/messages net::ERR_ABORTED',
  })
})

test('classifies RSC aborts by visible-link navigation intent and request start order', () => {
  const {
    beginBrowserIssueRecoveryShutdown,
    createBrowserIssueRecoveryTracker,
    finalizeBrowserIssueRecovery,
    trackBrowserRequestFailure,
    trackBrowserRequestStart,
    trackNavigationIntent,
    trackVisiblePage,
  } = require(modulePath)

  assert.equal(typeof trackBrowserRequestStart, 'function')
  assert.equal(typeof trackNavigationIntent, 'function')

  const speculative = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackBrowserRequestStart(speculative, {
    requestId: 'prefetch-1',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=prefetch',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  assert.deepEqual(trackBrowserRequestFailure(speculative, {
    requestId: 'prefetch-1',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=prefetch',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }), {
    deferred: false,
    scoring: false,
    ignored: true,
    category: 'speculative-rsc',
    detail: 'GET https://app.test/en/corporate/for-companies?_rsc=prefetch net::ERR_ABORTED',
  })
  beginBrowserIssueRecoveryShutdown(speculative)
  assert.deepEqual(finalizeBrowserIssueRecovery(speculative), [])

  const prefetchBeforeClick = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackBrowserRequestStart(prefetchBeforeClick, {
    requestId: 'old-prefetch',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=old',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  trackNavigationIntent(prefetchBeforeClick, {
    url: 'https://app.test/en/corporate/for-companies',
    controlName: 'For organizations',
  })
  assert.equal(trackBrowserRequestFailure(prefetchBeforeClick, {
    requestId: 'old-prefetch',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=old',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }).category, 'speculative-rsc')
  assert.deepEqual(finalizeBrowserIssueRecovery(prefetchBeforeClick), [])

  const clickedNavigation = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackNavigationIntent(clickedNavigation, {
    url: 'https://app.test/en/corporate/for-companies',
    controlName: 'For organizations',
  })
  trackBrowserRequestStart(clickedNavigation, {
    requestId: 'clicked-rsc',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=clicked',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  assert.equal(trackBrowserRequestFailure(clickedNavigation, {
    requestId: 'clicked-rsc',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=clicked',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }).deferred, true)
  beginBrowserIssueRecoveryShutdown(clickedNavigation)
  assert.deepEqual(finalizeBrowserIssueRecovery(clickedNavigation), [{
    kind: 'request failed',
    detail: 'GET https://app.test/en/corporate/for-companies?_rsc=clicked net::ERR_ABORTED',
  }])

  const clickedDuringShutdown = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackNavigationIntent(clickedDuringShutdown, {
    url: 'https://app.test/en/corporate/for-companies',
    controlName: 'For organizations',
  })
  trackBrowserRequestStart(clickedDuringShutdown, {
    requestId: 'clicked-during-shutdown',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=shutdown-click',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  beginBrowserIssueRecoveryShutdown(clickedDuringShutdown)
  assert.equal(trackBrowserRequestFailure(clickedDuringShutdown, {
    requestId: 'clicked-during-shutdown',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=shutdown-click',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }).deferred, true)
  assert.deepEqual(finalizeBrowserIssueRecovery(clickedDuringShutdown), [{
    kind: 'request failed',
    detail: 'GET https://app.test/en/corporate/for-companies?_rsc=shutdown-click net::ERR_ABORTED',
  }])

  const recoveredNavigation = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackNavigationIntent(recoveredNavigation, {
    url: 'https://app.test/en/corporate/for-companies',
    controlName: 'For organizations',
  })
  trackBrowserRequestStart(recoveredNavigation, {
    requestId: 'visible-rsc',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=visible',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  trackBrowserRequestFailure(recoveredNavigation, {
    requestId: 'visible-rsc',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=visible',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  trackVisiblePage(recoveredNavigation, {
    url: 'https://app.test/en/corporate/for-companies',
    title: 'For organizations',
    text: 'Verification infrastructure for companies and organizations',
    primaryText: 'Verification infrastructure for companies and organizations',
  })
  assert.deepEqual(finalizeBrowserIssueRecovery(recoveredNavigation), [])

  const supersededAfterStart = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackNavigationIntent(supersededAfterStart, {
    url: 'https://app.test/en/corporate/for-companies',
    controlName: 'For organizations',
  })
  trackBrowserRequestStart(supersededAfterStart, {
    requestId: 'started-before-second-click',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=first-click',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  trackNavigationIntent(supersededAfterStart, {
    url: 'https://app.test/en/verification',
    controlName: 'Verification',
  })
  assert.equal(trackBrowserRequestFailure(supersededAfterStart, {
    requestId: 'started-before-second-click',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=first-click',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }).deferred, true)
  assert.deepEqual(finalizeBrowserIssueRecovery(supersededAfterStart), [{
    kind: 'request failed',
    detail: 'GET https://app.test/en/corporate/for-companies?_rsc=first-click net::ERR_ABORTED',
  }])

  const staleShellBeforeFailure = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackVisiblePage(staleShellBeforeFailure, {
    url: 'https://app.test/en/account',
    title: 'Self-degree',
    text: 'Account overview',
    primaryText: 'Account overview',
  })
  trackNavigationIntent(staleShellBeforeFailure, {
    url: 'https://app.test/en/corporate/for-companies',
    controlName: 'For organizations',
  })
  trackBrowserRequestStart(staleShellBeforeFailure, {
    requestId: 'late-stale-shell-failure',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=stale-shell',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  trackVisiblePage(staleShellBeforeFailure, {
    url: 'https://app.test/en/corporate/for-companies',
    title: 'Self-degree',
    text: 'Navigation For companies Account Help',
    primaryText: 'Account overview',
  })
  assert.equal(trackBrowserRequestFailure(staleShellBeforeFailure, {
    requestId: 'late-stale-shell-failure',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=stale-shell',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }).deferred, true)
  assert.deepEqual(finalizeBrowserIssueRecovery(staleShellBeforeFailure), [{
    kind: 'request failed',
    detail: 'GET https://app.test/en/corporate/for-companies?_rsc=stale-shell net::ERR_ABORTED',
  }])

  const visibleBeforeFailure = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackNavigationIntent(visibleBeforeFailure, {
    url: 'https://app.test/en/corporate/for-companies',
    controlName: 'For organizations',
  })
  trackBrowserRequestStart(visibleBeforeFailure, {
    requestId: 'late-recovered-failure',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=visible-before-failure',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  trackVisiblePage(visibleBeforeFailure, {
    url: 'https://app.test/en/corporate/for-companies',
    title: 'For organizations',
    text: 'Verification infrastructure for companies and organizations',
    primaryText: 'Verification infrastructure for companies and organizations',
  })
  assert.equal(trackBrowserRequestFailure(visibleBeforeFailure, {
    requestId: 'late-recovered-failure',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=visible-before-failure',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }).scoring, false)
  assert.deepEqual(finalizeBrowserIssueRecovery(visibleBeforeFailure), [])
})

test('accepts changed primary content as corporate destination proof and ignores later aborts', () => {
  const {
    createBrowserIssueRecoveryTracker,
    finalizeBrowserIssueRecovery,
    trackBrowserRequestFailure,
    trackBrowserRequestStart,
    trackNavigationIntent,
    trackVisiblePage,
  } = require(modulePath)

  const tracker = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackVisiblePage(tracker, {
    url: 'https://app.test/en',
    title: 'Self-degree',
    text: 'Verified AI reskilling for customer support teams',
    primaryText: 'Verified AI reskilling for customer support teams',
  })
  const intent = trackNavigationIntent(tracker, {
    url: 'https://app.test/en/corporate/for-companies',
    controlName: 'For organizations',
  })
  trackVisiblePage(tracker, {
    url: 'https://app.test/en/corporate/for-companies',
    title: 'For organizations',
    text: 'The verification layer for your learning ecosystem',
    primaryText: 'The verification layer for your learning ecosystem',
  })
  assert.ok(intent.visibleAt, 'changed primary content should prove the corporate navigation')

  for (const [requestId, rsc] of [
    ['later-prefetch-1', 'after-visible-1'],
    ['later-prefetch-2', 'after-visible-2'],
  ]) {
    trackBrowserRequestStart(tracker, {
      requestId,
      method: 'GET',
      url: `https://app.test/en/corporate/for-companies?_rsc=${rsc}`,
      resourceType: 'fetch',
      headers: { rsc: '1' },
    })
    assert.deepEqual(trackBrowserRequestFailure(tracker, {
      requestId,
      method: 'GET',
      url: `https://app.test/en/corporate/for-companies?_rsc=${rsc}`,
      errorText: 'net::ERR_ABORTED',
      resourceType: 'fetch',
      headers: { rsc: '1' },
    }), {
      deferred: false,
      scoring: false,
      ignored: true,
      category: 'speculative-rsc',
      detail: `GET https://app.test/en/corporate/for-companies?_rsc=${rsc} net::ERR_ABORTED`,
    })
  }

  assert.deepEqual(finalizeBrowserIssueRecovery(tracker), [])
})

test('accepts valid corporate primary content when no pre-navigation baseline is available', () => {
  const {
    createBrowserIssueRecoveryTracker,
    finalizeBrowserIssueRecovery,
    trackBrowserRequestFailure,
    trackBrowserRequestStart,
    trackNavigationIntent,
    trackVisiblePage,
  } = require(modulePath)

  const tracker = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  const intent = trackNavigationIntent(tracker, {
    url: 'https://app.test/en/corporate/for-companies',
    controlName: 'For organizations',
  })
  trackVisiblePage(tracker, {
    url: 'https://app.test/en/corporate/for-companies',
    title: 'For organizations',
    text: 'The verification layer for your learning ecosystem',
    primaryText: 'The verification layer for your learning ecosystem',
  })
  assert.ok(intent.visibleAt, 'valid matching corporate content should prove navigation without a baseline')

  trackBrowserRequestStart(tracker, {
    requestId: 'mobile-teardown-prefetch',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=ryjej',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  assert.equal(trackBrowserRequestFailure(tracker, {
    requestId: 'mobile-teardown-prefetch',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=ryjej',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }).category, 'speculative-rsc')
  assert.deepEqual(finalizeBrowserIssueRecovery(tracker), [])
})

test('ignores a shutdown RSC abort after the destination rendered even when shell text stayed stable', () => {
  const {
    beginBrowserIssueRecoveryShutdown,
    createBrowserIssueRecoveryTracker,
    finalizeBrowserIssueRecovery,
    trackBrowserRequestFailure,
    trackBrowserRequestStart,
    trackNavigationIntent,
    trackVisiblePage,
  } = require(modulePath)

  const tracker = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackVisiblePage(tracker, {
    url: 'https://app.test/en',
    primaryText: 'Shared application shell',
  })
  trackNavigationIntent(tracker, {
    url: 'https://app.test/en/corporate/for-companies',
    controlName: 'For organizations',
  })
  trackBrowserRequestStart(tracker, {
    requestId: 'rendered-before-shutdown',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=ryjej',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  trackVisiblePage(tracker, {
    url: 'https://app.test/en/corporate/for-companies',
    primaryText: 'Shared application shell',
  })
  beginBrowserIssueRecoveryShutdown(tracker)

  assert.deepEqual(trackBrowserRequestFailure(tracker, {
    requestId: 'rendered-before-shutdown',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=ryjej',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }), {
    deferred: false,
    scoring: false,
    ignored: true,
    category: 'visible-navigation-before-shutdown',
    detail: 'GET https://app.test/en/corporate/for-companies?_rsc=ryjej net::ERR_ABORTED',
  })
  assert.deepEqual(finalizeBrowserIssueRecovery(tracker), [])
})

test('ignores an RSC request that starts only after session shutdown begins', () => {
  const {
    beginBrowserIssueRecoveryShutdown,
    createBrowserIssueRecoveryTracker,
    finalizeBrowserIssueRecovery,
    trackBrowserRequestFailure,
    trackBrowserRequestStart,
    trackNavigationIntent,
  } = require(modulePath)

  const tracker = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  trackNavigationIntent(tracker, {
    url: 'https://app.test/en/corporate/for-companies',
    controlName: 'For organizations',
  })
  beginBrowserIssueRecoveryShutdown(tracker)
  trackBrowserRequestStart(tracker, {
    requestId: 'started-after-shutdown',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=ryjej',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })

  assert.deepEqual(trackBrowserRequestFailure(tracker, {
    requestId: 'started-after-shutdown',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=ryjej',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }), {
    deferred: false,
    scoring: false,
    ignored: true,
    category: 'shutdown-started-request',
    detail: 'GET https://app.test/en/corporate/for-companies?_rsc=ryjej net::ERR_ABORTED',
  })
  assert.deepEqual(finalizeBrowserIssueRecovery(tracker), [])
})

test('accepts a visible same-document anchor after its redundant RSC request aborts', () => {
  const {
    createBrowserIssueRecoveryTracker,
    finalizeBrowserIssueRecovery,
    trackBrowserRequestFailure,
    trackBrowserRequestStart,
    trackNavigationIntent,
    trackVisiblePage,
  } = require(modulePath)

  const tracker = createBrowserIssueRecoveryTracker({ appOrigins: ['https://app.test'] })
  const primaryText = 'The verification layer System boundary Employee access is non-negotiable'
  trackVisiblePage(tracker, {
    url: 'https://app.test/en/corporate/for-companies',
    primaryText,
  })
  trackNavigationIntent(tracker, {
    url: 'https://app.test/en/corporate/for-companies#system-boundary',
    controlName: 'View the system boundary',
  })
  trackBrowserRequestStart(tracker, {
    requestId: 'same-document-anchor',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=ryjej',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  })
  assert.equal(trackBrowserRequestFailure(tracker, {
    requestId: 'same-document-anchor',
    method: 'GET',
    url: 'https://app.test/en/corporate/for-companies?_rsc=ryjej',
    errorText: 'net::ERR_ABORTED',
    resourceType: 'fetch',
    headers: { rsc: '1' },
  }).deferred, true)
  trackVisiblePage(tracker, {
    url: 'https://app.test/en/corporate/for-companies#system-boundary',
    primaryText,
  })

  assert.deepEqual(finalizeBrowserIssueRecovery(tracker), [])
})
