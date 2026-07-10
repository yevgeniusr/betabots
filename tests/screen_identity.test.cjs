const test = require('node:test')
const assert = require('node:assert/strict')

const { screenFingerprint } = require('../skills/betabots/scripts/screen_identity.cjs')

test('SPA tabs with a shared shell have distinct screen fingerprints', () => {
  const sharedText = 'Self-degree Organization Overview People Permissions Templates Resources Exams Results Simulators Settings '

  const overview = screenFingerprint({
    url: 'http://localhost:3012/organization#overview',
    title: 'Self-degree',
    text: `${sharedText}Effective access Employee self-access is mandatory`,
  })
  const results = screenFingerprint({
    url: 'http://localhost:3012/organization#results',
    title: 'Self-degree',
    text: `${sharedText}Verification results E2E employee Evidence integrity`,
  })

  assert.notEqual(overview, results)
})

test('volatile identifiers and counters do not create false novelty', () => {
  const first = screenFingerprint({
    url: 'https://app.example.test/results',
    title: 'Results',
    text: 'Attempt 1 0198c111-1111-7111-8111-111111111111 passed',
  })
  const second = screenFingerprint({
    url: 'https://app.example.test/results',
    title: 'Results',
    text: 'Attempt 2 0198c222-2222-7222-8222-222222222222 passed',
  })

  assert.equal(first, second)
})
