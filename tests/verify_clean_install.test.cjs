const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

test('npm clean-install verifier runs the full browser path by default', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

  assert.equal(pkg.scripts['verify:clean-install'], 'node scripts/verify-clean-install.cjs')
})

test('clean-install verifier keeps an explicit fast skip-browser option only in the script', () => {
  const script = fs.readFileSync(path.join(root, 'scripts', 'verify-clean-install.cjs'), 'utf8')

  assert.match(script, /--skip-browser-install/)
  assert.match(script, /playwright.+cli\.js.+install.+chromium/s)
  assert.match(script, /chromium\.launch/)
})

test('clean-install verifier checks standalone and plugin-embedded skill runtimes', () => {
  const script = fs.readFileSync(path.join(root, 'scripts', 'verify-clean-install.cjs'), 'utf8')

  assert.match(script, /\.codex['"], ['"]skills['"], ['"]betabots/)
  assert.match(script, /plugins['"], ['"]betabots['"], ['"]skills['"], ['"]betabots/)
  assert.match(script, /\.claude['"], ['"]plugins['"], ['"]local['"], ['"]betabots['"], ['"]skills['"], ['"]betabots/)
  assert.match(script, /\.cursor['"], ['"]plugins['"], ['"]betabots['"], ['"]skills['"], ['"]betabots/)
})
