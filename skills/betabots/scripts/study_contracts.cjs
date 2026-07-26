const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const STUDY_MANIFEST_V1 = 'betabots.study-manifest.v1'
const EVIDENCE_REF_V1 = 'betabots.evidence-ref.v1'
const DECISION_OUTCOME_V1 = 'betabots.decision-outcome.v1'
const FINDING_V1 = 'betabots.finding.v1'
const SANITIZED_EXPORT_V1 = 'betabots.sanitized-export.v1'
const ALLOCATION_PERCENT_TOLERANCE = 0.01
const EVIDENCE_CLASSIFICATIONS = new Set(['observed', 'inferred', 'recommendation', 'external', 'unverified'])
const SENSITIVE_NAME_PATTERN = /(secret|password|credential|api[-_]?key|auth(?:entication)?|cookie|token)/i

function issue(code, pointer, message) {
  return { code, path: pointer, message }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function addObjectError(value, pointer, errors) {
  if (!isObject(value)) {
    errors.push(issue('INVALID_OBJECT', pointer, 'Expected an object.'))
    return false
  }
  return true
}

function requiredString(value, pointer, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(issue('REQUIRED_STRING', pointer, 'Expected a non-empty string.'))
    return false
  }
  return true
}

function requiredBoolean(value, pointer, errors) {
  if (typeof value !== 'boolean') {
    errors.push(issue('REQUIRED_BOOLEAN', pointer, 'Expected a boolean.'))
    return false
  }
  return true
}

function requiredArray(value, pointer, errors, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum) {
    errors.push(issue('REQUIRED_ARRAY', pointer, minimum > 0 ? 'Expected a non-empty array.' : 'Expected an array.'))
    return false
  }
  return true
}

function requiredStringArray(value, pointer, errors, minimum = 1) {
  const validArray = requiredArray(value, pointer, errors, minimum)
  if (!validArray) return false
  for (const [index, entry] of value.entries()) requiredString(entry, `${pointer}/${index}`, errors)
  return true
}

function requiredFiniteNumber(value, pointer, errors, { minimum = -Infinity, maximum = Infinity } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(issue('INVALID_FINITE_NUMBER', pointer, 'Expected a finite number.'))
    return false
  }
  if (value < minimum || value > maximum) {
    errors.push(issue('NUMBER_OUT_OF_RANGE', pointer, `Expected a number from ${minimum} to ${maximum}.`))
    return false
  }
  return true
}

function requiredAllocationNumber(value, pointer, errors, maximum = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(issue('INVALID_FINITE_NUMBER', pointer, 'Expected a finite number.'))
    return false
  }
  if (value < 0) {
    errors.push(issue('NEGATIVE_ALLOCATION', pointer, 'Allocation dollars and percentages cannot be negative.'))
    return false
  }
  if (value > maximum) {
    errors.push(issue('NUMBER_OUT_OF_RANGE', pointer, `Expected a number from 0 to ${maximum}.`))
    return false
  }
  return true
}

function checkKnownFields(value, fields, pointer, errors) {
  if (!isObject(value)) return
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) errors.push(issue('UNKNOWN_FIELD', `${pointer}/${key}`, 'Unknown fields are not allowed.'))
  }
}

function result(errors, requiresBatchValidation) {
  const output = { valid: errors.length === 0, errors }
  if (output.valid && requiresBatchValidation) output.requiresBatchValidation = requiresBatchValidation
  return output
}

function validateSchema(value, expected, errors) {
  if (value.schema !== expected) {
    errors.push(issue('SCHEMA_ID_MISMATCH', '/schema', `Expected ${expected}.`))
  }
}

