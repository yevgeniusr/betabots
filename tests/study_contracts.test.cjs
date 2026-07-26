const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { validateArtifact } = require('../skills/betabots/scripts/study_contracts.cjs')

function validManifest() {
  return {
    schema: 'betabots.study-manifest.v1',
    id: 'generic-checkout-study',
    title: 'Generic checkout comprehension',
    researchQuestion: 'Can first-time visitors understand the checkout value?',
    hypotheses: ['Clear delivery expectations improve confidence.'],
    target: { app: 'Generic Store', startUrls: ['https://example.test'] },
    environment: { attestationMode: 'required' },
    arms: [
      { id: 'neutral', type: 'neutral', personaRefs: ['persona.new-shopper'], tasks: ['Find a product.'] },
      { id: 'conversion', type: 'conversion', personaRefs: ['persona.returning-shopper'], tasks: ['Compare delivery options.'] },
      { id: 'treatment', type: 'treatment', personaRefs: ['persona.price-sensitive'], tasks: ['Assess the new checkout.'] },
    ],
    interactionPolicyRef: 'policies/read-only-v1.json',
    authenticationLifecyclePolicy: 'none',
    evidenceRequirements: ['screenshot', 'event-log'],
    reproducibility: { seed: '42', engine: 'playwright', model: 'gpt-5' },
    limitations: ['Synthetic behavior is directional, not population evidence.'],
  }
}

function validObservedEvidence() {
  return {
    schema: 'betabots.evidence-ref.v1',
    id: 'evidence.checkout-label',
    classification: 'observed',
    claim: 'The delivery label was visible before checkout.',
    artifact: { type: 'screenshot', ref: 'screenshots/neutral/001.png' },
    context: {
      sessionId: 'session-neutral-01',
      personaRef: 'persona.new-shopper',
      timestamp: '2026-07-26T10:00:00Z',
    },
  }
}

function validDecision() {
  return {
    schema: 'betabots.decision-outcome.v1',
    id: 'decision.generic-checkout',
    outcome: 'conditional',
    allocation: {
      hypothetical: true,
      budgetDollars: 1000,
      cash: { dollars: 200, percent: 20 },
      sleeves: [{
        id: 'checkout-clarity',
        dollars: 800,
        percent: 80,
        deployed: true,
        evidenceRefs: ['evidence.checkout-label'],
      }],
    },
    conditions: ['Confirm with a representative human sample.'],
    rejectedOpportunities: [],
    missingEvidence: [],
    evidenceRefs: ['evidence.checkout-label'],
  }
}

test('valid three-arm StudyManifest passes semantic validation', () => {
  assert.deepEqual(validateArtifact(validManifest()), { valid: true, errors: [] })
})

test('StudyManifest rejects duplicate arm ids', () => {
  const manifest = validManifest()
  manifest.arms[2].id = 'neutral'

  const result = validateArtifact(manifest)

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors, [{
    code: 'DUPLICATE_ARM_ID',
    path: '/arms/2/id',
    message: 'Arm ids must be unique.',
  }])
})

test('StudyManifest rejects persona references reused across arms', () => {
  const manifest = validManifest()
  manifest.arms[1].personaRefs = ['persona.new-shopper']
  const result = validateArtifact(manifest)
  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'DUPLICATE_PERSONA_REF')
  assert.equal(result.errors[0].path, '/arms/1/personaRefs/0')
})

test('StudyManifest requires explicit limitations', () => {
  const manifest = validManifest()
  delete manifest.limitations

  const result = validateArtifact(manifest)

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors, [{
    code: 'MANIFEST_LIMITATIONS_REQUIRED',
    path: '/limitations',
    message: 'Study manifests must state at least one limitation.',
  }])
})

test('valid observed EvidenceRef passes validation', () => {
  assert.deepEqual(validateArtifact(validObservedEvidence()), { valid: true, errors: [] })
})

test('EvidenceRef rejects an invalid evidence classification', () => {
  const evidence = validObservedEvidence()
  evidence.classification = 'asserted'

  const result = validateArtifact(evidence)

  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'INVALID_EVIDENCE_CLASSIFICATION')
  assert.equal(result.errors[0].path, '/classification')
})

test('observed EvidenceRef requires concrete artifact and context', () => {
  const evidence = validObservedEvidence()
  delete evidence.artifact
  delete evidence.context

  const result = validateArtifact(evidence)

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors.map(({ code, path }) => ({ code, path })), [
    { code: 'OBSERVED_ARTIFACT_CONTEXT_REQUIRED', path: '/artifact' },
    { code: 'OBSERVED_ARTIFACT_CONTEXT_REQUIRED', path: '/context' },
  ])
})

test('recommendation cannot be labeled as observed evidence', () => {
  const evidence = validObservedEvidence()
  evidence.recommendation = 'Make delivery timing more prominent.'

  const result = validateArtifact(evidence)

  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'RECOMMENDATION_MASQUERADING_AS_OBSERVED')
  assert.equal(result.errors[0].path, '/recommendation')
})

test('DecisionOutcome accepts exact hypothetical budget and percentages', () => {
  assert.deepEqual(validateArtifact(validDecision()), { valid: true, errors: [] })
})

