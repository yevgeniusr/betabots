const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { chromium } = require('playwright')

const {
  beginBrowserIssueRecoveryShutdown,
  createBrowserIssueRecoveryTracker,
  finalizeBrowserIssueRecovery,
  trackBrowserConsoleError,
  trackBrowserRequestFailure,
  trackBrowserRequestStart,
  trackNavigationIntent,
  trackVisiblePage,
} = require('../skills/betabots/scripts/browser_issue_recovery.cjs')
const {
  collectInteractiveControls,
  executeMindAction,
} = require('../skills/betabots/scripts/thinking_body.cjs')

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

function close(server) {
  return new Promise((resolve) => server.close(resolve))
}

function delayedResponse(request, response) {
  const timer = setTimeout(() => {
    if (!response.writableEnded) {
      response.setHeader('content-type', 'application/json')
      response.end('{"ok":true}')
    }
  }, 5_000)
  request.on('close', () => clearTimeout(timer))
}

test('real browser failures separate external traffic and prove visible RSC navigation recovery', async (t) => {
  const externalServer = http.createServer((request) => request.socket.destroy())
  const externalPort = await listen(externalServer)
  t.after(() => close(externalServer))

  const appServer = http.createServer((request, response) => {
    if (request.url.startsWith('/destination?_rsc=') || request.url === '/api/messages') {
      delayedResponse(request, response)
      return
    }
    response.setHeader('content-type', 'text/html')
    response.end(`<!doctype html>
      <title>Request failure fixture</title>
      <button id="rsc">Open destination</button>
      <button id="api">Abort API</button>
      <button id="analytics">Send analytics</button>
      <main>Start page</main>
      <script>
        function abortingFetch(url, options = {}) {
          const controller = new AbortController()
          fetch(url, { ...options, signal: controller.signal }).catch(() => {})
          setTimeout(() => controller.abort(), 40)
        }
        document.querySelector('#rsc').onclick = () => {
          abortingFetch('/destination?_rsc=browser-test', { headers: { RSC: '1' } })
          setTimeout(() => {
            history.pushState({}, '', '/destination')
            document.querySelector('main').textContent = 'Destination visibly ready'
          }, 80)
        }
        document.querySelector('#api').onclick = () => abortingFetch('/api/messages')
        document.querySelector('#analytics').onclick = () => {
          fetch('http://127.0.0.1:${externalPort}/g/collect').catch(() => {})
        }
      </script>`)
  })
  const appPort = await listen(appServer)
  t.after(() => close(appServer))
  const appOrigin = `http://127.0.0.1:${appPort}`

  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  const tracker = createBrowserIssueRecoveryTracker({ appOrigins: [appOrigin] })
  const immediateProductIssues = []
  const externalIssues = []
  const productConsoleIssues = []
  const externalConsoleIssues = []
  page.on('requestfailed', (request) => {
    const result = trackBrowserRequestFailure(tracker, {
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText || '',
      resourceType: request.resourceType(),
      headers: request.headers(),
    })
    if (!result.deferred && result.scoring) immediateProductIssues.push(result.detail)
    if (!result.deferred && !result.scoring) externalIssues.push(result.detail)
  })
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const result = trackBrowserConsoleError(tracker, {
      text: message.text(),
      url: message.location()?.url,
    })
    if (!result.deferred && result.scoring === false) externalConsoleIssues.push(result.detail)
    else if (!result.deferred) productConsoleIssues.push(message.text())
  })

  await page.goto(appOrigin)
  trackNavigationIntent(tracker, { url: `${appOrigin}/destination`, controlName: 'Open destination' })
  await page.locator('#rsc').click()
  await page.waitForURL(`${appOrigin}/destination`)
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('visibly ready'))
  await page.waitForTimeout(100)
  trackVisiblePage(tracker, {
    url: page.url(),
    text: await page.locator('main').innerText(),
    primaryText: await page.locator('main').innerText(),
  })
  assert.deepEqual(finalizeBrowserIssueRecovery(tracker), [])

  await page.locator('#api').click()
  await page.waitForTimeout(100)
  assert.match(immediateProductIssues.join('\n'), /GET .*\/api\/messages net::ERR_ABORTED/)

  await page.locator('#analytics').click()
  await page.waitForTimeout(100)
  assert.match(externalIssues.join('\n'), new RegExp(`GET http://127\\.0\\.0\\.1:${externalPort}/g/collect`))
  assert.match(externalConsoleIssues.join('\n'), /Failed to load resource/i)
  assert.deepEqual(productConsoleIssues, [])
})