function validateStudyManifest(value) {
  const errors = []
  if (!addObjectError(value, '', errors)) return result(errors)
  validateSchema(value, STUDY_MANIFEST_V1, errors)
  requiredString(value.id, '/id', errors)
  requiredString(value.title, '/title', errors)
  requiredString(value.researchQuestion, '/researchQuestion', errors)
  requiredStringArray(value.hypotheses, '/hypotheses', errors)

  if (addObjectError(value.target, '/target', errors)) {
    requiredString(value.target.app, '/target/app', errors)
    requiredStringArray(value.target.startUrls, '/target/startUrls', errors)
    checkKnownFields(value.target, new Set(['app', 'startUrls']), '/target', errors)
  }
  if (addObjectError(value.environment, '/environment', errors)) {
    requiredString(value.environment.attestationMode, '/environment/attestationMode', errors)
    if (!['required', 'optional', 'not-required'].includes(value.environment.attestationMode)) {
      errors.push(issue('INVALID_ATTESTATION_MODE', '/environment/attestationMode', 'Attestation mode must be required, optional, or not-required.'))
    }
    checkKnownFields(value.environment, new Set(['attestationMode']), '/environment', errors)
  }

  const armIds = new Set()
  const personaRefs = new Set()
  if (requiredArray(value.arms, '/arms', errors)) {
    for (const [index, arm] of value.arms.entries()) {
      const pointer = `/arms/${index}`
      if (!addObjectError(arm, pointer, errors)) continue
      const idIsValid = requiredString(arm.id, `${pointer}/id`, errors)
      requiredString(arm.type, `${pointer}/type`, errors)
      if (!['neutral', 'conversion', 'treatment'].includes(arm.type)) {
        errors.push(issue('INVALID_ARM_TYPE', `${pointer}/type`, 'Arm type must be neutral, conversion, or treatment.'))
      }
      if (idIsValid) {
        if (armIds.has(arm.id)) errors.push(issue('DUPLICATE_ARM_ID', `${pointer}/id`, 'Arm ids must be unique.'))
        armIds.add(arm.id)
      }
      if (requiredStringArray(arm.personaRefs, `${pointer}/personaRefs`, errors)) {
        for (const [personaIndex, personaRef] of arm.personaRefs.entries()) {
          if (personaRefs.has(personaRef)) {
            errors.push(issue('DUPLICATE_PERSONA_REF', `${pointer}/personaRefs/${personaIndex}`, 'Persona references must be unique across study arms.'))
          }
          personaRefs.add(personaRef)
        }
      }
      requiredStringArray(arm.tasks, `${pointer}/tasks`, errors)
      checkKnownFields(arm, new Set(['id', 'type', 'personaRefs', 'tasks']), pointer, errors)
    }
  }

  requiredString(value.interactionPolicyRef, '/interactionPolicyRef', errors)
  requiredString(value.authenticationLifecyclePolicy, '/authenticationLifecyclePolicy', errors)
  if (!['none', 'no-auth', 'transient-user-approved'].includes(value.authenticationLifecyclePolicy)) {
    errors.push(issue('INVALID_AUTHENTICATION_LIFECYCLE_POLICY', '/authenticationLifecyclePolicy', 'Authentication lifecycle policy must be none, no-auth, or transient-user-approved.'))
  }
  if (requiredStringArray(value.evidenceRequirements, '/evidenceRequirements', errors)) {
    for (const [index, requirement] of value.evidenceRequirements.entries()) {
      if (!['screenshot', 'event-log', 'trace'].includes(requirement)) {
        errors.push(issue('INVALID_EVIDENCE_REQUIREMENT', `/evidenceRequirements/${index}`, 'Evidence requirements must be screenshot, event-log, or trace.'))
      }
    }
  }
  if (addObjectError(value.reproducibility, '/reproducibility', errors)) {
    requiredString(value.reproducibility.seed, '/reproducibility/seed', errors)
    requiredString(value.reproducibility.engine, '/reproducibility/engine', errors)
    requiredString(value.reproducibility.model, '/reproducibility/model', errors)
    checkKnownFields(value.reproducibility, new Set(['seed', 'engine', 'model']), '/reproducibility', errors)
  }
  if (!Array.isArray(value.limitations) || value.limitations.length === 0) {
    errors.push(issue('MANIFEST_LIMITATIONS_REQUIRED', '/limitations', 'Study manifests must state at least one limitation.'))
  } else {
    value.limitations.forEach((limitation, index) => requiredString(limitation, `/limitations/${index}`, errors))
  }
  checkKnownFields(value, new Set(['schema', 'id', 'title', 'researchQuestion', 'hypotheses', 'target', 'environment', 'arms', 'interactionPolicyRef', 'authenticationLifecyclePolicy', 'evidenceRequirements', 'reproducibility', 'limitations']), '', errors)
  return result(errors)
}

