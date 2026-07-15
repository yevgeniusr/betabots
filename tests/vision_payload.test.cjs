const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  codexImageArgs,
  openRouterUserContent,
} = require('../skills/betabots/scripts/vision_payload.cjs')

test('attaches screenshots to Codex exec arguments', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-codex-vision-')), 'screen.png')
  fs.writeFileSync(file, Buffer.from('fake png bytes'))

  assert.deepEqual(codexImageArgs([file]), ['-i', file])
})

test('builds a multimodal OpenRouter message from a screenshot', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-vision-')), 'screen.png')
  fs.writeFileSync(file, Buffer.from('fake png bytes'))

  const content = openRouterUserContent('Choose one action.', [file])

  assert.equal(content[0].type, 'text')
  assert.equal(content[0].text, 'Choose one action.')
  assert.equal(content[1].type, 'image_url')
  assert.match(content[1].image_url.url, /^data:image\/png;base64,/)
})
