const STUDY_MANIFEST_V1 = 'betabots.study-manifest.v1'
const EVIDENCE_REF_V1 = 'betabots.evidence-ref.v1'
const DECISION_OUTCOME_V1 = 'betabots.decision-outcome.v1'
const FINDING_V1 = 'betabots.finding.v1'
const SANITIZED_EXPORT_V1 = 'betabots.sanitized-export.v1'
const ALLOCATION_PERCENT_TOLERANCE = 0.01

function issue(code, path, message) {
  return { code, path, message }
}

function requiredString(value, path, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(issue('REQUIRED_STRING', path, 'Expected a non-empty string.'))
  }
}

function requiredArray(value, path, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(issue('REQUIRED_ARRAY', path, 'Expected a non-empty array.'))
  }
}

function validateStudyManifest(value) {
  const errors = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: [issue('INVALID_OBJECT', '', 'Expected an artifact object.')] }
  }
  if (value.schema !== STUDY_MANIFEST_V1) {
    errors.push(issue('SCHEMA_ID_MISMATCH', '/schema', `Expected ${STUDY_MANIFEST_V1}.`))
  }
  requiredString(value.id, '/id', errors)
  requiredString(value.title, '/title', errors)
  requiredString(value.researchQuestion, '/researchQuestion', errors)
  requiredArray(value.hypotheses, '/hypotheses', errors)
  requiredString(value.target?.app, '/target/app', errors)
  requiredArray(value.target?.startUrls, '/target/startUrls', errors)
  requiredString(value.environment?.attestationMode, '/environment/attestationMode', errors)
  requiredArray(value.arms, '/arms', errors)
  const armIds = new Set()
  const personaRefs = new Set()
  for (const [index, arm] of (value.arms || []).entries()) {
    if (armIds.has(arm?.id)) {
      errors.push(issue('DUPLICATE_ARM_ID', `/arms/${index}/id`, 'Arm ids must be unique.'))
    }
    armIds.add(arm?.id)
    for (const [personaIndex, personaRef] of (arm?.personaRefs || []).entries()) {
      if (personaRefs.has(personaRef)) {
        errors.push(issue('DUPLICATE_PERSONA_REF', `/arms/${index}/personaRefs/${personaIndex}`, 'Persona references must be unique across study arms.'))
      }
      personaRefs.add(personaRef)
    }
  }
  requiredString(value.interactionPolicyRef, '/interactionPolicyRef', errors)
  requiredString(value.authenticationLifecyclePolicy, '/authenticationLifecyclePolicy', errors)
  requiredArray(value.evidenceRequirements, '/evidenceRequirements', errors)
  requiredString(value.reproducibility?.seed, '/reproducibility/seed', errors)
  requiredString(value.reproducibility?.engine, '/reproducibility/engine', errors)
  requiredString(value.reproducibility?.model, '/reproducibility/model', errors)
  if (!Array.isArray(value.limitations) || value.limitations.length === 0) {
    errors.push(issue(
      'MANIFEST_LIMITATIONS_REQUIRED',
      '/limitations',
      'Study manifests must state at least one limitation.',
    ))
  }
  return { valid: errors.length === 0, errors }
}

function validateEvidenceRef(value) {
  const errors = []
  requiredString(value.id, '/id', errors)
  requiredString(value.classification, '/classification', errors)
  if (!['observed', 'inferred', 'recommendation', 'external', 'unverified'].includes(value.classification)) {
    errors.push(issue(
      'INVALID_EVIDENCE_CLASSIFICATION',
      '/classification',
      'Classification must be observed, inferred, recommendation, external, or unverified.',
    ))
  }
  requiredString(value.claim, '/claim', errors)
  if (value.classification === 'observed' && typeof value.recommendation === 'string') {
    errors.push(issue(
      'RECOMMENDATION_MASQUERADING_AS_OBSERVED',
      '/recommendation',
      'Recommendations must use the recommendation classification.',
    ))
  }
  if (value.classification === 'observed') {
    if (!value.artifact?.type || !value.artifact?.ref) {
      errors.push(issue(
        'OBSERVED_ARTIFACT_CONTEXT_REQUIRED',
        '/artifact',
        'Observed evidence requires a concrete screenshot, event, or path artifact.',
      ))
    }
    if (!value.context?.sessionId || !value.context?.personaRef || !value.context?.timestamp) {
      errors.push(issue(
        'OBSERVED_ARTIFACT_CONTEXT_REQUIRED',
        '/context',
        'Observed evidence requires session, persona, and timestamp context.',
      ))
    }
  }
  return { valid: errors.length === 0, errors }
}

