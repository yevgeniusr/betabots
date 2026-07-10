const test = require('node:test')
const assert = require('node:assert/strict')

const { newKeywordMatches } = require('../skills/betabots/scripts/keyword_scoring.cjs')

test('a persistent risk signal is charged only once per session', () => {
  const seen = new Set()
  const keywords = ['verify email', 'failed']

  assert.deepEqual(newKeywordMatches('Verify email before continuing', keywords, seen), ['verify email'])
  assert.deepEqual(newKeywordMatches('Sidebar: Verify Email', keywords, seen), [])
  assert.deepEqual(newKeywordMatches('Upload failed', keywords, seen), ['failed'])
})
