'use strict'

function normalizedUrl(value) {
  try {
    const url = new URL(String(value || ''))
    url.hash = ''
    return url.href
  } catch {
    return String(value || '').replace(/#.*$/, '')
  }
}

function requestKey(method, url) {
  return `${String(method || 'GET').toUpperCase()} ${normalizedUrl(url)}`
}

function normalizedOrigin(value) {
  try {
    return new URL(String(value || '')).origin
  } catch {
    return ''
  }
}

function isProductUrl(appOrigins, value) {
  const origins = [...new Set((appOrigins || []).map(normalizedOrigin).filter(Boolean))]
  if (origins.length === 0) return true
  const origin = normalizedOrigin(value)
  return Boolean(origin && origins.includes(origin))
}

function destinationKey(value) {
  try {
    const url = new URL(String(value || ''))
    url.hash = ''
    url.searchParams.delete('_rsc')
    const sorted = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ))
    url.search = ''
    for (const [key, item] of sorted) url.searchParams.append(key, item)
    return url.href
  } catch {
    return String(value || '').replace(/#.*$/, '').replace(/([?&])_rsc=[^&]*&?/, '$1').replace(/[?&]$/, '')
  }
}

function urlHash(value) {
  try {
    return new URL(String(value || '')).hash
  } catch {
    return String(value || '').includes('#') ? `#${String(value).split('#').slice(1).join('#')}` : ''
  }
}

function createBrowserIssueRecoveryTracker(options = {}) {
  return {
    sequence: 0,
    shutdownStarted: false,
    shutdownSequence: null,
    failures: [],
    consoleSignals: [],
    abortedRequests: [],
    requestStarts: [],
    navigationIntents: [],
    speculativeAborts: [],
    visiblePages: [],
    appOrigins: [...new Set((options.appOrigins || []).map(normalizedOrigin).filter(Boolean))],
  }
}

function trackNavigationIntent(tracker, event = {}) {
  const sequence = ++tracker.sequence
  for (const intent of tracker.navigationIntents) {
    if (!intent.visibleAt && !intent.supersededAt) intent.supersededAt = sequence
  }
  const baselinePage = tracker.visiblePages.at(-1)
  const destination = destinationKey(event.url)
  const anchor = urlHash(event.url)
  const intent = {
    sequence,
    destination,
    controlName: String(event.controlName || '').trim(),
    baselinePrimaryFingerprint: primaryContentFingerprint(baselinePage?.primaryText),
    anchor: anchor && baselinePage?.destination === destination ? anchor : '',
  }
  tracker.navigationIntents.push(intent)
  return intent
}

function trackBrowserRequestStart(tracker, event = {}) {
  const sequence = ++tracker.sequence
  const method = String(event.method || 'GET').toUpperCase()
  const url = normalizedUrl(event.url)
  const resourceType = String(event.resourceType || '').toLowerCase()
  if (
    method !== 'GET' ||
    !['fetch', 'xhr'].includes(resourceType) ||
    !isRscOrPrefetchRequest(event)
  ) {
    return { tracked: false, sequence }
  }
  const request = {
    sequence,
    requestId: String(event.requestId || ''),
    method,
    url,
    destination: destinationKey(url),
  }
  const navigationIntent = [...tracker.navigationIntents].reverse().find((intent) => (
    intent.sequence < sequence &&
    intent.destination === request.destination &&
    (!intent.visibleAt || intent.visibleAt > sequence) &&
    (!intent.supersededAt || intent.supersededAt > sequence)
  ))
  if (navigationIntent) request.navigationIntentSequence = navigationIntent.sequence
  tracker.requestStarts.push(request)
  return { tracked: true, ...request }
}

function beginBrowserIssueRecoveryShutdown(tracker) {
  if (tracker.shutdownStarted) return
  tracker.shutdownStarted = true
  tracker.shutdownSequence = ++tracker.sequence
}

function trackBrowserResponse(tracker, event = {}) {
  const sequence = ++tracker.sequence
  const status = Number(event.status || 0)
  const method = String(event.method || 'GET').toUpperCase()
  const url = normalizedUrl(event.url)
  const key = requestKey(method, url)
  if (!isProductUrl(tracker.appOrigins, url) && status >= 400) {
    return {
      deferred: false,
      scoring: false,
      category: 'external',
      detail: `${status} ${method} ${url}`,
    }
  }

  if (status === 498) {
    tracker.failures.push({ sequence, method, url, key, recovered: false })
    return { deferred: true }
  }
  if (status < 200 || status >= 400) return { deferred: false }

  const failure = tracker.failures.find((candidate) => (
    !candidate.recovered && candidate.key === key && candidate.sequence < sequence
  ))
  if (!failure) return { deferred: false }
  failure.recovered = true
  failure.recoveredAt = sequence
  failure.recoveryStatus = status
  return { deferred: false, recovered: true }
}