function validateDecisionOutcome(value) {
  const errors = []
  requiredString(value.id, '/id', errors)
  if (Object.hasOwn(value, 'realSpend')) {
    errors.push(issue('REAL_SPEND_FORBIDDEN', '/realSpend', 'Decision artifacts must not represent real spend.'))
  }
  if (!['allocate', 'reject', 'conditional', 'inconclusive'].includes(value.outcome)) {
    errors.push(issue('INVALID_DECISION_OUTCOME', '/outcome', 'Outcome must be allocate, reject, conditional, or inconclusive.'))
  }
  const allocation = value.allocation
  if (allocation !== undefined) {
    if (allocation.hypothetical !== true) {
      errors.push(issue('HYPOTHETICAL_ALLOCATION_REQUIRED', '/allocation/hypothetical', 'Allocations are hypothetical and must be marked true.'))
    }
    requiredString(String(allocation.budgetDollars ?? ''), '/allocation/budgetDollars', errors)
    requiredString(String(allocation.cash?.dollars ?? ''), '/allocation/cash/dollars', errors)
    requiredString(String(allocation.cash?.percent ?? ''), '/allocation/cash/percent', errors)
    requiredArray(allocation.sleeves, '/allocation/sleeves', errors)
    const assignedDollars = Number(allocation.cash?.dollars || 0)
      + (allocation.sleeves || []).reduce((total, sleeve) => total + Number(sleeve.dollars || 0), 0)
    const numericFields = [
      ['/allocation/budgetDollars', allocation.budgetDollars],
      ['/allocation/cash/dollars', allocation.cash?.dollars],
      ['/allocation/cash/percent', allocation.cash?.percent],
      ...((allocation.sleeves || []).flatMap((sleeve, index) => [
        [`/allocation/sleeves/${index}/dollars`, sleeve.dollars],
        [`/allocation/sleeves/${index}/percent`, sleeve.percent],
      ])),
    ]
    for (const [path, amount] of numericFields) {
      if (Number(amount) < 0) errors.push(issue('NEGATIVE_ALLOCATION', path, 'Allocation dollars and percentages cannot be negative.'))
    }
    for (const [index, sleeve] of (allocation.sleeves || []).entries()) {
      if (sleeve.deployed === true && (!Array.isArray(sleeve.evidenceRefs) || sleeve.evidenceRefs.length === 0)) {
        errors.push(issue('DEPLOYED_SLEEVE_EVIDENCE_REQUIRED', `/allocation/sleeves/${index}/evidenceRefs`, 'Deployed non-cash sleeves require evidence references.'))
      }
    }
    if (Number.isFinite(Number(allocation.budgetDollars)) && assignedDollars !== Number(allocation.budgetDollars)) {
      errors.push(issue('ALLOCATION_DOLLAR_MISMATCH', '/allocation', 'Allocation dollars must equal the assigned budget.'))
    }
    const assignedPercent = Number(allocation.cash?.percent || 0)
      + (allocation.sleeves || []).reduce((total, sleeve) => total + Number(sleeve.percent || 0), 0)
    if (Math.abs(assignedPercent - 100) > ALLOCATION_PERCENT_TOLERANCE) {
      errors.push(issue('ALLOCATION_PERCENT_MISMATCH', '/allocation', 'Allocation percentages must total 100 within 0.01 percentage points.'))
    }
  }
  return { valid: errors.length === 0, errors }
}

