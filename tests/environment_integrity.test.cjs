const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const {
  applyIntegrityToResults,
  detectedMockHeaders,
  evaluateEnvironmentIntegrity,
  probeEnvironmentIntegrity,
  resolveStorageStatePath,
} = require('../skills/betabots/scripts/environment_integrity.cjs')

const realAttestation = {
  mode: 'real',
  auth: { mode: 'real' },
  database: {
    connected: true,
    driver: 'postgres',
    persistent: true,
  },
  mocksDetected: false,
}

test('synthetic local-storage authentication invalidates a product run', () => {
  const result = evaluateEnvironmentIntegrity({
    requireRealBackend: true,
    authTokenTemplate: 'synthetic-token:{id}',
    attestation: realAttestation,
  })

  assert.equal(result.valid, false)
  assert.equal(result.scoreCap, 0)
  assert.ok(result.reasons.includes('synthetic_auth'))
})

test('real mode accepts only real authentication and persistent PostgreSQL', () => {
  const result = evaluateEnvironmentIntegrity({
    requireRealBackend: true,
    attestation: realAttestation,
  })

  assert.equal(result.valid, true)
  assert.equal(result.verified, true)
  assert.equal(result.scoreCap, 100)
  assert.deepEqual(result.reasons, [])
})

test('real mode fails closed without a valid attestation', () => {
  const missing = evaluateEnvironmentIntegrity({ requireRealBackend: true })
  const mocked = evaluateEnvironmentIntegrity({
    requireRealBackend: true,
    attestation: {
      ...realAttestation,
      mode: 'mock',
      mocksDetected: true,
    },
  })
  const volatile = evaluateEnvironmentIntegrity({
    requireRealBackend: true,
    attestation: {
      ...realAttestation,
      database: { connected: true, driver: 'memory', persistent: false },
    },
  })

  assert.equal(missing.scoreCap, 0)
  assert.ok(missing.reasons.includes('attestation_missing'))
  assert.equal(mocked.scoreCap, 0)
  assert.ok(mocked.reasons.includes('mock_backend'))
  assert.equal(volatile.scoreCap, 0)
  assert.ok(volatile.reasons.includes('database_not_persistent_postgres'))
})

test('unverified mode cannot retain a product-quality score', () => {
  const result = evaluateEnvironmentIntegrity({})

  assert.equal(result.valid, false)
  assert.equal(result.verified, false)
  assert.equal(result.scoreCap, 0)
  assert.ok(result.reasons.includes('environment_unverified'))
})

test('mock response headers invalidate an otherwise real attestation', () => {
  const result = evaluateEnvironmentIntegrity({
    requireRealBackend: true,
    attestation: realAttestation,
    detectedMockHeaders: ['x-mock-server'],
  })

  assert.equal(result.valid, false)
  assert.equal(result.scoreCap, 0)
  assert.ok(result.reasons.includes('mock_response_header'))
})

test('browser response header records expose common mock markers', () => {
  assert.deepEqual(
    detectedMockHeaders({
      'content-type': 'application/json',
      'x-mock-response': 'true',
    }),
    ['x-mock-response'],
  )
})

test('storage state templates resolve persona placeholders without becoming synthetic auth', () => {
  const resolved = resolveStorageStatePath(
    '/tmp/storage/{id}-{name}-{role}.json',
    { id: 'bot-001', name: 'Maya Chen', role: 'L&D Admin' },
  )

  assert.equal(
    resolved,
    '/tmp/storage/bot-001-Maya-Chen-L-D-Admin.json',
  )
})

test('missing real browser storage state invalidates real-backend mode', () => {
  const result = evaluateEnvironmentIntegrity({
    requireRealBackend: true,
    attestation: realAttestation,
    storageStateErrors: ['missing /tmp/storage/bot-001.json'],
  })

  assert.equal(result.scoreCap, 0)
  assert.ok(result.reasons.includes('storage_state_missing'))
})

async function withServer(handler, work) {
  const server = http.createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    return await work(`http://127.0.0.1:${address.port}/integrity`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('integrity probe accepts a real attestation returned by the running product', async () => {
  await withServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(realAttestation))
  }, async (url) => {
    const result = await probeEnvironmentIntegrity({
      requireRealBackend: true,
      attestationUrl: url,
      timeoutMs: 1000,
    })

    assert.equal(result.valid, true)
    assert.equal(result.verified, true)
    assert.equal(result.attestationUrl, url)
  })
})

test('integrity probe fails closed on mock headers, malformed responses, and missing URLs', async () => {
  const missing = await probeEnvironmentIntegrity({
    requireRealBackend: true,
    attestationUrl: '',
  })
  assert.equal(missing.scoreCap, 0)
  assert.ok(missing.reasons.includes('attestation_missing'))

  await withServer((_request, response) => {
    response.setHeader('x-mock-server', 'true')
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(realAttestation))
  }, async (url) => {
    const result = await probeEnvironmentIntegrity({
      requireRealBackend: true,
      attestationUrl: url,
      timeoutMs: 1000,
    })
    assert.equal(result.scoreCap, 0)
    assert.ok(result.reasons.includes('mock_response_header'))
  })

  await withServer((_request, response) => {
    response.end('not-json')
  }, async (url) => {
    const result = await probeEnvironmentIntegrity({
      requireRealBackend: true,
      attestationUrl: url,
      timeoutMs: 1000,
    })
    assert.equal(result.scoreCap, 0)
    assert.ok(result.reasons.includes('attestation_probe_failed'))
  })
})

test('detected mocks force every otherwise-happy browser result to zero', () => {
  const integrity = evaluateEnvironmentIntegrity({
    requireRealBackend: true,
    attestation: { ...realAttestation, mode: 'mock' },
  })
  const results = applyIntegrityToResults(
    [
      { id: 'bot-1', score: 100, errors: [] },
      { id: 'bot-2', score: 82, errors: ['minor product issue'] },
    ],
    integrity,
  )

  assert.deepEqual(results.map((result) => result.score), [0, 0])
  assert.match(results[0].errors[0], /environment integrity invalid/i)
  assert.equal(results[1].errors.length, 2)
})
