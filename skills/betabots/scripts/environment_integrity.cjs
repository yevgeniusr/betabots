function evaluateEnvironmentIntegrity(input = {}) {
  const reasons = []
  if (String(input.authTokenTemplate || '').trim()) {
    reasons.push('synthetic_auth')
  }

  if (input.probeError) reasons.push('attestation_probe_failed')
  if (!input.attestation) {
    reasons.push(input.requireRealBackend ? 'attestation_missing' : 'environment_unverified')
  }

  const attestation = input.attestation
  if (attestation) {
    if (attestation.mode !== 'real' || attestation.mocksDetected === true) {
      reasons.push('mock_backend')
    }
    if (attestation.auth?.mode !== 'real') {
      reasons.push('synthetic_auth')
    }
    const database = attestation.database || {}
    if (
      database.connected !== true ||
      database.persistent !== true ||
      database.driver !== 'postgres'
    ) {
      reasons.push('database_not_persistent_postgres')
    }
  }

  if ((input.detectedMockHeaders || []).length > 0) {
    reasons.push('mock_response_header')
  }
  if ((input.storageStateErrors || []).length > 0) {
    reasons.push('storage_state_missing')
  }

  const uniqueReasons = [...new Set(reasons)]
  const verified =
    !!attestation &&
    attestation.mode === 'real' &&
    attestation.auth?.mode === 'real' &&
    attestation.database?.connected === true &&
    attestation.database?.driver === 'postgres' &&
    attestation.database?.persistent === true &&
    attestation.mocksDetected !== true

  return {
    valid: uniqueReasons.length === 0,
    verified,
    scoreCap: uniqueReasons.length === 0 ? 100 : 0,
    reasons: uniqueReasons,
  }
}

function safePlaceholder(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function resolveStorageStatePath(template, persona = {}) {
  if (!template) return ''
  return String(template)
    .replaceAll('{id}', safePlaceholder(persona.id))
    .replaceAll('{name}', safePlaceholder(persona.name))
    .replaceAll('{role}', safePlaceholder(persona.role))
}

const MOCK_HEADER_NAMES = [
  'x-betabots-mock',
  'x-mock-response',
  'x-mock-server',
]

function detectedMockHeaders(headers) {
  return MOCK_HEADER_NAMES.filter((name) => {
    const value = headers?.get?.(name) ?? headers?.[name]
    return (
      value &&
      !['0', 'false', 'no'].includes(String(value).toLowerCase())
    )
  })
}

async function probeEnvironmentIntegrity(config = {}) {
  const attestationUrl = String(config.attestationUrl || '').trim()
  let attestation
  let probeError = ''
  let mockHeaders = []

  if (attestationUrl) {
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      Number(config.timeoutMs || 5000),
    )
    try {
      const response = await fetch(attestationUrl, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      })
      mockHeaders = detectedMockHeaders(response.headers)
      if (!response.ok) {
        throw new Error(`attestation returned HTTP ${response.status}`)
      }
      attestation = await response.json()
    } catch (error) {
      probeError = error instanceof Error ? error.message : String(error)
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    ...evaluateEnvironmentIntegrity({
      requireRealBackend: config.requireRealBackend,
      authTokenTemplate: config.authTokenTemplate,
      attestation,
      probeError,
      detectedMockHeaders: mockHeaders,
    }),
    attestationUrl,
    attestation: attestation || null,
    probeError,
    detectedMockHeaders: mockHeaders,
  }
}

function applyIntegrityToResults(results, integrity) {
  if (integrity?.valid !== false) return results
  const message = `Environment integrity invalid: ${
    integrity.reasons?.join(', ') || 'unknown reason'
  }`
  return results.map((result) => ({
    ...result,
    score: Math.min(Number(result.score || 0), Number(integrity.scoreCap || 0)),
    errors: (result.errors || []).includes(message)
      ? [...result.errors]
      : [...(result.errors || []), message],
    environmentIntegrityValid: false,
  }))
}

module.exports = {
  applyIntegrityToResults,
  detectedMockHeaders,
  evaluateEnvironmentIntegrity,
  probeEnvironmentIntegrity,
  resolveStorageStatePath,
}