function validateEvidenceRef(value) {
  const errors = []
  if (!addObjectError(value, '', errors)) return result(errors)
  validateSchema(value, EVIDENCE_REF_V1, errors)
  requiredString(value.id, '/id', errors)
  const classificationIsString = requiredString(value.classification, '/classification', errors)
  if (classificationIsString && !EVIDENCE_CLASSIFICATIONS.has(value.classification)) {
    errors.push(issue('INVALID_EVIDENCE_CLASSIFICATION', '/classification', 'Classification must be observed, inferred, recommendation, external, or unverified.'))
  }
  requiredString(value.claim, '/claim', errors)

  if (value.artifact !== undefined && addObjectError(value.artifact, '/artifact', errors)) {
    requiredString(value.artifact.type, '/artifact/type', errors)
    if (!['screenshot', 'event', 'path'].includes(value.artifact.type)) {
      errors.push(issue('INVALID_ARTIFACT_TYPE', '/artifact/type', 'Artifact type must be screenshot, event, or path.'))
    }
    requiredString(value.artifact.ref, '/artifact/ref', errors)
    checkKnownFields(value.artifact, new Set(['type', 'ref']), '/artifact', errors)
  }
  if (value.context !== undefined && addObjectError(value.context, '/context', errors)) {
    requiredString(value.context.sessionId, '/context/sessionId', errors)
    requiredString(value.context.personaRef, '/context/personaRef', errors)
    requiredString(value.context.timestamp, '/context/timestamp', errors)
    checkKnownFields(value.context, new Set(['sessionId', 'personaRef', 'timestamp']), '/context', errors)
  }
  if (value.recommendation !== undefined) requiredString(value.recommendation, '/recommendation', errors)
  if (value.classification === 'observed') {
    if (!isObject(value.artifact) || typeof value.artifact.type !== 'string' || typeof value.artifact.ref !== 'string') {
      errors.push(issue('OBSERVED_ARTIFACT_CONTEXT_REQUIRED', '/artifact', 'Observed evidence requires a concrete screenshot, event, or path artifact.'))
    }
    if (!isObject(value.context) || !value.context.sessionId || !value.context.personaRef || !value.context.timestamp) {
      errors.push(issue('OBSERVED_ARTIFACT_CONTEXT_REQUIRED', '/context', 'Observed evidence requires session, persona, and timestamp context.'))
    }
    if (typeof value.recommendation === 'string') {
      errors.push(issue('RECOMMENDATION_MASQUERADING_AS_OBSERVED', '/recommendation', 'Recommendations must use the recommendation classification.'))
    }
  }
  checkKnownFields(value, new Set(['schema', 'id', 'classification', 'claim', 'artifact', 'context', 'recommendation']), '', errors)
  return result(errors)
}