test('real browser context shutdown ignores only teardown-induced request aborts', async (t) => {
  const pendingRequests = []
  const appServer = http.createServer((request, response) => {
    if (request.url.startsWith('/en?_rsc=')) {
      pendingRequests.push(request.url)
      delayedResponse(request, response)
      return
    }
    response.setHeader('content-type', 'text/html')
    response.end(`<!doctype html>
      <title>Shutdown request fixture</title>
      <button id="active">Abort during active browsing</button>
      <button id="shutdown">Leave request pending for shutdown</button>
      <script>
        document.querySelector('#active').onclick = () => {
          const controller = new AbortController()
          fetch('/en?_rsc=active-browser', {
            headers: { RSC: '1' },
            signal: controller.signal,
          }).catch(() => {})
          setTimeout(() => controller.abort(), 40)
        }
        document.querySelector('#shutdown').onclick = () => {
          window.shutdownController = new AbortController()
          fetch('/en?_rsc=shutdown-browser', {
            headers: { RSC: '1' },
            signal: window.shutdownController.signal,
          }).catch(() => {})
        }
      </script>`)
  })
  const appPort = await listen(appServer)
  t.after(() => close(appServer))
  const appOrigin = `http://127.0.0.1:${appPort}`

  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())

  const activeContext = await browser.newContext()
  const activePage = await activeContext.newPage()
  const activeTracker = createBrowserIssueRecoveryTracker({ appOrigins: [appOrigin] })
  activePage.on('requestfailed', (request) => {
    trackBrowserRequestFailure(activeTracker, {
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText || '',
      resourceType: request.resourceType(),
      headers: request.headers(),
    })
  })
  await activePage.goto(`${appOrigin}/en`)
  trackVisiblePage(activeTracker, {
    url: activePage.url(),
    text: await activePage.locator('body').innerText(),
  })
  trackNavigationIntent(activeTracker, { url: `${appOrigin}/en`, controlName: 'Abort during active browsing' })
  const activeFailure = activePage.waitForEvent('requestfailed')
  await activePage.locator('#active').click()
  await activeFailure
  assert.deepEqual(finalizeBrowserIssueRecovery(activeTracker), [{
    kind: 'request failed',
    detail: `GET ${appOrigin}/en?_rsc=active-browser net::ERR_ABORTED`,
  }])
  await activeContext.close()

  const shutdownContext = await browser.newContext()
  const shutdownPage = await shutdownContext.newPage()
  const shutdownTracker = createBrowserIssueRecoveryTracker({ appOrigins: [appOrigin] })
  const shutdownResults = []
  shutdownPage.on('requestfailed', (request) => {
    shutdownResults.push(trackBrowserRequestFailure(shutdownTracker, {
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText || '',
      resourceType: request.resourceType(),
      headers: request.headers(),
    }))
  })
  await shutdownPage.goto(`${appOrigin}/en`)
  trackVisiblePage(shutdownTracker, {
    url: shutdownPage.url(),
    text: await shutdownPage.locator('body').innerText(),
  })
  await shutdownPage.locator('#shutdown').click()
  while (!pendingRequests.some((url) => url.includes('shutdown-browser'))) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  const shutdownFailure = shutdownPage.waitForEvent('requestfailed')
  beginBrowserIssueRecoveryShutdown(shutdownTracker)
  await shutdownPage.evaluate(() => window.shutdownController.abort())
  await shutdownFailure
  await shutdownContext.close()

  assert.equal(shutdownResults.length, 1)
  assert.equal(shutdownResults[0].category, 'shutdown-abort')
  assert.equal(shutdownResults[0].ignored, true)
  assert.deepEqual(finalizeBrowserIssueRecovery(shutdownTracker), [])
})

