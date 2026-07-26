const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const {
  validateArtifact,
  validateArtifacts,
  verifySanitizedExportFiles,
} = require('../skills/betabots/scripts/study_contracts.cjs')

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

test('every public contract rejects malformed nested data without throwing', () => {
  const malformedArtifacts = [
    {
      ...validManifest(),
      arms: [{ id: 'neutral', type: 'neutral', personaRefs: {}, tasks: 'not-an-array' }],
    },
    {
      ...validObservedEvidence(),
      artifact: [],
      context: { sessionId: [], personaRef: {}, timestamp: null },
    },
    {
      ...validDecision(),
      allocation: null,
    },
    {
      schema: 'betabots.finding.v1',
      id: 'finding.malformed',
      observation: 'Malformed nested values must be invalid.',
      affected: null,
      supportingEvidence: {},
      contradictingEvidence: 'not-an-array',
      commercialImplication: [],
      confidence: 0.5,
      limitations: {},
    },
    {
      ...validExport(),
      allowlistedArtifacts: [{ path: {}, sha256: [], sizeBytes: '120' }],
      verification: null,
    },
  ]

  for (const artifact of malformedArtifacts) {
    let result
    assert.doesNotThrow(() => { result = validateArtifact(artifact) })
    assert.equal(result.valid, false)
    assert.ok(result.errors.every((error) => (
      typeof error.code === 'string'
      && typeof error.path === 'string'
      && typeof error.message === 'string'
    )))
  }
})

test('non-finite and object-valued numeric fields are rejected by direct module validation', () => {
  for (const confidence of [NaN, Infinity, -Infinity]) {
    const finding = {
      schema: 'betabots.finding.v1',
      id: 'finding.numeric',
      observation: 'Numeric input must be finite.',
      affected: { arms: ['neutral'], personas: ['persona.new-shopper'], surfaces: ['checkout'] },
      supportingEvidence: ['evidence.checkout-label'],
      contradictingEvidence: [],
      commercialImplication: { classification: 'inferred', statement: 'This remains an inference.' },
      confidence,
      limitations: ['Non-finite values are not JSON.'],
    }
    const result = validateArtifact(finding)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((error) => error.code === 'INVALID_FINITE_NUMBER'))
  }

  const decision = validDecision()
  decision.allocation.budgetDollars = { amount: 1000 }
  const result = validateArtifact(decision)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.code === 'INVALID_FINITE_NUMBER'))
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
  const result = validateArtifact(validDecision())
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
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

  const result = validateArtifact(finding)
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
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

test('SanitizedExportManifest rejects non-POSIX, unsafe, and normalization-ambiguous paths', () => {
  const unsafePaths = [
    '/secret.json',
    'C:/secret.json',
    'C:\\secret.json',
    '\\\\server\\share\\secret.json',
    '//server/share/secret.json',
    'artifacts//export.json',
    'artifacts/./export.json',
    'artifacts/../export.json',
    'artifacts/\u0000export.json',
    'artifacts/e\u0301xport.json',
  ]

  for (const artifactPath of unsafePaths) {
    const exported = validExport()
    exported.allowlistedArtifacts[0].path = artifactPath
    const result = validateArtifact(exported)
    assert.equal(result.valid, false, artifactPath)
    assert.ok(result.errors.some((error) => error.code === 'EXPORT_PATH_TRAVERSAL'), artifactPath)
  }
})

test('SanitizedExportManifest deeply rejects secret-like fields, metadata, and artifact names', () => {
  for (const field of ['secret', 'auth', 'cookie', 'token', 'password']) {
    const fieldExport = validExport()
    fieldExport.audit = { nested: { [field]: 'not-allowed' } }
    const fieldResult = validateArtifact(fieldExport)
    assert.equal(fieldResult.valid, false, field)
    assert.ok(fieldResult.errors.some((error) => error.code === 'SENSITIVE_FIELD_FORBIDDEN'), field)
  }

  const metadataExport = validExport()
  metadataExport.allowlistedArtifacts[0].metadata = { apiToken: 'not-allowed' }
  const metadataResult = validateArtifact(metadataExport)
  assert.equal(metadataResult.valid, false)
  assert.ok(metadataResult.errors.some((error) => error.code === 'SENSITIVE_FIELD_FORBIDDEN'))

  const nameExport = validExport()
  nameExport.allowlistedArtifacts[0].path = 'artifacts/browser-auth-state.json'
  const nameResult = validateArtifact(nameExport)
  assert.equal(nameResult.valid, false)
  assert.ok(nameResult.errors.some((error) => error.code === 'SENSITIVE_ARTIFACT_FORBIDDEN'))
})