function validateDecisionOutcome(value) {
  const errors = []
  if (!addObjectError(value, '', errors)) return result(errors)
  validateSchema(value, DECISION_OUTCOME_V1, errors)
  requiredString(value.id, '/id', errors)
  if (Object.hasOwn(value, 'realSpend')) errors.push(issue('REAL_SPEND_FORBIDDEN', '/realSpend', 'Decision artifacts must not represent real spend.'))
  requiredString(value.outcome, '/outcome', errors)
  if (!['allocate', 'reject', 'conditional', 'inconclusive'].includes(value.outcome)) {
    errors.push(issue('INVALID_DECISION_OUTCOME', '/outcome', 'Outcome must be allocate, reject, conditional, or inconclusive.'))
  }
  if (value.outcome === 'allocate' && value.allocation === undefined) {
    errors.push(issue('ALLOCATION_REQUIRED', '/allocation', 'Allocate outcomes require a hypothetical allocation.'))
  }

  const evidencePointers = []
  if (value.allocation !== undefined) {
    if (addObjectError(value.allocation, '/allocation', errors)) {
      const allocation = value.allocation
      if (allocation.hypothetical !== true) errors.push(issue('HYPOTHETICAL_ALLOCATION_REQUIRED', '/allocation/hypothetical', 'Allocations are hypothetical and must be marked true.'))
      requiredAllocationNumber(allocation.budgetDollars, '/allocation/budgetDollars', errors)
      if (addObjectError(allocation.cash, '/allocation/cash', errors)) {
        requiredAllocationNumber(allocation.cash.dollars, '/allocation/cash/dollars', errors)
        requiredAllocationNumber(allocation.cash.percent, '/allocation/cash/percent', errors, 100)
        checkKnownFields(allocation.cash, new Set(['dollars', 'percent']), '/allocation/cash', errors)
      }
      const sleeveIds = new Set()
      if (requiredArray(allocation.sleeves, '/allocation/sleeves', errors)) {
        for (const [index, sleeve] of allocation.sleeves.entries()) {
          const pointer = `/allocation/sleeves/${index}`
          if (!addObjectError(sleeve, pointer, errors)) continue
          const sleeveIdIsValid = requiredString(sleeve.id, `${pointer}/id`, errors)
          if (sleeveIdIsValid) {
            if (sleeveIds.has(sleeve.id)) errors.push(issue('DUPLICATE_SLEEVE_ID', `${pointer}/id`, 'Sleeve ids must be unique.'))
            sleeveIds.add(sleeve.id)
          }
          requiredAllocationNumber(sleeve.dollars, `${pointer}/dollars`, errors)
          requiredAllocationNumber(sleeve.percent, `${pointer}/percent`, errors, 100)
          requiredBoolean(sleeve.deployed, `${pointer}/deployed`, errors)
          const referencesValid = requiredStringArray(sleeve.evidenceRefs, `${pointer}/evidenceRefs`, errors, 0)
          if (referencesValid) {
            for (const [referenceIndex, reference] of sleeve.evidenceRefs.entries()) evidencePointers.push([`${pointer}/evidenceRefs/${referenceIndex}`, reference])
          }
          if (sleeve.deployed === true && (!Array.isArray(sleeve.evidenceRefs) || sleeve.evidenceRefs.length === 0)) {
            errors.push(issue('DEPLOYED_SLEEVE_EVIDENCE_REQUIRED', `${pointer}/evidenceRefs`, 'Deployed non-cash sleeves require evidence references.'))
          }
          checkKnownFields(sleeve, new Set(['id', 'dollars', 'percent', 'deployed', 'evidenceRefs']), pointer, errors)
        }
      }
      checkKnownFields(allocation, new Set(['hypothetical', 'budgetDollars', 'cash', 'sleeves']), '/allocation', errors)
      if (Number.isFinite(allocation.budgetDollars) && isObject(allocation.cash) && Array.isArray(allocation.sleeves)
        && Number.isFinite(allocation.cash.dollars) && allocation.sleeves.every((sleeve) => isObject(sleeve) && Number.isFinite(sleeve.dollars))) {
        const assignedDollars = allocation.cash.dollars + allocation.sleeves.reduce((total, sleeve) => total + sleeve.dollars, 0)
        if (assignedDollars !== allocation.budgetDollars) errors.push(issue('ALLOCATION_DOLLAR_MISMATCH', '/allocation', 'Allocation dollars must equal the assigned budget.'))
      }
      if (isObject(allocation.cash) && Array.isArray(allocation.sleeves)
        && Number.isFinite(allocation.cash.percent) && allocation.sleeves.every((sleeve) => isObject(sleeve) && Number.isFinite(sleeve.percent))) {
        const assignedPercent = allocation.cash.percent + allocation.sleeves.reduce((total, sleeve) => total + sleeve.percent, 0)
        if (Math.abs(assignedPercent - 100) > ALLOCATION_PERCENT_TOLERANCE) errors.push(issue('ALLOCATION_PERCENT_MISMATCH', '/allocation', 'Allocation percentages must total 100 within 0.01 percentage points.'))
      }
    }
  }
  requiredStringArray(value.conditions, '/conditions', errors, 0)
  requiredStringArray(value.rejectedOpportunities, '/rejectedOpportunities', errors, 0)
  requiredStringArray(value.missingEvidence, '/missingEvidence', errors, 0)
  if (requiredStringArray(value.evidenceRefs, '/evidenceRefs', errors, 0)) {
    for (const [index, reference] of value.evidenceRefs.entries()) evidencePointers.push([`/evidenceRefs/${index}`, reference])
  }
  checkKnownFields(value, new Set(['schema', 'id', 'outcome', 'allocation', 'conditions', 'rejectedOpportunities', 'missingEvidence', 'evidenceRefs', 'realSpend']), '', errors)
  const batchRequirement = evidencePointers.length > 0
    ? issue('BATCH_CONTEXT_REQUIRED', '/evidenceRefs', 'Evidence references require batch validation for resolution.')
    : undefined
  return result(errors, batchRequirement)
}

