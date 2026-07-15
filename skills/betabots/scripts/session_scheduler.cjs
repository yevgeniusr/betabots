'use strict'

const fs = require('node:fs')
const path = require('node:path')

function normalizeSessionPlan(input = {}) {
  const sessionCount = Number(input.sessionCount ?? 1)
  const sessionGapMinutes = Number(input.sessionGapMinutes ?? 0)
  if (!Number.isInteger(sessionCount) || sessionCount < 1) {
    throw new Error('Session count must be a positive integer.')
  }
  if (!Number.isFinite(sessionGapMinutes) || sessionGapMinutes < 0) {
    throw new Error('Session gap must be a non-negative number of minutes.')
  }
  return {
    sessionCount,
    sessionGapMinutes,
    sessionGapMs: sessionGapMinutes * 60_000,
  }
}

async function persistContextStorageState(context, storageStatePath) {
  if (!storageStatePath) return { persisted: false, path: '' }
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true })
  const temporaryPath = path.join(
    path.dirname(storageStatePath),
    `.${path.basename(storageStatePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  try {
    await context.storageState({ path: temporaryPath, indexedDB: true })
    fs.chmodSync(temporaryPath, 0o600)
    fs.renameSync(temporaryPath, storageStatePath)
  } finally {
    fs.rmSync(temporaryPath, { force: true })
  }
  return { persisted: true, path: storageStatePath }
}

async function runSessionSequence(options = {}) {
  const sessionCount = Number(options.sessionCount ?? 1)
  const sessionGapMs = Number(options.sessionGapMs ?? 0)
  const runSession = options.runSession
  const wait = options.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  if (!Number.isInteger(sessionCount) || sessionCount < 1) {
    throw new Error('Session count must be a positive integer.')
  }
  if (!Number.isFinite(sessionGapMs) || sessionGapMs < 0) {
    throw new Error('Session gap must be a non-negative number of milliseconds.')
  }
  if (typeof runSession !== 'function') {
    throw new Error('runSession must be a function.')
  }
  const results = []

  for (let index = 0; index < sessionCount; index += 1) {
    const sessionNumber = index + 1
    results.push(await runSession({ sessionNumber, sessionCount }))
    if (sessionNumber < sessionCount && sessionGapMs > 0) {
      await wait(sessionGapMs)
    }
  }
  return results
}

module.exports = {
  normalizeSessionPlan,
  persistContextStorageState,
  runSessionSequence,
}