test('filesystem-backed export verification rejects symlinks, non-regular files, and tampering', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-export-root-'))
  const artifactDirectory = path.join(root, 'artifacts')
  fs.mkdirSync(artifactDirectory)
  const safeArtifact = path.join(artifactDirectory, 'manifest.json')
  const contents = 'public artifact\n'
  fs.writeFileSync(safeArtifact, contents)
  const exported = validExport()
  exported.allowlistedArtifacts[0] = {
    path: 'artifacts/manifest.json',
    sha256: crypto.createHash('sha256').update(contents).digest('hex'),
    sizeBytes: Buffer.byteLength(contents),
  }

  assert.deepEqual(verifySanitizedExportFiles(exported, root), { valid: true, errors: [] })

  const symlink = path.join(artifactDirectory, 'linked.json')
  fs.symlinkSync('manifest.json', symlink)
  exported.allowlistedArtifacts[0].path = 'artifacts/linked.json'
  let result = verifySanitizedExportFiles(exported, root)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.code === 'SYMLINK_ARTIFACT_FORBIDDEN'))

  const linkedDirectory = path.join(root, 'linked-artifacts')
  fs.symlinkSync('artifacts', linkedDirectory)
  exported.allowlistedArtifacts[0].path = 'linked-artifacts/manifest.json'
  result = verifySanitizedExportFiles(exported, root)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.code === 'SYMLINK_ARTIFACT_FORBIDDEN'))

  exported.allowlistedArtifacts[0].path = 'artifacts'
  result = verifySanitizedExportFiles(exported, root)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.code === 'NON_REGULAR_ARTIFACT_FORBIDDEN'))

  exported.allowlistedArtifacts[0].path = 'artifacts/manifest.json'
  fs.writeFileSync(safeArtifact, 'tampered public artifact\n')
  result = verifySanitizedExportFiles(exported, root)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.code === 'ARTIFACT_SIZE_MISMATCH'))
  assert.ok(result.errors.some((error) => error.code === 'ARTIFACT_HASH_MISMATCH'))
})

test('batch validation resolves evidence references and rejects duplicate artifact ids', () => {
  const evidence = validObservedEvidence()
  const decision = validDecision()
  const finding = {
    schema: 'betabots.finding.v1',
    id: 'finding.batch',
    observation: 'The label was missed by one persona.',
    affected: { arms: ['neutral'], personas: ['persona.new-shopper'], surfaces: ['checkout'] },
    supportingEvidence: ['evidence.checkout-label'],
    contradictingEvidence: [],
    commercialImplication: { classification: 'inferred', statement: 'The label may need clearer placement.' },
    confidence: 0.5,
    limitations: ['This is synthetic evidence.'],
  }
  assert.equal(validateArtifacts([evidence, decision, finding]).valid, true)

  const duplicate = { ...validObservedEvidence(), claim: 'Duplicate evidence id.' }
  let result = validateArtifacts([evidence, duplicate])
  assert.equal(result.valid, false)
  assert.ok(result.results[1].errors.some((error) => error.code === 'DUPLICATE_EVIDENCE_ID'))

  const duplicateArtifact = { ...validDecision(), id: evidence.id }
  result = validateArtifacts([evidence, duplicateArtifact])
  assert.equal(result.valid, false)
  assert.ok(result.results[1].errors.some((error) => error.code === 'DUPLICATE_ARTIFACT_ID'))

  const missingDecision = validDecision()
  missingDecision.evidenceRefs = ['evidence.missing']
  missingDecision.allocation.sleeves[0].evidenceRefs = ['evidence.missing']
  const missingFinding = { ...finding, supportingEvidence: ['evidence.missing'], contradictingEvidence: ['evidence.also-missing'] }
  result = validateArtifacts([missingDecision, missingFinding])
  assert.equal(result.valid, false)
  assert.ok(result.results[0].errors.some((error) => error.code === 'UNRESOLVED_EVIDENCE_REF'))
  assert.ok(result.results[1].errors.some((error) => error.code === 'UNRESOLVED_EVIDENCE_REF'))
})