function validateFinding(value) {
  const errors = []
  if (!addObjectError(value, '', errors)) return result(errors)
  validateSchema(value, FINDING_V1, errors)
  requiredString(value.id, '/id', errors)
  requiredString(value.observation, '/observation', errors)
  if (addObjectError(value.affected, '/affected', errors)) {
    requiredStringArray(value.affected.arms, '/affected/arms', errors)
    requiredStringArray(value.affected.personas, '/affected/personas', errors)
    requiredStringArray(value.affected.surfaces, '/affected/surfaces', errors)
    checkKnownFields(value.affected, new Set(['arms', 'personas', 'surfaces']), '/affected', errors)
  }
  const evidencePointers = []
  for (const [field, minimum] of [['supportingEvidence', 1], ['contradictingEvidence', 0]]) {
    if (requiredStringArray(value[field], `/${field}`, errors, minimum)) {
      for (const [index, reference] of value[field].entries()) evidencePointers.push([`/${field}/${index}`, reference])
    }
  }
  if (addObjectError(value.commercialImplication, '/commercialImplication', errors)) {
    if (value.commercialImplication.classification !== 'inferred') {
      errors.push(issue('COMMERCIAL_IMPLICATION_MUST_BE_INFERRED', '/commercialImplication/classification', 'Commercial implications must be classified as inferred.'))
    }
    requiredString(value.commercialImplication.statement, '/commercialImplication/statement', errors)
    checkKnownFields(value.commercialImplication, new Set(['classification', 'statement']), '/commercialImplication', errors)
  }
  requiredFiniteNumber(value.confidence, '/confidence', errors, { minimum: 0, maximum: 1 })
  requiredStringArray(value.limitations, '/limitations', errors)
  checkKnownFields(value, new Set(['schema', 'id', 'observation', 'affected', 'supportingEvidence', 'contradictingEvidence', 'commercialImplication', 'confidence', 'limitations']), '', errors)
  const batchRequirement = evidencePointers.length > 0
    ? issue('BATCH_CONTEXT_REQUIRED', '/supportingEvidence', 'Evidence references require batch validation for resolution.')
    : undefined
  return result(errors, batchRequirement)
}

function isSafeRelativePosixPath(value) {
  if (typeof value !== 'string' || value === '' || value !== value.normalize('NFC')) return false
  if (/[\u0000-\u001F\u007F]/.test(value) || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false
  const segments = value.split('/')
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function scanSensitiveFields(value, pointer, errors) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanSensitiveFields(entry, `${pointer}/${index}`, errors))
    return
  }
  if (!isObject(value)) return
  for (const [key, entry] of Object.entries(value)) {
    const entryPointer = `${pointer}/${key}`
    const declaredAbsence = pointer === '/verification' && ['authenticationStatesAbsent', 'cookiesAbsent', 'tokensAbsent'].includes(key)
    if (!declaredAbsence && SENSITIVE_NAME_PATTERN.test(key)) {
      errors.push(issue('SENSITIVE_FIELD_FORBIDDEN', entryPointer, 'Secret-like fields are forbidden in sanitized exports.'))
    }
    scanSensitiveFields(entry, entryPointer, errors)
  }
}