function validateFinding(value) {
  const errors = []
  requiredString(value.id, '/id', errors)
  requiredString(value.observation, '/observation', errors)
  requiredArray(value.affected?.arms, '/affected/arms', errors)
  requiredArray(value.affected?.personas, '/affected/personas', errors)
  requiredArray(value.affected?.surfaces, '/affected/surfaces', errors)
  requiredArray(value.supportingEvidence, '/supportingEvidence', errors)
  if (value.commercialImplication?.classification !== 'inferred') {
    errors.push(issue('COMMERCIAL_IMPLICATION_MUST_BE_INFERRED', '/commercialImplication/classification', 'Commercial implications must be classified as inferred.'))
  }
  requiredString(value.commercialImplication?.statement, '/commercialImplication/statement', errors)
  if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) {
    errors.push(issue('INVALID_CONFIDENCE', '/confidence', 'Confidence must be a number from 0 to 1.'))
  }
  requiredArray(value.limitations, '/limitations', errors)
  return { valid: errors.length === 0, errors }
}

function validateSanitizedExportManifest(value) {
  const errors = []
  requiredString(value.id, '/id', errors)
  requiredArray(value.allowlistedArtifacts, '/allowlistedArtifacts', errors)
  requiredArray(value.excludedSensitiveClasses, '/excludedSensitiveClasses', errors)
  for (const sensitiveClass of ['authentication-state', 'cookies', 'tokens']) {
    if (!value.excludedSensitiveClasses?.includes(sensitiveClass)) {
      errors.push(issue('SENSITIVE_CLASS_EXCLUSION_REQUIRED', '/excludedSensitiveClasses', `Missing required excluded sensitive class: ${sensitiveClass}.`))
    }
  }
  requiredArray(value.schemaVersions, '/schemaVersions', errors)
  for (const [index, artifact] of (value.allowlistedArtifacts || []).entries()) {
    const artifactPath = artifact?.path || ''
    if (artifactPath.startsWith('/') || artifactPath.split('/').includes('..') || artifactPath.includes('\\')) {
      errors.push(issue('EXPORT_PATH_TRAVERSAL', `/allowlistedArtifacts/${index}/path`, 'Allowlisted artifact paths must be safe relative paths.'))
    }
    if (/(auth(entication)?[-_ ]?state|cookie|token)/i.test(artifactPath) || /(auth(entication)?[-_ ]?state|cookie|token)/i.test(artifact?.artifactClass || '')) {
      errors.push(issue('SENSITIVE_ARTIFACT_FORBIDDEN', `/allowlistedArtifacts/${index}/path`, 'Authentication states, cookies, and tokens cannot be exported.'))
    }
    if (artifact?.type === 'symlink' || Object.hasOwn(artifact || {}, 'linkTarget')) {
      errors.push(issue('SYMLINK_ARTIFACT_FORBIDDEN', `/allowlistedArtifacts/${index}`, 'Symlink-shaped artifacts cannot be exported.'))
    }
  }
  for (const key of ['authenticationStatesAbsent', 'cookiesAbsent', 'tokensAbsent']) {
    if (value.verification?.[key] !== true) {
      errors.push(issue('SANITIZATION_VERIFICATION_REQUIRED', `/verification/${key}`, 'Sanitized exports must verify authentication states, cookies, and tokens are absent.'))
    }
  }
  return { valid: errors.length === 0, errors }
}

function validateArtifact(value) {
  if (value?.schema === STUDY_MANIFEST_V1) return validateStudyManifest(value)
  if (value?.schema === EVIDENCE_REF_V1) return validateEvidenceRef(value)
  if (value?.schema === DECISION_OUTCOME_V1) return validateDecisionOutcome(value)
  if (value?.schema === FINDING_V1) return validateFinding(value)
  if (value?.schema === SANITIZED_EXPORT_V1) return validateSanitizedExportManifest(value)
  return {
    valid: false,
    errors: [issue('UNKNOWN_SCHEMA', '/schema', 'Unsupported or missing artifact schema identifier.')],
  }
}

module.exports = { STUDY_MANIFEST_V1, EVIDENCE_REF_V1, DECISION_OUTCOME_V1, FINDING_V1, SANITIZED_EXPORT_V1, ALLOCATION_PERCENT_TOLERANCE, validateArtifact }