test('single-artifact reference validation identifies the need for batch context', () => {
  const result = validateArtifact(validDecision())
  assert.equal(result.valid, true)
  assert.deepEqual(result.requiresBatchValidation, {
    code: 'BATCH_CONTEXT_REQUIRED',
    path: '/evidenceRefs',
    message: 'Evidence references require batch validation for resolution.',
  })
})

test('observed evidence cannot carry a recommendation classification or recommendation payload', () => {
  const evidence = validObservedEvidence()
  evidence.recommendation = 'Move the delivery label higher.'
  const result = validateArtifact(evidence)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some((error) => error.code === 'RECOMMENDATION_MASQUERADING_AS_OBSERVED'))
})

test('all published schemas specify closed object structures', () => {
  const schemaFiles = [
    'study-manifest.v1.schema.json',
    'evidence-ref.v1.schema.json',
    'decision-outcome.v1.schema.json',
    'finding.v1.schema.json',
    'sanitized-export.v1.schema.json',
  ]
  const visit = (node, file) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, `${file} has an open object`)
      assert.ok(Array.isArray(node.required), `${file} object lacks required fields`)
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach((entry) => visit(entry, file))
      else visit(child, file)
    }
  }
  for (const file of schemaFiles) {
    visit(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', file), 'utf8')), file)
  }
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

test('contract CLI reports mixed batches, invalid JSON, and filesystem verification errors as stable JSON', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-contract-cli-batch-'))
  const evidenceFile = path.join(directory, 'evidence.json')
  const decisionFile = path.join(directory, 'decision.json')
  const invalidJsonFile = path.join(directory, 'invalid.json')
  fs.writeFileSync(evidenceFile, JSON.stringify(validObservedEvidence()))
  fs.writeFileSync(decisionFile, JSON.stringify(validDecision()))
  fs.writeFileSync(invalidJsonFile, '{')
  const cli = path.join(__dirname, '..', 'scripts', 'validate-study-artifacts.cjs')

  const valid = spawnSync(process.execPath, [cli, '--json', evidenceFile, decisionFile], { encoding: 'utf8' })
  assert.equal(valid.status, 0, valid.stderr)
  assert.equal(JSON.parse(valid.stdout).valid, true)

  const mixed = spawnSync(process.execPath, [cli, '--json', decisionFile, invalidJsonFile], { encoding: 'utf8' })
  assert.equal(mixed.status, 1)
  const mixedOutput = JSON.parse(mixed.stdout)
  assert.equal(mixedOutput.valid, false)
  assert.equal(mixedOutput.results[1].errors[0].code, 'INVALID_JSON')
  assert.ok(mixedOutput.results[0].errors.some((error) => error.code === 'UNRESOLVED_EVIDENCE_REF'))

  const exportRoot = path.join(directory, 'export-root')
  fs.mkdirSync(exportRoot)
  const exportFile = path.join(directory, 'export.json')
  fs.writeFileSync(exportFile, JSON.stringify(validExport()))
  const verified = spawnSync(process.execPath, [cli, '--json', '--verify-export-files', '--export-root', exportRoot, exportFile], { encoding: 'utf8' })
  assert.equal(verified.status, 1)
  const verifiedOutput = JSON.parse(verified.stdout)
  assert.ok(verifiedOutput.results[0].errors.some((error) => error.code === 'ARTIFACT_NOT_FOUND'))
})

test('smoke runner contains no forced test termination and a smoke component exits naturally', () => {
  const smoke = fs.readFileSync(path.join(__dirname, 'smoke.sh'), 'utf8')
  assert.doesNotMatch(smoke, new RegExp(['--test', 'force-exit'].join('-')))
  const result = spawnSync(process.execPath, ['--test', path.join(__dirname, 'keyword_scoring.test.cjs')], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