function trackBrowserConsoleError(tracker, event = {}) {
  const text = String(event.text || '').trim()
  const url = normalizedUrl(event.url)
  const origin = normalizedOrigin(url)
  const isExternalResourceSignal = /failed to load resource/i.test(text) &&
    tracker.appOrigins.length > 0 &&
    origin &&
    !tracker.appOrigins.includes(origin)
  if (isExternalResourceSignal) {
    return {
      deferred: false,
      scoring: false,
      category: 'external',
      detail: `${url} ${text}`,
    }
  }
  const is498ResourceSignal = /failed to load resource/i.test(text) && /\b498\b/.test(text)
  if (!is498ResourceSignal) return { deferred: false }
  tracker.consoleSignals.push({
    sequence: ++tracker.sequence,
    text,
    url,
  })
  return { deferred: true }
}

function isRscOrPrefetchRequest(event) {
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => (
    [String(key).toLowerCase(), String(value).toLowerCase()]
  )))
  let hasRscQuery = false
  try {
    hasRscQuery = new URL(String(event.url || '')).searchParams.has('_rsc')
  } catch {}
  return hasRscQuery ||
    headers.rsc === '1' ||
    headers['next-router-prefetch'] === '1' ||
    headers.purpose === 'prefetch' ||
    headers['sec-purpose'] === 'prefetch'
}

function isExplicitPrefetchRequest(event) {
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => (
    [String(key).toLowerCase(), String(value).toLowerCase()]
  )))
  return headers['next-router-prefetch'] === '1' ||
    headers.purpose === 'prefetch' ||
    headers['sec-purpose'] === 'prefetch'
}

function trackBrowserRequestFailure(tracker, event = {}) {
  const sequence = ++tracker.sequence
  const method = String(event.method || 'GET').toUpperCase()
  const url = normalizedUrl(event.url)
  const errorText = String(event.errorText || '').trim()
  const detail = `${method} ${url} ${errorText}`.trim()
  const origin = normalizedOrigin(url)
  const isExternal = tracker.appOrigins.length > 0 && origin && !tracker.appOrigins.includes(origin)
  if (isExternal) {
    return { deferred: false, scoring: false, category: 'external', detail }
  }

  const resourceType = String(event.resourceType || '').toLowerCase()
  if (
    method === 'GET' &&
    ['fetch', 'xhr'].includes(resourceType) &&
    /(?:^|::)ERR_ABORTED$/i.test(errorText) &&
    isExplicitPrefetchRequest(event)
  ) {
    return {
      deferred: false,
      scoring: false,
      ignored: true,
      category: 'expected-prefetch',
      detail,
    }
  }
  const canDefer = method === 'GET' &&
    ['fetch', 'xhr'].includes(resourceType) &&
    /(?:^|::)ERR_ABORTED$/i.test(errorText) &&
    isRscOrPrefetchRequest(event)
  if (!canDefer) {
    return { deferred: false, scoring: true, category: 'product', detail }
  }

  const requestId = String(event.requestId || '')
  const requestStart = requestId
    ? tracker.requestStarts.find((request) => request.requestId === requestId)
    : [...tracker.requestStarts].reverse().find((request) => (
      !request.failedAt && request.method === method && request.url === url
    ))
  if (requestStart) requestStart.failedAt = sequence
  const requestSequence = requestStart?.sequence || sequence
  const destination = destinationKey(url)
  if (
    tracker.shutdownStarted &&
    requestStart &&
    requestSequence > tracker.shutdownSequence
  ) {
    return {
      deferred: false,
      scoring: false,
      ignored: true,
      category: 'shutdown-started-request',
      detail,
    }
  }
  const navigationIntent = requestStart?.navigationIntentSequence
    ? tracker.navigationIntents.find((intent) => intent.sequence === requestStart.navigationIntentSequence)
    : [...tracker.navigationIntents].reverse().find((intent) => (
      intent.sequence < requestSequence &&
      intent.destination === destination &&
      (!intent.visibleAt || intent.visibleAt > requestSequence) &&
      (!intent.supersededAt || intent.supersededAt > requestSequence)
    ))
  if (!navigationIntent) {
    tracker.speculativeAborts.push({
      sequence,
      method,
      url,
      detail,
      destination,
      requestSequence,
    })
    return {
      deferred: false,
      scoring: false,
      ignored: true,
      category: tracker.shutdownStarted ? 'shutdown-abort' : 'speculative-rsc',
      detail,
    }
  }

  const alreadyVisible = tracker.visiblePages.some((observation) => (
    observation.sequence > requestSequence &&
    observation.sequence < sequence &&
    observation.destination === destination &&
    hasVisibleDestinationProof(navigationIntent, observation)
  ))
  if (alreadyVisible) {
    return {
      deferred: false,
      scoring: false,
      ignored: true,
      category: 'visible-navigation',
      detail,
    }
  }

  const renderedBeforeShutdown = tracker.shutdownStarted && tracker.visiblePages.some((observation) => {
    const visibleContent = String(observation.primaryText || observation.text || '').trim()
    return observation.sequence > requestSequence &&
      observation.sequence < tracker.shutdownSequence &&
      observation.destination === destination &&
      visibleContent.length > 0 &&
      !/\b(?:not found|server error|application error|something went wrong)\b/i.test(visibleContent)
  })
  if (renderedBeforeShutdown) {
    return {
      deferred: false,
      scoring: false,
      ignored: true,
      category: 'visible-navigation-before-shutdown',
      detail,
    }
  }

  tracker.abortedRequests.push({
    sequence,
    method,
    url,
    detail,
    destination,
    navigationIntentSequence: navigationIntent.sequence,
    requestSequence,
    baselinePrimaryFingerprint: navigationIntent.baselinePrimaryFingerprint,
    anchor: navigationIntent.anchor,
  })
  return { deferred: true, scoring: true, category: 'product', detail }
}