function validateSanitizedExportManifest(value) {
  const errors = []
  if (!addObjectError(value, '', errors)) return result(errors)
  validateSchema(value, SANITIZED_EXPORT_V1, errors)
  requiredString(value.id, '/id', errors)
  scanSensitiveFields(value, '', errors)
  if (requiredArray(value.allowlistedArtifacts, '/allowlistedArtifacts', errors)) {
    for (const [index, artifact] of value.allowlistedArtifacts.entries()) {
      const pointer = `/allowlistedArtifacts/${index}`
      if (!addObjectError(artifact, pointer, errors)) continue
      if (!isSafeRelativePosixPath(artifact.path)) {
        errors.push(issue('EXPORT_PATH_TRAVERSAL', `${pointer}/path`, 'Allowlisted artifact paths must be normalized relative POSIX paths.'))
      }
      if (typeof artifact.path === 'string' && SENSITIVE_NAME_PATTERN.test(artifact.path)) {
        errors.push(issue('SENSITIVE_ARTIFACT_FORBIDDEN', `${pointer}/path`, 'Authentication, credential, cookie, token, and secret artifacts cannot be exported.'))
      }
      if (artifact.type === 'symlink' || Object.hasOwn(artifact, 'linkTarget')) {
        errors.push(issue('SYMLINK_ARTIFACT_FORBIDDEN', pointer, 'Symlink-shaped artifacts cannot be exported.'))
      }
      if (artifact.artifactClass !== undefined && !requiredString(artifact.artifactClass, `${pointer}/artifactClass`, errors)) {
        // The required-string error fully describes the invalid optional field.
      }
      if (typeof artifact.artifactClass === 'string' && SENSITIVE_NAME_PATTERN.test(artifact.artifactClass)) {
        errors.push(issue('SENSITIVE_ARTIFACT_FORBIDDEN', `${pointer}/artifactClass`, 'Authentication, credential, cookie, token, and secret artifacts cannot be exported.'))
      }
      if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(artifact.sha256)) {
        errors.push(issue('INVALID_SHA256', `${pointer}/sha256`, 'Expected a 64-character hexadecimal SHA-256 digest.'))
      }
      if (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes < 0) {
        errors.push(issue('INVALID_ARTIFACT_SIZE', `${pointer}/sizeBytes`, 'Expected a non-negative integer byte size.'))
      }
      checkKnownFields(artifact, new Set(['path', 'sha256', 'sizeBytes', 'artifactClass']), pointer, errors)
    }
  }
  if (requiredStringArray(value.excludedSensitiveClasses, '/excludedSensitiveClasses', errors)) {
    const requiredClasses = ['authentication-state', 'cookies', 'tokens']
    for (const sensitiveClass of requiredClasses) {
      if (!value.excludedSensitiveClasses.includes(sensitiveClass)) {
        errors.push(issue('SENSITIVE_CLASS_EXCLUSION_REQUIRED', '/excludedSensitiveClasses', `Missing required excluded sensitive class: ${sensitiveClass}.`))
      }
    }
    for (const [index, sensitiveClass] of value.excludedSensitiveClasses.entries()) {
      if (!requiredClasses.includes(sensitiveClass)) errors.push(issue('INVALID_SENSITIVE_CLASS', `/excludedSensitiveClasses/${index}`, 'Only authentication-state, cookies, and tokens are supported sensitive classes.'))
    }
  }
  if (requiredStringArray(value.schemaVersions, '/schemaVersions', errors)) {
    const schemas = new Set([STUDY_MANIFEST_V1, EVIDENCE_REF_V1, DECISION_OUTCOME_V1, FINDING_V1, SANITIZED_EXPORT_V1])
    for (const [index, schema] of value.schemaVersions.entries()) {
      if (!schemas.has(schema)) errors.push(issue('UNKNOWN_SCHEMA_VERSION', `/schemaVersions/${index}`, 'Schema versions must name a published BetaBots study contract.'))
    }
  }
  if (addObjectError(value.verification, '/verification', errors)) {
    for (const key of ['authenticationStatesAbsent', 'cookiesAbsent', 'tokensAbsent']) {
      if (value.verification[key] !== true) errors.push(issue('SANITIZATION_VERIFICATION_REQUIRED', `/verification/${key}`, 'Sanitized exports must declare sensitive material absent.'))
    }
    checkKnownFields(value.verification, new Set(['authenticationStatesAbsent', 'cookiesAbsent', 'tokensAbsent']), '/verification', errors)
  }
  checkKnownFields(value, new Set(['schema', 'id', 'allowlistedArtifacts', 'excludedSensitiveClasses', 'schemaVersions', 'verification']), '', errors)
  return result(errors)
}

