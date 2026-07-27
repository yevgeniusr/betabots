const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  normalizeSessionPlan,
  prepareSeededStorageStates,
  persistContextStorageState,
  runSessionSequence,
} = require('../skills/betabots/scripts/session_scheduler.cjs')

test('runs configured sessions in order and waits only between sessions', async () => {
  const events = []

  const results = await runSessionSequence({
    sessionCount: 3,
    sessionGapMs: 12_000,
    runSession: async ({ sessionNumber, sessionCount }) => {
      events.push(`session-${sessionNumber}-of-${sessionCount}`)
      return { sessionNumber }
    },
    wait: async (milliseconds) => events.push(`wait-${milliseconds}`),
  })

  assert.deepEqual(events, [
    'session-1-of-3',
    'wait-12000',
    'session-2-of-3',
    'wait-12000',
    'session-3-of-3',
  ])
  assert.deepEqual(results.map((result) => result.sessionNumber), [1, 2, 3])
})

test('normalizes a positive session count and non-negative gap', () => {
  assert.deepEqual(
    normalizeSessionPlan({ sessionCount: '3', sessionGapMinutes: '1.5' }),
    { sessionCount: 3, sessionGapMinutes: 1.5, sessionGapMs: 90_000 },
  )
  assert.throws(
    () => normalizeSessionPlan({ sessionCount: 0, sessionGapMinutes: 1 }),
    /session count/i,
  )
  assert.throws(
    () => normalizeSessionPlan({ sessionCount: 2, sessionGapMinutes: -1 }),
    /session gap/i,
  )
})

test('session execution rejects invalid counts and missing session work', async () => {
  await assert.rejects(
    runSessionSequence({ sessionCount: 0, runSession: async () => {} }),
    /session count/i,
  )
  await assert.rejects(
    runSessionSequence({ sessionCount: 1 }),
    /runSession/i,
  )
})

test('writes browser storage state to the reusable session path', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-session-state-'))
  const storagePath = path.join(directory, 'nested', 'bot.json')
  const calls = []
  const context = {
    storageState: async (options) => {
      calls.push(options)
      fs.writeFileSync(options.path, JSON.stringify({ origins: [{ origin: 'https://example.test' }] }))
    },
  }

  const result = await persistContextStorageState(context, storagePath)

  assert.equal(result.persisted, true)
  assert.equal(result.path, storagePath)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].indexedDB, true)
  assert.notEqual(calls[0].path, storagePath)
  assert.deepEqual(JSON.parse(fs.readFileSync(storagePath, 'utf8')), {
    origins: [{ origin: 'https://example.test' }],
  })
  assert.equal(fs.statSync(storagePath).mode & 0o777, 0o600)
})

test('seeds validated storage state into unique private per-bot files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-seed-state-'))
  const seedPath = path.join(directory, 'approved-seed.json')
  const destinations = [
    path.join(directory, 'states', 'bot-a.json'),
    path.join(directory, 'states', 'bot-b.json'),
  ]
  const fixture = { cookies: [], origins: [{ origin: 'https://app.test', localStorage: [] }] }
  fs.writeFileSync(seedPath, JSON.stringify(fixture), { mode: 0o644 })

  const result = prepareSeededStorageStates({ seedPath, destinations })

  assert.deepEqual(result.destinations, destinations)
  for (const destination of destinations) {
    assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), fixture)
    assert.equal(fs.statSync(destination).mode & 0o777, 0o600)
  }
  assert.equal(fs.statSync(seedPath).mode & 0o777, 0o644)
})

test('fails closed for malformed seed files and refuses duplicate or seed destinations without exposing contents', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-invalid-seed-'))
  const seedPath = path.join(directory, 'seed.json')
  const destination = path.join(directory, 'bot.json')
  fs.writeFileSync(seedPath, JSON.stringify({ cookies: [], origins: [] }))

  assert.throws(
    () => prepareSeededStorageStates({ seedPath, destinations: [destination, destination] }),
    /unique/i,
  )
  assert.throws(
    () => prepareSeededStorageStates({ seedPath, destinations: [seedPath] }),
    /seed/i,
  )

  fs.writeFileSync(seedPath, JSON.stringify({ cookies: 'not-an-array', origins: [] }))
  assert.throws(
    () => prepareSeededStorageStates({ seedPath, destinations: [destination] }),
    (error) => /cookies/i.test(error.message) && !error.message.includes('not-an-array'),
  )
  fs.writeFileSync(seedPath, 'not json')
  assert.throws(
    () => prepareSeededStorageStates({ seedPath, destinations: [destination] }),
    (error) => /valid JSON/i.test(error.message) && !error.message.includes('not json'),
  )
})