function trackVisiblePage(tracker, observation = {}) {
  const sequence = ++tracker.sequence
  const destination = destinationKey(observation.url)
  tracker.visiblePages.push({
    sequence,
    destination,
    anchor: urlHash(observation.url),
    title: String(observation.title || '').trim(),
    text: String(observation.text || '').trim(),
    primaryText: String(observation.primaryText || '').trim(),
  })
  for (const intent of tracker.navigationIntents) {
    if (
      !intent.visibleAt &&
      !intent.supersededAt &&
      intent.destination === destination &&
      hasVisibleDestinationProof(intent, tracker.visiblePages.at(-1))
    ) {
      intent.visibleAt = sequence
    }
  }
}

function destinationEvidenceTokens(value) {
  try {
    return new URL(value).pathname
      .split('/')
      .filter(Boolean)
      .flatMap((part) => part.toLowerCase().split(/[^a-z0-9]+/))
      .filter((part) => part.length >= 4 && !['solutions', 'pages'].includes(part))
  } catch {
    return []
  }
}

function primaryContentFingerprint(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function hasVisibleDestinationProof(failure, observation) {
  const primaryText = String(observation.primaryText || '').trim()
  if (!primaryText || /\b(?:not found|server error|application error|something went wrong)\b/i.test(primaryText)) {
    return false
  }
  if (failure.anchor && observation.anchor === failure.anchor) return true
  const tokens = destinationEvidenceTokens(failure.destination)
  if (tokens.length === 0) return true
  const visibleTokens = new Set(primaryText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean))
  if (tokens.some((token) => visibleTokens.has(token))) return true

  const baselineFingerprint = String(failure.baselinePrimaryFingerprint || '')
  if (!baselineFingerprint) return true
  return primaryContentFingerprint(primaryText) !== baselineFingerprint
}

function finalizeBrowserIssueRecovery(tracker) {
  const pairedFailures = new Set()
  const unmatchedConsoleSignals = []

  for (const signal of tracker.consoleSignals) {
    const available = tracker.failures.filter((failure) => !pairedFailures.has(failure))
    const exact = signal.url
      ? available.filter((failure) => failure.url === signal.url)
      : []
    const candidates = signal.url ? exact : available
    const failure = candidates.sort((a, b) => (
      Math.abs(a.sequence - signal.sequence) - Math.abs(b.sequence - signal.sequence)
    ))[0]
    if (failure) pairedFailures.add(failure)
    else unmatchedConsoleSignals.push(signal)
  }

  return [
    ...tracker.failures
      .filter((failure) => !failure.recovered)
      .map((failure) => ({
        sequence: failure.sequence,
        kind: 'HTTP failure',
        detail: `498 ${failure.method} ${failure.url}`,
      })),
    ...unmatchedConsoleSignals.map((signal) => ({
      sequence: signal.sequence,
      kind: 'console error',
      detail: signal.text,
    })),
    ...tracker.abortedRequests
      .filter((failure) => !tracker.visiblePages.some((observation) => (
        observation.sequence > failure.sequence &&
        observation.destination === failure.destination &&
        hasVisibleDestinationProof(failure, observation)
      )))
      .map((failure) => ({
        sequence: failure.sequence,
        kind: 'request failed',
        detail: failure.detail,
      })),
  ]
    .sort((a, b) => a.sequence - b.sequence)
    .map(({ sequence, ...issue }) => issue)
}

module.exports = {
  beginBrowserIssueRecoveryShutdown,
  createBrowserIssueRecoveryTracker,
  finalizeBrowserIssueRecovery,
  isProductUrl,
  trackBrowserConsoleError,
  trackBrowserRequestFailure,
  trackBrowserRequestStart,
  trackBrowserResponse,
  trackNavigationIntent,
  trackVisiblePage,
}