function validateArtifact(value) {
  if (!isObject(value)) return result([issue('INVALID_OBJECT', '', 'Expected an artifact object.')])
  if (value.schema === STUDY_MANIFEST_V1) return validateStudyManifest(value)
  if (value.schema === EVIDENCE_REF_V1) return validateEvidenceRef(value)
  if (value.schema === DECISION_OUTCOME_V1) return validateDecisionOutcome(value)
  if (value.schema === FINDING_V1) return validateFinding(value)
  if (value.schema === SANITIZED_EXPORT_V1) return validateSanitizedExportManifest(value)
  return result([issue('UNKNOWN_SCHEMA', '/schema', 'Unsupported or missing artifact schema identifier.')])
}

function referencedEvidence(value) {
  const pointers = []
  if (!isObject(value)) return pointers
  if (value.schema === DECISION_OUTCOME_V1) {
    if (Array.isArray(value.evidenceRefs)) value.evidenceRefs.forEach((reference, index) => pointers.push([`/evidenceRefs/${index}`, reference]))
    if (isObject(value.allocation) && Array.isArray(value.allocation.sleeves)) {
      value.allocation.sleeves.forEach((sleeve, sleeveIndex) => {
        if (isObject(sleeve) && Array.isArray(sleeve.evidenceRefs)) sleeve.evidenceRefs.forEach((reference, referenceIndex) => pointers.push([`/allocation/sleeves/${sleeveIndex}/evidenceRefs/${referenceIndex}`, reference]))
      })
    }
  }
  if (value.schema === FINDING_V1) {
    for (const field of ['supportingEvidence', 'contradictingEvidence']) {
      if (Array.isArray(value[field])) value[field].forEach((reference, index) => pointers.push([`/${field}/${index}`, reference]))
    }
  }
  return pointers.filter(([, reference]) => typeof reference === 'string' && reference.trim() !== '')
}