test('DecisionOutcome rejects dollar allocations that miss the budget', () => {
  const decision = validDecision()
  decision.allocation.sleeves[0].dollars = 700

  const result = validateArtifact(decision)

  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'ALLOCATION_DOLLAR_MISMATCH')
  assert.equal(result.errors[0].path, '/allocation')
})

test('DecisionOutcome rejects percentages that do not total 100 within tolerance', () => {
  const decision = validDecision()
  decision.allocation.sleeves[0].percent = 79.9

  const result = validateArtifact(decision)

  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'ALLOCATION_PERCENT_MISMATCH')
  assert.equal(result.errors[0].path, '/allocation')
})

test('DecisionOutcome requires evidence for a deployed non-cash sleeve', () => {
  const decision = validDecision()
  decision.allocation.sleeves[0].evidenceRefs = []
  const result = validateArtifact(decision)
  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'DEPLOYED_SLEEVE_EVIDENCE_REQUIRED')
})

test('DecisionOutcome rejects negative dollars and percentages', () => {
  const decision = validDecision()
  decision.allocation.cash.dollars = -1
  decision.allocation.sleeves[0].dollars = 1001
  const result = validateArtifact(decision)
  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'NEGATIVE_ALLOCATION')
  assert.equal(result.errors[0].path, '/allocation/cash/dollars')
})

test('DecisionOutcome rejects real-spend fields', () => {
  const decision = validDecision()
  decision.realSpend = { dollars: 1000 }
  const result = validateArtifact(decision)
  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'REAL_SPEND_FORBIDDEN')
  assert.equal(result.errors[0].path, '/realSpend')
})

test('Finding requires an inferred commercial implication', () => {
  const finding = {
    schema: 'betabots.finding.v1',
    id: 'finding.checkout-label',
    observation: 'One neutral-arm persona overlooked delivery timing.',
    affected: { arms: ['neutral'], personas: ['persona.new-shopper'], surfaces: ['checkout'] },
    supportingEvidence: ['evidence.checkout-label'],
    contradictingEvidence: [],
    commercialImplication: { classification: 'inferred', statement: 'Clarifying delivery timing may reduce uncertainty.' },
    confidence: 0.62,
    limitations: ['One simulated session is not a market estimate.'],
  }

  assert.deepEqual(validateArtifact(finding), { valid: true, errors: [] })
})

function validExport() {
  return {
    schema: 'betabots.sanitized-export.v1',
    id: 'export.generic-checkout',
    allowlistedArtifacts: [{ path: 'artifacts/manifest.json', sha256: 'a'.repeat(64), sizeBytes: 120 }],
    excludedSensitiveClasses: ['authentication-state', 'cookies', 'tokens'],
    schemaVersions: ['betabots.study-manifest.v1'],
    verification: { authenticationStatesAbsent: true, cookiesAbsent: true, tokensAbsent: true },
  }
}

test('SanitizedExportManifest accepts safe allowlisted artifacts', () => {
  assert.deepEqual(validateArtifact(validExport()), { valid: true, errors: [] })
})

test('SanitizedExportManifest rejects traversal artifact paths', () => {
  const exported = validExport()
  exported.allowlistedArtifacts[0].path = '../credentials.json'
  const result = validateArtifact(exported)
  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'EXPORT_PATH_TRAVERSAL')
})

test('SanitizedExportManifest rejects authentication, cookie, and token artifacts', () => {
  const exported = validExport()
  exported.allowlistedArtifacts[0].path = 'artifacts/cookies.json'
  const result = validateArtifact(exported)
  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'SENSITIVE_ARTIFACT_FORBIDDEN')
})

test('SanitizedExportManifest rejects symlink-shaped artifacts', () => {
  const exported = validExport()
  exported.allowlistedArtifacts[0].type = 'symlink'
  const result = validateArtifact(exported)
  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'SYMLINK_ARTIFACT_FORBIDDEN')
})

test('SanitizedExportManifest requires all sensitive classes to be excluded', () => {
  const exported = validExport()
  exported.excludedSensitiveClasses = ['cookies']
  const result = validateArtifact(exported)
  assert.equal(result.valid, false)
  assert.equal(result.errors[0].code, 'SENSITIVE_CLASS_EXCLUSION_REQUIRED')
})

test('contract CLI emits JSON for valid and invalid artifacts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-contract-cli-'))
  const validFile = path.join(directory, 'manifest.json')
  const invalidFile = path.join(directory, 'invalid.json')
  fs.writeFileSync(validFile, JSON.stringify(validManifest()))
  fs.writeFileSync(invalidFile, JSON.stringify({ schema: 'betabots.study-manifest.v1' }))
  const cli = path.join(__dirname, '..', 'scripts', 'validate-study-artifacts.cjs')

  const valid = spawnSync(process.execPath, [cli, '--json', validFile], { encoding: 'utf8' })
  const invalid = spawnSync(process.execPath, [cli, '--json', invalidFile], { encoding: 'utf8' })

  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).valid, true)
  assert.equal(invalid.status, 1)
  assert.equal(JSON.parse(invalid.stdout).valid, false)
  assert.equal(JSON.parse(invalid.stdout).results[0].errors[0].path, '/id')
})
