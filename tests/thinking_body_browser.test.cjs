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
    <button onclick="document.querySelector('#status').textContent='opened'">View details</button>
    <p id="status">closed</p>
    <div style="height: 2000px"></div>
    <button>Offscreen action</button>
  `)

  const snapshot = await collectInteractiveControls(page)
  const button = snapshot.controls.find((control) => control.name === 'View details')
  const textbox = snapshot.controls.find((control) => control.name === 'Note')
  const password = snapshot.controls.find((control) => control.name === 'Password')

  assert.ok(button)
  assert.ok(textbox)
  assert.ok(password)
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
