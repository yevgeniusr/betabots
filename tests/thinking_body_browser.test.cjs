const test = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const {
  collectInteractiveControls,
  executeMindAction,
} = require('../skills/betabots/scripts/thinking_body.cjs')

test('the mind inventory executes against the same visible browser control', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent(`
    <label>Note <input aria-label="Note"></label>
    <label>Password <input type="password" aria-label="Password" value="secret-value"></label>
    <base href="https://app.test/en/">
    <a href="corporate/for-companies">For organizations</a>
    <button onclick="document.querySelector('#status').textContent='opened'">View details</button>
    <p id="status">closed</p>
    <iframe title="Activity" style="width: 400px; height: 160px" srcdoc="<button>Complete scenario</button>"></iframe>
    <div style="height: 2000px"></div>
    <button>Offscreen action</button>
  `)

  const snapshot = await collectInteractiveControls(page)
  const button = snapshot.controls.find((control) => control.name === 'View details')
  const textbox = snapshot.controls.find((control) => control.name === 'Note')
  const password = snapshot.controls.find((control) => control.name === 'Password')
  const activityButton = snapshot.controls.find((control) => control.name === 'Complete scenario')
  const organizationLink = snapshot.controls.find((control) => control.name === 'For organizations')

  assert.ok(button)
  assert.ok(textbox)
  assert.ok(password)
  assert.ok(activityButton)
  assert.ok(organizationLink)
  assert.equal(organizationLink.href, 'https://app.test/en/corporate/for-companies')
  assert.equal(activityButton.isMainFrame, false)
  assert.match(activityButton.frameUrl, /about:srcdoc/)
  assert.equal(password.value, '')
  assert.equal(snapshot.controls.some((control) => control.name === 'Offscreen action'), false)
  assert.equal((await executeMindAction(page, snapshot, {
    type: 'click',
    targetId: button.id,
  })).ok, true)
  assert.equal(await page.locator('#status').innerText(), 'opened')
  assert.equal((await executeMindAction(page, snapshot, {
    type: 'fill',
    targetId: textbox.id,
    value: 'remember this',
  })).ok, true)
  assert.equal(await page.getByRole('textbox', { name: 'Note' }).inputValue(), 'remember this')
})

test('selects a uniquely visible option from an ARIA combobox', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent(`
    <button
      aria-controls="visibility-options"
      aria-expanded="false"
      aria-label="Visibility"
      role="combobox"
      onclick="this.setAttribute('aria-expanded', 'true'); document.querySelector('#visibility-options').hidden = false"
    >My company</button>
    <div id="visibility-options" role="listbox" hidden>
      <button role="option" onclick="document.querySelector('#selected').textContent = 'Only me'">Only me</button>
      <button role="option" onclick="document.querySelector('#selected').textContent = 'Public'">Public</button>
    </div>
    <p id="selected">My company</p>
  `)

  const snapshot = await collectInteractiveControls(page)
  const combobox = snapshot.controls.find((control) => control.name === 'Visibility')
  assert.ok(combobox)

  const result = await executeMindAction(page, snapshot, {
    type: 'select',
    targetId: combobox.id,
    value: 'Only me',
  })

  assert.equal(result.ok, true)
  assert.equal(await page.locator('#selected').innerText(), 'Only me')
})

test('selects an already-open custom combobox option after its trigger is covered', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent(`
    <button aria-label="Visibility" role="combobox" style="visibility: hidden">My company</button>
    <div role="listbox">
      <button role="option" onclick="document.querySelector('#selected').textContent = 'Only me'">Only me</button>
      <button role="option" onclick="document.querySelector('#selected').textContent = 'Public'">Public</button>
    </div>
    <p id="selected">My company</p>
  `)

  const snapshot = await collectInteractiveControls(page)
  const result = await executeMindAction(page, snapshot, {
    type: 'select',
    targetId: 'Visibility',
    value: 'Only me',
  })

  assert.equal(result.ok, true)
  assert.equal(await page.locator('#selected').innerText(), 'Only me')
})

test('a replaced textarea is retried once through the same visible semantic control', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent('<textarea aria-label="Message"></textarea>')

  const snapshot = await collectInteractiveControls(page)
  const textbox = snapshot.controls.find((control) => control.name === 'Message')
  await page.evaluate(() => {
    const replacement = document.createElement('textarea')
    replacement.setAttribute('aria-label', 'Message')
    document.querySelector('textarea').replaceWith(replacement)
  })

  const result = await executeMindAction(page, snapshot, {
    type: 'fill',
    targetId: textbox.id,
    value: 'A response after rerender',
  })

  assert.equal(result.ok, true)
  assert.equal(result.retried, true)
  assert.equal(await page.getByRole('textbox', { name: 'Message' }).inputValue(), 'A response after rerender')
})

test('reports visible-link navigation intent immediately before the validated click', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent(`
    <a href="https://app.test/destination" onclick="event.preventDefault()">Open destination</a>
  `)
  const snapshot = await collectInteractiveControls(page)
  const link = snapshot.controls.find((control) => control.name === 'Open destination')
  const intents = []

  const result = await executeMindAction(page, snapshot, {
    type: 'click',
    targetId: link.id,
  }, {
    beforeTargetAction: ({ action, control }) => intents.push({ action, control }),
  })

  assert.equal(result.ok, true)
  assert.equal(intents.length, 1)
  assert.equal(intents[0].action.type, 'click')
  assert.equal(intents[0].control.href, 'https://app.test/destination')
})

