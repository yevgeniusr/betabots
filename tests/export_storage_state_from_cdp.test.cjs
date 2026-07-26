const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  exportStorageStateFromCdp,
  isLoopbackCdpEndpoint,
  parseArguments,
} = require('../skills/betabots/scripts/export_storage_state_from_cdp.cjs')

test('requires explicit loopback CDP endpoint, target URL, and output path', () => {
  assert.equal(isLoopbackCdpEndpoint('http://127.0.0.1:9222'), true)
  assert.equal(isLoopbackCdpEndpoint('http://localhost:9222'), true)
  assert.equal(isLoopbackCdpEndpoint('http://192.0.2.1:9222'), false)
  assert.throws(() => parseArguments(['--cdp', 'http://192.0.2.1:9222', '--target-url', 'https://app.test/settings/account', '--output', '/tmp/state.json']), /loopback/i)
  assert.throws(() => parseArguments(['--cdp', 'http://127.0.0.1:9222']), /target-url/i)
})

test('exports only when the requested authenticated target page is present and writes mode 0600', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-cdp-export-'))
  const outputPath = path.join(directory, 'auth', 'state.json')
  const targetUrl = 'https://app.test/settings/account'
  const state = { cookies: [], origins: [] }
  const result = await exportStorageStateFromCdp({
    endpoint: 'http://127.0.0.1:9222',
    targetUrl,
    outputPath,
    connectOverCDP: async () => ({
      contexts: () => [{
        pages: () => [{ url: () => targetUrl }],
        storageState: async ({ path: temporaryPath }) => fs.writeFileSync(temporaryPath, JSON.stringify(state)),
      }],
      close: async () => {},
    }),
  })
  assert.equal(result.outputPath, outputPath)
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), state)
  assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600)
  await assert.rejects(() => exportStorageStateFromCdp({
    endpoint: 'http://127.0.0.1:9222', targetUrl, outputPath: path.join(directory, 'missing.json'),
    connectOverCDP: async () => ({ contexts: () => [{ pages: () => [{ url: () => 'https://app.test/other' }] }], close: async () => {} }),
  }), /not present/i)
})
