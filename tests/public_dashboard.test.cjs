const assert = require('node:assert/strict')
const { after, before, test } = require('node:test')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const net = require('node:net')
const path = require('node:path')
const { chromium } = require('playwright')

const fixture = '/Users/mac/.hermes/evidence/cryptonary-v2-public-20260726-195637/study-output'
let server
let baseUrl

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer()
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address()
      listener.close(() => resolve(port))
    })
  })
}

async function waitForServer(url) {
  let lastError
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw lastError || new Error('Dashboard server did not start')
}

before(async () => {
  const port = await freePort()
  baseUrl = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['web/server.cjs', '--port', String(port), '--runs', fixture], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
  })
  await waitForServer(baseUrl)
})

after(async () => {
  if (!server || server.exitCode !== null) return
  const exited = once(server, 'exit')
  server.kill()
  await exited
})

test('public run discovery hides dot-prefixed runtime directories and retains visible partial runs', async () => {
  const response = await fetch(`${baseUrl}/api/runs`)
  assert.equal(response.status, 200)
  const payload = await response.json()
  const runIds = payload.runs.map((run) => run.id).sort()

  assert.deepEqual(runIds, [
    'conversion-evaluation',
    'decision-allocation-treatment',
    'neutral-discovery',
  ])
  assert.equal(payload.runs.some((run) => run.id.startsWith('.')), false)
  assert.equal(payload.runs.some((run) => run.hasSummary === false), false)
})

test('the primary report IA exposes four human-facing views and keeps legacy evidence reachable', async () => {
  const response = await fetch(`${baseUrl}/`)
  assert.equal(response.status, 200)
  const page = await response.text()

  for (const label of ['Overview', 'Bot stories', 'Evidence', 'Technical details']) {
    assert.match(page, new RegExp(`>${label}<`))
  }
  assert.match(page, /role="tablist"/)
  assert.match(page, /analysis\.md/)
  assert.match(page, /Betabook/)
  assert.match(page, /Destiny/)
  assert.match(page, /Files & artifacts/)
  assert.match(page, /id="tab-technical"[^>]*hidden/)
  assert.doesNotMatch(page, /<aside class="inspector/)
})

test('the report stays compact and keyboard-operable at required viewport widths', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 900, height: 900 },
      { width: 1024, height: 900 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto(baseUrl, { waitUntil: 'networkidle' })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${viewport.width}px has no horizontal overflow`)
    }

    const tabs = page.getByRole('tab')
    await assert.doesNotReject(() => tabs.nth(0).focus())
    assert.equal(await tabs.count(), 4)
    assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true')
    await page.keyboard.press('ArrowRight')
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true')
    assert.match(await page.locator('#tab-bots').innerText(), /Bot stories|No bot/i)
    assert.equal(errors.length, 0, errors.join('\n'))
  } finally {
    await browser.close()
  }
})

test('overview leads with source-derived study highlights before complete notes', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    const highlights = page.getByTestId('source-highlights')
    assert.equal(await highlights.count(), 1)
    assert.match(await highlights.innerText(), /Top Bot Ideas|Confidence Tiers/)
    assert.equal(await page.getByText('Read full study notes', { exact: true }).count(), 1)
  } finally {
    await browser.close()
  }
})

test('selected bot stories lead with source facts and keep the full 133-event timeline closed', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    await page.locator('[data-run="decision-allocation-treatment"]').click()
    await page.getByRole('tab', { name: 'Bot stories' }).click()
    await page.locator('[data-bot="thoughtful-betabot-001"]').click()

    const detail = page.locator('#bot-story-detail .bot-detail')
    await detail.waitFor()
    for (const text of [
      'Life goal',
      'End reason',
      'Ideas',
      'Action evidence',
      'Truth assessments',
      'Life-cost decisions',
    ]) {
      const source = detail.getByText(text, { exact: true }).first()
      assert.equal(await source.isVisible(), true, `${text} is visible in the selected story`)
    }

    const timeline = detail.locator('details.story-timeline-disclosure')
    assert.equal(await timeline.count(), 1)
    assert.equal(await timeline.getAttribute('open'), null)
    assert.equal(await timeline.locator('summary').innerText(), 'Open full evidence timeline (133 events)')
    assert.equal(await timeline.locator('li').count(), 133)

    const sourceEnd = await detail.getByRole('heading', { name: 'Life-cost decisions' }).evaluate((heading) => {
      const timeline = heading.parentElement?.parentElement?.querySelector('details.story-timeline-disclosure')
      return Boolean(timeline && (heading.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING))
    })
    assert.equal(sourceEnd, true, 'source-derived sections precede the raw event timeline')
  } finally {
    await browser.close()
  }
})