test('semantic retry refuses to guess between duplicate visible textareas', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent('<textarea aria-label="Message"></textarea>')

  const snapshot = await collectInteractiveControls(page)
  const textbox = snapshot.controls.find((control) => control.name === 'Message')
  await page.evaluate(() => {
    document.body.innerHTML = [
      '<textarea aria-label="Message"></textarea>',
      '<textarea aria-label="Message"></textarea>',
    ].join('')
  })

  const result = await executeMindAction(page, snapshot, {
    type: 'fill',
    targetId: textbox.id,
    value: 'Do not guess',
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /2 visible semantic matches/i)
  assert.deepEqual(
    await page.getByRole('textbox', { name: 'Message' }).evaluateAll((elements) => elements.map((element) => element.value)),
    ['', ''],
  )
})

test('collapses duplicate same-label same-href links and retries them deterministically', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent('<a href="/roadmap/1?sharing=true">Manage sharing</a>')

  const snapshot = await collectInteractiveControls(page)
  const original = snapshot.controls.find((control) => control.name === 'Manage sharing')
  await page.evaluate(() => {
    document.body.innerHTML = Array.from(
      { length: 7 },
      (_, index) => `<a href="/roadmap/1?sharing=true" onclick="event.preventDefault(); document.body.dataset.clicked='${index}'">Manage sharing</a>`,
    ).join('')
  })

  const freshSnapshot = await collectInteractiveControls(page)
  assert.equal(freshSnapshot.controls.filter((control) => control.name === 'Manage sharing').length, 1)
  await page.evaluate(() => {
    document.body.innerHTML = Array.from(
      { length: 7 },
      (_, index) => `<a href="/roadmap/1?sharing=true" onclick="event.preventDefault(); document.body.dataset.clicked='${index}'">Manage sharing</a>`,
    ).join('')
  })

  const result = await executeMindAction(page, snapshot, {
    type: 'click',
    targetId: original.id,
  })

  assert.equal(result.ok, true)
  assert.equal(result.retried, true)
  assert.equal(await page.locator('body').getAttribute('data-clicked'), '0')
})

test('keeps same-label links with case-sensitive destinations distinct', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent(`
    <base href="https://app.test/">
    <a href="/roadmap/A">Manage sharing</a>
    <a href="/roadmap/a">Manage sharing</a>
  `)

  const snapshot = await collectInteractiveControls(page)
  assert.deepEqual(
    snapshot.controls
      .filter((control) => control.name === 'Manage sharing')
      .map((control) => new URL(control.href).pathname),
    ['/roadmap/A', '/roadmap/a'],
  )
})

test('excludes inert aria-hidden and overlay-covered background controls', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await page.setContent(`
    <button style="position: fixed; left: 20px; top: 20px">Available action</button>
    <div aria-hidden="true"><button>Aria hidden action</button></div>
    <div inert><button>Inert action</button></div>
    <button style="position: fixed; left: 20px; top: 120px; width: 180px; height: 40px">Covered action</button>
    <div style="position: fixed; z-index: 10; left: 0; top: 100px; width: 240px; height: 90px; background: white">Modal overlay</div>
  `)

  const snapshot = await collectInteractiveControls(page)
  const names = snapshot.controls.map((control) => control.name)

  assert.ok(names.includes('Available action'))
  assert.equal(names.includes('Aria hidden action'), false)
  assert.equal(names.includes('Inert action'), false)
  assert.equal(names.includes('Covered action'), false)
})

test('scrolls the visible nested overflow container when the document is fixed', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 390, height: 720 } })
  await page.setContent(`
    <style>
      html, body { height: 100%; margin: 0; overflow: hidden; }
      main { height: 100%; overflow-y: auto; }
      .content { height: 2400px; }
      nav { position: fixed; inset: auto 0 0; height: 72px; background: white; }
    </style>
    <main data-testid="scroll-region"><div class="content">Dashboard</div></main>
    <nav>Navigation</nav>
  `)
  await page.mouse.move(195, 700)

  const result = await executeMindAction(page, { controls: [], locators: new Map() }, {
    type: 'scroll',
    value: 'down',
  })

  assert.equal(result.ok, true)
  assert.ok(await page.getByTestId('scroll-region').evaluate((element) => element.scrollTop > 0))
})

test('scrolls a visible activity iframe when its controls extend below the fold', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.setContent(`
    <style>
      html, body { height: 100%; margin: 0; overflow: hidden; }
      iframe { display: block; width: 800px; height: 620px; margin: 40px auto; border: 0; }
    </style>
    <iframe title="Quest simulator" srcdoc="
      <style>
        html, body { height: 100%; margin: 0; overflow: hidden; }
        main { height: 100%; overflow-y: auto; }
        .content { height: 1800px; }
      </style>
      <main data-testid='activity-scroll-region'>
        <div class='content'>Activity choices</div>
        <button>Final activity choice</button>
      </main>
    "></iframe>
  `)

  const result = await executeMindAction(page, { controls: [], locators: new Map() }, {
    type: 'scroll',
    value: 'down',
  })
  const activityFrame = page.frames().find((frame) => frame !== page.mainFrame())

  assert.equal(result.ok, true)
  assert.ok(await activityFrame.locator('[data-testid="activity-scroll-region"]').evaluate((element) => element.scrollTop > 0))
})

test('semantic retry revalidates a replacement that became disabled', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.setContent('<textarea aria-label="Message"></textarea>')

  const snapshot = await collectInteractiveControls(page)
  const textbox = snapshot.controls.find((control) => control.name === 'Message')
  await page.evaluate(() => {
    const replacement = document.createElement('textarea')
    replacement.setAttribute('aria-label', 'Message')
    replacement.disabled = true
    document.querySelector('textarea').replaceWith(replacement)
  })

  const result = await executeMindAction(page, snapshot, {
    type: 'fill',
    targetId: textbox.id,
    value: 'Must remain blocked',
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /disabled/i)
  assert.equal(await page.getByRole('textbox', { name: 'Message' }).inputValue(), '')
})