test('real browser ignores speculative RSC cancellation but scores a failed clicked-link navigation', async (t) => {
  const pendingRequests = []
  const appServer = http.createServer((request, response) => {
    if (request.url.includes('_rsc=')) {
      pendingRequests.push(request.url)
      delayedResponse(request, response)
      return
    }
    response.setHeader('content-type', 'text/html')
    response.end(`<!doctype html>
      <title>Navigation intent fixture</title>
      <a id="failed-link" href="/failed-destination">Open failed destination</a>
      <main>Start page</main>
      <script>
        function pendingRsc(url) {
          const controller = new AbortController()
          fetch(url, { headers: { RSC: '1' }, signal: controller.signal }).catch(() => {})
          return controller
        }
        const speculative = pendingRsc('/prefetched-destination?_rsc=automatic')
        setTimeout(() => speculative.abort(), 40)
        window.teardownPrefetch = pendingRsc('/teardown-destination?_rsc=teardown')
        document.querySelector('#failed-link').onclick = (event) => {
          event.preventDefault()
          history.pushState(null, '', '/failed-destination')
          const clicked = pendingRsc('/failed-destination?_rsc=clicked')
          setTimeout(() => clicked.abort(), 40)
        }
      </script>`)
  })
  const appPort = await listen(appServer)
  t.after(() => close(appServer))
  const appOrigin = `http://127.0.0.1:${appPort}`

  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const context = await browser.newContext()
  const page = await context.newPage()
  const tracker = createBrowserIssueRecoveryTracker({ appOrigins: [appOrigin] })
  const requestIds = new WeakMap()
  const failureResults = []
  let requestSequence = 0

  page.on('request', (request) => {
    const requestId = `request-${++requestSequence}`
    requestIds.set(request, requestId)
    trackBrowserRequestStart(tracker, {
      requestId,
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      headers: request.headers(),
    })
  })
  page.on('requestfailed', (request) => {
    failureResults.push(trackBrowserRequestFailure(tracker, {
      requestId: requestIds.get(request),
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText || '',
      resourceType: request.resourceType(),
      headers: request.headers(),
    }))
  })

  await page.goto(appOrigin)
  trackVisiblePage(tracker, {
    url: page.url(),
    text: await page.locator('body').innerText(),
    primaryText: await page.locator('main').innerText(),
  })
  while (!failureResults.some((result) => /prefetched-destination/.test(result.detail))) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  const speculativeResult = failureResults.find((result) => /prefetched-destination/.test(result.detail))
  assert.equal(speculativeResult.category, 'speculative-rsc')
  assert.equal(speculativeResult.ignored, true)

  const bodySnapshot = await collectInteractiveControls(page)
  const link = bodySnapshot.controls.find((control) => control.name === 'Open failed destination')
  assert.equal(link.href, `${appOrigin}/failed-destination`)
  trackNavigationIntent(tracker, { url: link.href, controlName: link.name })
  const clickedFailure = page.waitForEvent('requestfailed', (request) => request.url().includes('failed-destination'))
  const actionResult = await executeMindAction(page, bodySnapshot, {
    type: 'click',
    targetId: link.id,
  })
  assert.equal(actionResult.ok, true)
  await clickedFailure
  trackVisiblePage(tracker, {
    url: page.url(),
    text: await page.locator('body').innerText(),
    primaryText: await page.locator('main').innerText(),
  })

  while (!pendingRequests.some((url) => url.includes('teardown-destination'))) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  const teardownFailure = page.waitForEvent('requestfailed', (request) => request.url().includes('teardown-destination'))
  beginBrowserIssueRecoveryShutdown(tracker)
  await page.evaluate(() => window.teardownPrefetch.abort())
  await teardownFailure
  await context.close()

  assert.deepEqual(finalizeBrowserIssueRecovery(tracker), [{
    kind: 'request failed',
    detail: `GET ${appOrigin}/failed-destination?_rsc=clicked net::ERR_ABORTED`,
  }])
  assert.equal(
    failureResults.some((result) => result.category === 'shutdown-abort' && /teardown-destination/.test(result.detail)),
    true,
  )
})