function validateArtifacts(values) {
  if (!Array.isArray(values)) return { valid: false, results: [{ valid: false, errors: [issue('INVALID_BATCH', '', 'Expected an array of artifacts.')] }] }
  const results = values.map((value) => {
    const artifactResult = validateArtifact(value)
    delete artifactResult.requiresBatchValidation
    return artifactResult
  })
  const idLocations = new Map()
  values.forEach((value, index) => {
    if (!isObject(value) || typeof value.id !== 'string' || value.id.trim() === '') return
    const entries = idLocations.get(value.id) || []
    entries.push(index)
    idLocations.set(value.id, entries)
  })
  for (const [id, indices] of idLocations.entries()) {
    if (indices.length < 2) continue
    for (const index of indices.slice(1)) {
      const code = values[index].schema === EVIDENCE_REF_V1 ? 'DUPLICATE_EVIDENCE_ID' : 'DUPLICATE_ARTIFACT_ID'
      results[index].errors.push(issue(code, '/id', `Artifact id ${id} must be unique in a batch.`))
      results[index].valid = false
    }
  }
  const evidenceIds = new Map()
  values.forEach((value, index) => {
    if (isObject(value) && value.schema === EVIDENCE_REF_V1 && typeof value.id === 'string' && value.id.trim() !== '') {
      const entries = evidenceIds.get(value.id) || []
      entries.push(index)
      evidenceIds.set(value.id, entries)
    }
  })
  values.forEach((value, index) => {
    for (const [pointer, reference] of referencedEvidence(value)) {
      if ((evidenceIds.get(reference) || []).length !== 1) {
        results[index].errors.push(issue('UNRESOLVED_EVIDENCE_REF', pointer, `Evidence reference ${reference} must resolve to exactly one EvidenceRef artifact in this batch.`))
        results[index].valid = false
      }
    }
  })
  return { valid: results.every((artifactResult) => artifactResult.valid), results }
}

function verifySanitizedExportFiles(value, root) {
  const structural = validateSanitizedExportManifest(value)
  if (!structural.valid) return structural
  const errors = []
  if (typeof root !== 'string' || root.trim() === '') return result([issue('INVALID_EXPORT_ROOT', '', 'An explicit export root is required for filesystem verification.')])
  const resolvedRoot = path.resolve(root)
  let rootStat
  try {
    rootStat = fs.lstatSync(resolvedRoot)
  } catch {
    return result([issue('INVALID_EXPORT_ROOT', '', 'Export root does not exist.')])
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return result([issue('INVALID_EXPORT_ROOT', '', 'Export root must be a non-symlink directory.')])
  for (const [index, artifact] of value.allowlistedArtifacts.entries()) {
    const pointer = `/allowlistedArtifacts/${index}`
    const target = path.resolve(resolvedRoot, ...artifact.path.split('/'))
    const relative = path.relative(resolvedRoot, target)
    if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      errors.push(issue('EXPORT_PATH_TRAVERSAL', `${pointer}/path`, 'Artifact path escapes the export root.'))
      continue
    }
    let current = resolvedRoot
    let stat
    let failed = false
    for (const segment of artifact.path.split('/')) {
      current = path.join(current, segment)
      try {
        stat = fs.lstatSync(current)
      } catch {
        errors.push(issue('ARTIFACT_NOT_FOUND', `${pointer}/path`, 'Allowlisted artifact does not exist beneath the export root.'))
        failed = true
        break
      }
      if (stat.isSymbolicLink()) {
        errors.push(issue('SYMLINK_ARTIFACT_FORBIDDEN', `${pointer}/path`, 'Allowlisted artifacts and their ancestors must not be symlinks.'))
        failed = true
        break
      }
    }
    if (failed) continue
    if (!stat.isFile()) {
      errors.push(issue('NON_REGULAR_ARTIFACT_FORBIDDEN', `${pointer}/path`, 'Allowlisted artifacts must be regular files.'))
      continue
    }
    if (stat.size !== artifact.sizeBytes) errors.push(issue('ARTIFACT_SIZE_MISMATCH', `${pointer}/sizeBytes`, 'Artifact byte size does not match the manifest.'))
    const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
    if (digest !== artifact.sha256.toLowerCase()) errors.push(issue('ARTIFACT_HASH_MISMATCH', `${pointer}/sha256`, 'Artifact SHA-256 digest does not match the manifest.'))
  }
  return result(errors)
}

module.exports = {
  STUDY_MANIFEST_V1,
  EVIDENCE_REF_V1,
  DECISION_OUTCOME_V1,
  FINDING_V1,
  SANITIZED_EXPORT_V1,
  ALLOCATION_PERCENT_TOLERANCE,
  validateStudyManifest,
  validateEvidenceRef,
  validateDecisionOutcome,
  validateFinding,
  validateSanitizedExportManifest,
  validateArtifact,
  validateArtifacts,
  verifySanitizedExportFiles,
}
