'use strict'

const fs = require('node:fs')
const path = require('node:path')

function validateStorageStateSeed(seedPath) {
  const resolvedSeedPath = path.resolve(String(seedPath || ''))
  if (!seedPath) throw new Error('BETABOT_STORAGE_STATE_SEED is required when seeding storage states.')
  let stat
  try {
    stat = fs.lstatSync(resolvedSeedPath)
  } catch {
    throw new Error('Storage-state seed does not exist.')
  }
  if (!stat.isFile()) throw new Error('Storage-state seed must be a regular file.')
  let state
  try {
    state = JSON.parse(fs.readFileSync(resolvedSeedPath, 'utf8'))
  } catch {
    throw new Error('Storage-state seed must contain valid JSON.')
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('Storage-state seed must be a JSON object.')
  }
  if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) {
    throw new Error('Storage-state seed must include cookies and origins arrays.')
  }
  return { path: resolvedSeedPath }
}

function prepareSeededStorageStates(options = {}) {
  const seed = validateStorageStateSeed(options.seedPath)
  const destinations = Array.isArray(options.destinations) ? options.destinations : []
  if (destinations.length === 0) throw new Error('Storage-state seeding requires at least one destination.')
  const resolvedDestinations = destinations.map((destination) => path.resolve(String(destination || '')))
  if (resolvedDestinations.some((destination) => !destination || destination === path.resolve('.'))) {
    throw new Error('Storage-state destinations must be file paths.')
  }
  if (new Set(resolvedDestinations).size !== resolvedDestinations.length) {
    throw new Error('Storage-state destinations must be unique for every bot.')
  }
  if (resolvedDestinations.includes(seed.path)) {
    throw new Error('Storage-state seed must never be used as a destination.')
  }
  for (const destination of resolvedDestinations) {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    const temporaryPath = path.join(
      path.dirname(destination),
      `.${path.basename(destination)}.${process.pid}.${Date.now()}.seed.tmp`,
    )
    try {
      fs.copyFileSync(seed.path, temporaryPath)
      fs.chmodSync(temporaryPath, 0o600)
      fs.renameSync(temporaryPath, destination)
    } finally {
      fs.rmSync(temporaryPath, { force: true })
    }
  }
  return { destinations: [...destinations] }
}

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
  prepareSeededStorageStates,
  persistContextStorageState,
  runSessionSequence,
  validateStorageStateSeed,
}
