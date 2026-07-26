const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const STUDY_MANIFEST_V1 = 'betabots.study-manifest.v1'
const EVIDENCE_REF_V1 = 'betabots.evidence-ref.v1'
const DECISION_OUTCOME_V1 = 'betabots.decision-outcome.v1'
const FINDING_V1 = 'betabots.finding.v1'
const SANITIZED_EXPORT_V1 = 'betabots.sanitized-export.v1'
const ALLOCATION_PERCENT_TOLERANCE = 0.01
const EVIDENCE_CLASSIFICATIONS = new Set(['observed', 'inferred', 'recommendation', 'external', 'unverified'])
const MAX_SAFE_DOLLAR_CENTS = Number.MAX_SAFE_INTEGER
const SENSITIVE_IDENTIFIER_TERMS = new Set([
  'secret', 'password', 'credential', 'credentials', 'auth', 'authentication',
  'token', 'tokens', 'cookie', 'cookies', 'session', 'wallet',
])
const SENSITIVE_IDENTIFIER_PHRASES = [
  ['access', 'key'], ['private', 'key'], ['secret', 'key'], ['api', 'key'], ['browser', 'state'],
]
const SENSITIVE_IDENTIFIER_COMPACT_DENYLIST = new Set([
  'apikey', 'secretkey', 'privatekey', 'accesskey', 'authorization', 'authtoken', 'bearertoken', 'sessiontoken', 'browserstate',
])
const DEFAULT_IGNORABLE_OR_FORMAT = /[\p{Cf}\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0000}\u{E0001}\u{E0020}-\u{E007F}]/gu
const CONFUSABLE_IDENTIFIER_SKELETON = new Map([
  ['\u0430', 'a'], ['\u0432', 'b'], ['\u0441', 'c'], ['\u0435', 'e'], ['\u0433', 'r'], ['\u0456', 'i'], ['\u0458', 'j'], ['\u043e', 'o'], ['\u0440', 'p'], ['\u0455', 's'], ['\u0442', 't'], ['\u0445', 'x'], ['\u0443', 'y'],
  ['\u03b1', 'a'], ['\u03b2', 'b'], ['\u03b5', 'e'], ['\u03b9', 'i'], ['\u03ba', 'k'], ['\u03bc', 'u'], ['\u03bd', 'v'], ['\u03bf', 'o'], ['\u03c1', 'p'], ['\u03c4', 't'], ['\u03c5', 'y'], ['\u03c7', 'x'],
])

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
    errors.push(issue('NUMBER_OUT_OF_RANGE', pointer, 'Number is outside the allowed range.'))
    return false
  }
  return true
}

function requiredAllocationNumber(value, pointer, errors, maximum = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(issue('INVALID_FINITE_NUMBER', pointer, 'Expected a finite number.'))
    return false
  }
  if (Object.is(value, -0)) {
    errors.push(issue('NEGATIVE_ZERO_ALLOCATION', pointer, 'Negative zero is not a permitted allocation amount.'))
    return false
  }
  if (value < 0) {
    errors.push(issue('NEGATIVE_ALLOCATION', pointer, 'Allocation dollars and percentages cannot be negative.'))
    return false
  }
  if (value > maximum) {
    errors.push(issue('NUMBER_OUT_OF_RANGE', pointer, 'Number is outside the allowed range.'))
    return false
  }
  return true
}

function decimalPlaces(value) {
  const [coefficient, exponentPart] = value.toString().toLowerCase().split('e')
  const exponent = exponentPart === undefined ? 0 : Number(exponentPart)
  const fraction = coefficient.split('.')[1]?.length || 0
  return Math.max(0, fraction - exponent)
}

function dollarCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0) || value < 0) return undefined
  if (decimalPlaces(value) > 2) return undefined
  const cents = Math.round(value * 100)
  return Number.isSafeInteger(cents) ? cents : undefined
}

function requiredDollarAmount(value, pointer, errors) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(issue('INVALID_FINITE_NUMBER', pointer, 'Expected a finite number.'))
    return false
  }
  if (Object.is(value, -0)) {
    errors.push(issue('NEGATIVE_ZERO_ALLOCATION', pointer, 'Negative zero is not a permitted allocation amount.'))
    return false
  }
  if (value < 0) {
    errors.push(issue('NEGATIVE_ALLOCATION', pointer, 'Allocation dollars and percentages cannot be negative.'))
    return false
  }
  if (decimalPlaces(value) > 2) {
    errors.push(issue('INVALID_DOLLAR_PRECISION', pointer, 'Dollar amounts must use at most two decimal places.'))
    return false
  }
  if (dollarCents(value) === undefined || value * 100 > MAX_SAFE_DOLLAR_CENTS) {
    errors.push(issue('DOLLAR_AMOUNT_OUT_OF_SAFE_RANGE', pointer, 'Dollar amounts must convert to safe integer cents.'))
    return false
  }
  return true
}

function checkKnownFields(value, fields, pointer, errors) {
  if (!isObject(value)) return
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) errors.push(issue('UNKNOWN_FIELD', pointer, 'Unknown fields are not allowed.'))
  }
}

function result(errors, requiresBatchValidation) {
  const output = { valid: errors.length === 0, errors }
  if (output.valid && requiresBatchValidation) output.requiresBatchValidation = requiresBatchValidation
  return output
}

function validateSchema(value, expected, errors) {
  if (value.schema !== expected) {
    errors.push(issue('SCHEMA_ID_MISMATCH', '/schema', 'Artifact schema identifier is invalid.'))
  }
}

function validateStudyManifestTrusted(value) {
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
  if (requiredArray(value.evidenceRequirements, '/evidenceRequirements', errors)) {
    for (const [index, requirement] of value.evidenceRequirements.entries()) {
      const pointer = `/evidenceRequirements/${index}`
      if (!addObjectError(requirement, pointer, errors)) continue
      const classificationIsString = requiredString(requirement.classification, `${pointer}/classification`, errors)
      if (classificationIsString && !EVIDENCE_CLASSIFICATIONS.has(requirement.classification)) {
        errors.push(issue('INVALID_EVIDENCE_CLASSIFICATION', `${pointer}/classification`, 'Classification must be observed, inferred, recommendation, external, or unverified.'))
      }
      requiredString(requirement.artifactType, `${pointer}/artifactType`, errors)
      if (!['screenshot', 'event', 'path'].includes(requirement.artifactType)) {
        errors.push(issue('INVALID_ARTIFACT_TYPE', `${pointer}/artifactType`, 'Artifact type must be screenshot, event, or path.'))
      }
      if (!Number.isInteger(requirement.minimumCount) || requirement.minimumCount < 1) {
        errors.push(issue('INVALID_REQUIREMENT_MINIMUM_COUNT', `${pointer}/minimumCount`, 'Evidence requirement minimumCount must be a positive integer.'))
      }
      if (requirement.armId !== undefined) {
        const armIsString = requiredString(requirement.armId, `${pointer}/armId`, errors)
        if (armIsString && !armIds.has(requirement.armId)) {
          errors.push(issue('UNKNOWN_REQUIREMENT_ARM', `${pointer}/armId`, 'Evidence requirement armId must name a declared study arm.'))
        }
      }
      checkKnownFields(requirement, new Set(['classification', 'artifactType', 'minimumCount', 'armId']), pointer, errors)
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
  return result(errors, issue('BATCH_CONTEXT_REQUIRED', '/evidenceRequirements', 'Evidence requirements are satisfied only by batch validation.'))
}

function validateEvidenceRefTrusted(value) {
  const errors = []
  if (!addObjectError(value, '', errors)) return result(errors)
  validateSchema(value, EVIDENCE_REF_V1, errors)
  requiredString(value.id, '/id', errors)
  requiredString(value.studyId, '/studyId', errors)
  if (value.armId !== undefined) requiredString(value.armId, '/armId', errors)
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
  checkKnownFields(value, new Set(['schema', 'id', 'studyId', 'armId', 'classification', 'claim', 'artifact', 'context', 'recommendation']), '', errors)
  return result(errors, issue('BATCH_CONTEXT_REQUIRED', '/studyId', 'Evidence study and arm links require batch validation for resolution.'))
}

function validateDecisionOutcomeTrusted(value) {
  const errors = []
  if (!addObjectError(value, '', errors)) return result(errors)
  validateSchema(value, DECISION_OUTCOME_V1, errors)
  requiredString(value.id, '/id', errors)
  requiredString(value.studyId, '/studyId', errors)
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
      requiredDollarAmount(allocation.budgetDollars, '/allocation/budgetDollars', errors)
      if (addObjectError(allocation.cash, '/allocation/cash', errors)) {
        requiredDollarAmount(allocation.cash.dollars, '/allocation/cash/dollars', errors)
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
          requiredDollarAmount(sleeve.dollars, `${pointer}/dollars`, errors)
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
      const budgetCents = dollarCents(allocation.budgetDollars)
      const cashCents = isObject(allocation.cash) ? dollarCents(allocation.cash.dollars) : undefined
      const sleeveCents = Array.isArray(allocation.sleeves) ? allocation.sleeves.map((sleeve) => (
        isObject(sleeve) ? dollarCents(sleeve.dollars) : undefined
      )) : []
      if (budgetCents !== undefined && cashCents !== undefined && sleeveCents.length > 0 && sleeveCents.every((cents) => cents !== undefined)) {
        const assignedCents = cashCents + sleeveCents.reduce((total, cents) => total + cents, 0)
        if (!Number.isSafeInteger(assignedCents) || assignedCents !== budgetCents) errors.push(issue('ALLOCATION_DOLLAR_MISMATCH', '/allocation', 'Allocation dollars must equal the assigned budget in exact cents.'))
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
  checkKnownFields(value, new Set(['schema', 'id', 'studyId', 'outcome', 'allocation', 'conditions', 'rejectedOpportunities', 'missingEvidence', 'evidenceRefs', 'realSpend']), '', errors)
  const batchRequirement = issue('BATCH_CONTEXT_REQUIRED', '/studyId', 'Study and evidence references require batch validation for resolution.')
  return result(errors, batchRequirement)
}

function validateFindingTrusted(value) {
  const errors = []
  if (!addObjectError(value, '', errors)) return result(errors)
  validateSchema(value, FINDING_V1, errors)
  requiredString(value.id, '/id', errors)
  requiredString(value.studyId, '/studyId', errors)
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
      const seen = new Set()
      for (const [index, reference] of value[field].entries()) {
        if (seen.has(reference)) errors.push(issue(`DUPLICATE_${field === 'supportingEvidence' ? 'SUPPORTING' : 'CONTRADICTING'}_EVIDENCE_REF`, `/${field}/${index}`, 'Evidence references must be unique within each polarity list.'))
        seen.add(reference)
        evidencePointers.push([`/${field}/${index}`, reference])
      }
    }
  }
  if (Array.isArray(value.supportingEvidence) && Array.isArray(value.contradictingEvidence)) {
    const supporting = new Set(value.supportingEvidence)
    value.contradictingEvidence.forEach((reference, index) => {
      if (supporting.has(reference)) errors.push(issue('OVERLAPPING_EVIDENCE_REF', `/contradictingEvidence/${index}`, 'Evidence cannot support and contradict the same finding.'))
    })
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
  checkKnownFields(value, new Set(['schema', 'id', 'studyId', 'observation', 'affected', 'supportingEvidence', 'contradictingEvidence', 'commercialImplication', 'confidence', 'limitations']), '', errors)
  const batchRequirement = issue('BATCH_CONTEXT_REQUIRED', '/studyId', 'Study and evidence references require batch validation for resolution.')
  return result(errors, batchRequirement)
}

function isSafeRelativePosixPath(value) {
  if (typeof value !== 'string' || value === '' || value !== value.normalize('NFC')) return false
  if (/[\u0000-\u001F\u007F]/.test(value) || value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false
  const segments = value.split('/')
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function normalizedIdentifierForms(value) {
  if (typeof value !== 'string') return { tokens: [], compact: [] }
  const normalized = Array.from(value.normalize('NFKC'), (character) => (
    CONFUSABLE_IDENTIFIER_SKELETON.get(character.toLowerCase()) || character
  )).join('')
  const forms = [
    normalized.replace(DEFAULT_IGNORABLE_OR_FORMAT, ''),
    normalized.replace(DEFAULT_IGNORABLE_OR_FORMAT, ' '),
  ]
  const tokens = []
  const compact = []
  for (const form of forms) {
    const boundaryNormalized = form
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    const formTokens = boundaryNormalized.toLowerCase().match(/[a-z0-9]+/g) || []
    tokens.push(...formTokens)
    for (const component of form.split(/[\\/.:\s]+/u)) {
      const separatorFree = component.replace(/[^a-z0-9]/giu, '').toLowerCase()
      if (separatorFree !== '') compact.push(separatorFree)
    }
    for (let start = 0; start < formTokens.length; start += 1) {
      let joined = ''
      for (let end = start; end < formTokens.length; end += 1) {
        joined += formTokens[end]
        if (joined.length > 32) break
        compact.push(joined)
      }
    }
  }
  return { tokens, compact }
}

function identifierTokens(value) {
  return normalizedIdentifierForms(value).tokens
}

function isSensitiveIdentifier(value) {
  if (typeof value !== 'string') return false
  const { tokens, compact } = normalizedIdentifierForms(value)
  if (compact.some((candidate) => SENSITIVE_IDENTIFIER_COMPACT_DENYLIST.has(candidate) || SENSITIVE_IDENTIFIER_TERMS.has(candidate))) return true
  if (tokens.some((token) => SENSITIVE_IDENTIFIER_TERMS.has(token))) return true
  return SENSITIVE_IDENTIFIER_PHRASES.some((phrase) => tokens.some((_, start) => (
    phrase.every((token, phraseIndex) => tokens[start + phraseIndex] === token)
  )))
}

function isIdentifierValueField(key) {
  return ['path', 'name', 'class', 'type', 'kind', 'extension', 'context'].some((term) => identifierTokens(key).includes(term))
}

const SAFE_CONTRACT_FIELD_NAMES = new Set([
  'schema', 'id', 'title', 'researchQuestion', 'hypotheses', 'target', 'app', 'startUrls', 'environment', 'attestationMode',
  'arms', 'type', 'personaRefs', 'tasks', 'interactionPolicyRef', 'authenticationLifecyclePolicy', 'evidenceRequirements',
  'classification', 'artifactType', 'minimumCount', 'armId', 'reproducibility', 'seed', 'engine', 'model', 'limitations',
  'studyId', 'claim', 'artifact', 'ref', 'context', 'sessionId', 'personaRef', 'timestamp', 'recommendation', 'outcome',
  'allocation', 'hypothetical', 'budgetDollars', 'cash', 'dollars', 'percent', 'sleeves', 'deployed', 'evidenceRefs',
  'conditions', 'rejectedOpportunities', 'missingEvidence', 'observation', 'affected', 'supportingEvidence',
  'contradictingEvidence', 'commercialImplication', 'statement', 'confidence', 'allowlistedArtifacts', 'path', 'sha256',
  'sizeBytes', 'artifactClass', 'excludedSensitiveClasses', 'schemaVersions', 'verification', 'authenticationStatesAbsent',
  'cookiesAbsent', 'tokensAbsent', 'realSpend', 'linkTarget',
])

function scanSensitiveFields(value, pointer, errors, safePointer = pointer) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanSensitiveFields(entry, `${pointer}/${index}`, errors, `${safePointer}/${index}`))
    return
  }
  if (!isObject(value)) return
  for (const [key, entry] of Object.entries(value)) {
    const entryPointer = `${pointer}/${key}`
    const safeEntryPointer = SAFE_CONTRACT_FIELD_NAMES.has(key) ? `${safePointer}/${key}` : safePointer
    const declaredAbsence = pointer === '/verification' && ['authenticationStatesAbsent', 'cookiesAbsent', 'tokensAbsent'].includes(key)
    if (!declaredAbsence && isSensitiveIdentifier(key)) {
      errors.push(issue('SENSITIVE_FIELD_FORBIDDEN', safePointer, 'Secret-like fields are forbidden in sanitized exports.'))
    }
    const canonicalArtifactIdentifier = /^\/allowlistedArtifacts\/\d+\/(path|artifactClass)$/.test(entryPointer)
    if (!canonicalArtifactIdentifier && isIdentifierValueField(key) && typeof entry === 'string' && isSensitiveIdentifier(entry)) {
      errors.push(issue('SENSITIVE_FIELD_FORBIDDEN', safeEntryPointer, 'Secret-like identifier values are forbidden in sanitized exports.'))
    }
    scanSensitiveFields(entry, entryPointer, errors, safeEntryPointer)
  }
}

function validateSanitizedExportManifestTrusted(value) {
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
      if (typeof artifact.path === 'string' && isSensitiveIdentifier(artifact.path)) {
        errors.push(issue('SENSITIVE_ARTIFACT_FORBIDDEN', `${pointer}/path`, 'Authentication, credential, cookie, token, and secret artifacts cannot be exported.'))
      }
      if (artifact.type === 'symlink' || Object.hasOwn(artifact, 'linkTarget')) {
        errors.push(issue('SYMLINK_ARTIFACT_FORBIDDEN', pointer, 'Symlink-shaped artifacts cannot be exported.'))
      }
      if (artifact.artifactClass !== undefined && !requiredString(artifact.artifactClass, `${pointer}/artifactClass`, errors)) {
        // The required-string error fully describes the invalid optional field.
      }
      if (typeof artifact.artifactClass === 'string' && isSensitiveIdentifier(artifact.artifactClass)) {
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
    const seenClasses = new Set()
    for (const sensitiveClass of requiredClasses) {
      if (!value.excludedSensitiveClasses.includes(sensitiveClass)) {
        errors.push(issue('SENSITIVE_CLASS_EXCLUSION_REQUIRED', '/excludedSensitiveClasses', 'All required sensitive classes must be excluded.'))
      }
    }
    for (const [index, sensitiveClass] of value.excludedSensitiveClasses.entries()) {
      if (seenClasses.has(sensitiveClass)) errors.push(issue('DUPLICATE_EXCLUDED_SENSITIVE_CLASS', `/excludedSensitiveClasses/${index}`, 'Excluded sensitive classes must be unique.'))
      seenClasses.add(sensitiveClass)
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

function validateArtifactTrusted(value) {
  if (!isObject(value)) return result([issue('INVALID_OBJECT', '', 'Expected an artifact object.')])
  if (value.schema === STUDY_MANIFEST_V1) return validateStudyManifestTrusted(value)
  if (value.schema === EVIDENCE_REF_V1) return validateEvidenceRefTrusted(value)
  if (value.schema === DECISION_OUTCOME_V1) return validateDecisionOutcomeTrusted(value)
  if (value.schema === FINDING_V1) return validateFindingTrusted(value)
  if (value.schema === SANITIZED_EXPORT_V1) return validateSanitizedExportManifestTrusted(value)
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

function validateArtifactsTrusted(values) {
  if (!Array.isArray(values)) return { valid: false, results: [{ valid: false, errors: [issue('INVALID_BATCH', '', 'Expected an array of artifacts.')] }] }
  const results = values.map((value) => {
    const artifactResult = validateArtifactTrusted(value)
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
  for (const [, indices] of idLocations.entries()) {
    if (indices.length < 2) continue
    for (const index of indices.slice(1)) {
      const code = values[index].schema === EVIDENCE_REF_V1 ? 'DUPLICATE_EVIDENCE_ID' : 'DUPLICATE_ARTIFACT_ID'
      results[index].errors.push(issue(code, '/id', 'Artifact ids must be unique in a batch.'))
      results[index].valid = false
    }
  }
  const evidenceIds = new Map()
  const manifestIds = new Map()
  values.forEach((value, index) => {
    if (isObject(value) && value.schema === EVIDENCE_REF_V1 && typeof value.id === 'string' && value.id.trim() !== '') {
      const entries = evidenceIds.get(value.id) || []
      entries.push(index)
      evidenceIds.set(value.id, entries)
    }
    if (isObject(value) && value.schema === STUDY_MANIFEST_V1 && typeof value.id === 'string' && value.id.trim() !== '') {
      const entries = manifestIds.get(value.id) || []
      entries.push(index)
      manifestIds.set(value.id, entries)
    }
  })
  values.forEach((value, index) => {
    if (!isObject(value) || value.schema !== EVIDENCE_REF_V1) return
    const manifests = manifestIds.get(value.studyId) || []
    if (manifests.length !== 1) {
      results[index].errors.push(issue('UNKNOWN_EVIDENCE_STUDY', '/studyId', 'Evidence studyId must resolve to exactly one StudyManifest in this batch.'))
      results[index].valid = false
      return
    }
    const manifest = values[manifests[0]]
    const arms = Array.isArray(manifest.arms) ? manifest.arms.filter(isObject) : []
    if (value.armId !== undefined) {
      const arm = arms.find((candidate) => candidate.id === value.armId)
      if (!arm) {
        results[index].errors.push(issue('UNKNOWN_EVIDENCE_ARM', '/armId', 'Evidence armId must name a declared arm in its StudyManifest.'))
        results[index].valid = false
      } else if (isObject(value.context) && typeof value.context.personaRef === 'string' && (!Array.isArray(arm.personaRefs) || !arm.personaRefs.includes(value.context.personaRef))) {
        const personaExists = arms.some((candidate) => Array.isArray(candidate.personaRefs) && candidate.personaRefs.includes(value.context.personaRef))
        results[index].errors.push(issue(personaExists ? 'EVIDENCE_PERSONA_ARM_MISMATCH' : 'UNKNOWN_EVIDENCE_PERSONA', '/context/personaRef', personaExists
          ? 'Evidence context personaRef must be declared in the evidence arm.'
          : 'Evidence context personaRef must be declared in the StudyManifest.'))
        results[index].valid = false
      }
    } else if (isObject(value.context) && typeof value.context.personaRef === 'string') {
      const personaArms = arms.filter((candidate) => Array.isArray(candidate.personaRefs) && candidate.personaRefs.includes(value.context.personaRef))
      if (personaArms.length === 0) {
        results[index].errors.push(issue('UNKNOWN_EVIDENCE_PERSONA', '/context/personaRef', 'Evidence context personaRef must be declared in the StudyManifest.'))
        results[index].valid = false
      } else if (personaArms.length !== 1) {
        results[index].errors.push(issue('AMBIGUOUS_EVIDENCE_PERSONA', '/context/personaRef', 'Study-scoped evidence context personaRef must resolve to exactly one arm.'))
        results[index].valid = false
      }
    }
  })
  values.forEach((value, index) => {
    if (!isObject(value) || ![DECISION_OUTCOME_V1, FINDING_V1].includes(value.schema)) return
    const manifests = manifestIds.get(value.studyId) || []
    if (manifests.length !== 1) {
      results[index].errors.push(issue('UNKNOWN_ARTIFACT_STUDY', '/studyId', 'Artifact studyId must resolve to exactly one StudyManifest in this batch.'))
      results[index].valid = false
      return
    }
    if (value.schema !== FINDING_V1 || !isObject(value.affected)) return
    const manifest = values[manifests[0]]
    const arms = Array.isArray(manifest.arms) ? manifest.arms.filter(isObject) : []
    const affectedArms = Array.isArray(value.affected.arms) ? value.affected.arms : []
    const affectedPersonas = Array.isArray(value.affected.personas) ? value.affected.personas : []
    for (const [armIndex, armId] of affectedArms.entries()) {
      if (!arms.some((arm) => arm.id === armId)) {
        results[index].errors.push(issue('UNKNOWN_FINDING_ARM', `/affected/arms/${armIndex}`, 'Finding affected arm must be declared in its StudyManifest.'))
        results[index].valid = false
      }
    }
    for (const [personaIndex, personaRef] of affectedPersonas.entries()) {
      const personaArms = arms.filter((arm) => Array.isArray(arm.personaRefs) && arm.personaRefs.includes(personaRef))
      if (personaArms.length === 0) {
        results[index].errors.push(issue('UNKNOWN_FINDING_PERSONA', `/affected/personas/${personaIndex}`, 'Finding affected persona must be declared in its StudyManifest.'))
        results[index].valid = false
      } else if (affectedArms.length > 0 && !personaArms.some((arm) => affectedArms.includes(arm.id))) {
        results[index].errors.push(issue('FINDING_PERSONA_ARM_MISMATCH', `/affected/personas/${personaIndex}`, 'Finding affected persona must belong to at least one listed affected arm.'))
        results[index].valid = false
      }
    }
  })
  values.forEach((manifest, manifestIndex) => {
    if (!isObject(manifest) || manifest.schema !== STUDY_MANIFEST_V1 || !Array.isArray(manifest.evidenceRequirements)) return
    for (const [requirementIndex, requirement] of manifest.evidenceRequirements.entries()) {
      if (!isObject(requirement)) continue
      const matchingEvidence = values.filter((evidence, evidenceIndex) => results[evidenceIndex].valid
        && isObject(evidence)
        && evidence.schema === EVIDENCE_REF_V1
        && evidence.studyId === manifest.id
        && evidence.classification === requirement.classification
        && evidence.artifact?.type === requirement.artifactType
        && (requirement.armId === undefined || evidence.armId === requirement.armId))
      if (matchingEvidence.length < requirement.minimumCount) {
        results[manifestIndex].errors.push(issue('EVIDENCE_REQUIREMENT_UNSATISFIED', `/evidenceRequirements/${requirementIndex}`, 'Linked EvidenceRefs do not satisfy this structured evidence requirement.'))
        results[manifestIndex].valid = false
      }
    }
  })
  const validEvidenceIds = new Map()
  const invalidEvidenceIds = new Set()
  values.forEach((value, index) => {
    if (!isObject(value) || value.schema !== EVIDENCE_REF_V1 || typeof value.id !== 'string' || value.id.trim() === '') return
    if (results[index].valid) {
      const entries = validEvidenceIds.get(value.id) || []
      entries.push(index)
      validEvidenceIds.set(value.id, entries)
    } else {
      invalidEvidenceIds.add(value.id)
    }
  })
  values.forEach((value, index) => {
    for (const [pointer, reference] of referencedEvidence(value)) {
      const allMatches = evidenceIds.get(reference) || []
      if (allMatches.length === 0) {
        results[index].errors.push(issue('UNRESOLVED_EVIDENCE_REF', pointer, 'Evidence reference must resolve to exactly one EvidenceRef artifact in this batch.'))
        results[index].valid = false
        continue
      }
      if (invalidEvidenceIds.has(reference)) {
        results[index].errors.push(issue('INVALID_EVIDENCE_REF', pointer, 'Evidence reference resolves to an invalid EvidenceRef artifact.'))
        results[index].valid = false
        continue
      }
      const matches = validEvidenceIds.get(reference) || []
      if (matches.length !== 1) {
        results[index].errors.push(issue('UNRESOLVED_EVIDENCE_REF', pointer, 'Evidence reference must resolve to exactly one EvidenceRef artifact in this batch.'))
        results[index].valid = false
        continue
      }
      const evidence = values[matches[0]]
      if (evidence.studyId !== value.studyId) {
        results[index].errors.push(issue('EVIDENCE_STUDY_MISMATCH', pointer, 'Evidence reference must belong to the same study as the referring artifact.'))
        results[index].valid = false
      }
      if (value.schema === FINDING_V1 && Array.isArray(value.affected?.arms) && evidence.armId !== undefined && !value.affected.arms.includes(evidence.armId)) {
        results[index].errors.push(issue('EVIDENCE_ARM_MISMATCH', pointer, 'Finding evidence armId must be listed in affected.arms.'))
        results[index].valid = false
      }
    }
  })
  return { valid: results.every((artifactResult) => artifactResult.valid), results }
}

function cloneUntrustedValue(value, visiting = new WeakSet()) {
  if (value === null || typeof value !== 'object') return { value }
  try {
    if (visiting.has(value)) return { code: 'CYCLIC_INPUT' }
    visiting.add(value)
    const copy = Array.isArray(value) ? [] : Object.create(null)
    // Probe the discriminator through the normal access path so hostile get traps
    // cannot be mistaken for an ordinary unsupported artifact.
    void value.schema
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) return { code: 'UNSAFE_INPUT_ACCESS' }
      const child = cloneUntrustedValue(descriptor.value, visiting)
      if (child.code) return child
      Object.defineProperty(copy, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: child.value,
      })
    }
    visiting.delete(value)
    return { value: copy }
  } catch {
    return { code: 'UNSAFE_INPUT_ACCESS' }
  }
}

function inputSafetyResult(code) {
  return result([issue(code, '', code === 'CYCLIC_INPUT'
    ? 'Cyclic input is not supported.'
    : 'Input could not be safely accessed.')])
}

function withSafeInput(value, validator) {
  const cloned = cloneUntrustedValue(value)
  if (cloned.code) return inputSafetyResult(cloned.code)
  return validator(cloned.value)
}

function validateStudyManifest(value) {
  return withSafeInput(value, validateStudyManifestTrusted)
}

function validateEvidenceRef(value) {
  return withSafeInput(value, validateEvidenceRefTrusted)
}

function validateDecisionOutcome(value) {
  return withSafeInput(value, validateDecisionOutcomeTrusted)
}

function validateFinding(value) {
  return withSafeInput(value, validateFindingTrusted)
}

function validateSanitizedExportManifest(value) {
  return withSafeInput(value, validateSanitizedExportManifestTrusted)
}

function validateArtifact(value) {
  return withSafeInput(value, validateArtifactTrusted)
}

function validateArtifacts(values) {
  let length
  try {
    if (!Array.isArray(values)) return validateArtifactsTrusted(values)
    length = values.length
  } catch {
    return { valid: false, results: [inputSafetyResult('UNSAFE_INPUT_ACCESS')] }
  }
  const clonedValues = []
  const unsafe = new Map()
  for (let index = 0; index < length; index += 1) {
    let entry
    try {
      entry = values[index]
    } catch {
      unsafe.set(index, 'UNSAFE_INPUT_ACCESS')
      clonedValues.push({})
      continue
    }
    const cloned = cloneUntrustedValue(entry)
    if (cloned.code) {
      unsafe.set(index, cloned.code)
      clonedValues.push({})
    } else {
      clonedValues.push(cloned.value)
    }
  }
  const output = validateArtifactsTrusted(clonedValues)
  for (const [index, code] of unsafe) output.results[index] = inputSafetyResult(code)
  output.valid = output.results.every((artifactResult) => artifactResult.valid)
  return output
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
}

function samePathSnapshot(left, right) {
  return sameFileIdentity(left, right)
    && left.mode === right.mode
    && left.uid === right.uid
    && left.gid === right.gid
    && left.realpath === right.realpath
}

function descriptorMetadataSnapshot(stat) {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
    nlink: stat.nlink,
    mtime: stat.mtimeNs === undefined ? stat.mtimeMs : stat.mtimeNs,
    ctime: stat.ctimeNs === undefined ? stat.ctimeMs : stat.ctimeNs,
    birthtime: stat.birthtimeNs === undefined ? stat.birthtimeMs : stat.birthtimeNs,
  }
}

function sameDescriptorMetadata(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key])
}

function isContainedPath(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function snapshotPath(target, rootRealpath, expectDirectory) {
  let stat
  try {
    stat = fs.lstatSync(target)
  } catch {
    return { error: 'ARTIFACT_NOT_FOUND' }
  }
  if (stat.isSymbolicLink()) return { error: 'SYMLINK_ARTIFACT_FORBIDDEN' }
  if (expectDirectory ? !stat.isDirectory() : !stat.isFile()) return { error: 'NON_REGULAR_ARTIFACT_FORBIDDEN' }
  let realpath
  try {
    realpath = fs.realpathSync(target)
  } catch {
    return { error: 'ARTIFACT_NOT_FOUND' }
  }
  if (!isContainedPath(rootRealpath, realpath)) return { error: 'EXPORT_PATH_TRAVERSAL' }
  return { dev: stat.dev, ino: stat.ino, mode: stat.mode, uid: stat.uid, gid: stat.gid, realpath }
}

function snapshotArtifactPath(resolvedRoot, rootRealpath, segments) {
  const ancestors = []
  const rootSnapshot = snapshotPath(resolvedRoot, rootRealpath, true)
  if (rootSnapshot.error) return rootSnapshot
  ancestors.push(rootSnapshot)
  let current = resolvedRoot
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment)
    const snapshot = snapshotPath(current, rootRealpath, true)
    if (snapshot.error) return snapshot
    ancestors.push(snapshot)
  }
  current = path.join(current, segments.at(-1))
  const leaf = snapshotPath(current, rootRealpath, false)
  if (leaf.error) return leaf
  return { ancestors, leaf }
}

function snapshotArtifactNamespace(resolvedRoot, segments) {
  let rootRealpath
  try {
    rootRealpath = fs.realpathSync(resolvedRoot)
  } catch {
    return { error: 'ARTIFACT_NOT_FOUND' }
  }
  const snapshot = snapshotArtifactPath(resolvedRoot, rootRealpath, segments)
  if (snapshot.error) return snapshot
  return { rootRealpath, snapshot }
}

function sameArtifactPathSnapshot(left, right) {
  return sameFileIdentity(left.leaf, right.leaf)
    && left.ancestors.length === right.ancestors.length
    && left.ancestors.every((snapshot, ancestorIndex) => samePathSnapshot(snapshot, right.ancestors[ancestorIndex]))
    && samePathSnapshot(left.leaf, right.leaf)
}

function artifactPathIssue(code, pointer) {
  if (code === 'SYMLINK_ARTIFACT_FORBIDDEN') return issue(code, pointer, 'Allowlisted artifacts and their ancestors must not be symlinks.')
  if (code === 'NON_REGULAR_ARTIFACT_FORBIDDEN') return issue(code, pointer, 'Allowlisted artifacts must be regular files.')
  if (code === 'EXPORT_PATH_TRAVERSAL') return issue(code, pointer, 'Artifact path escapes the export root.')
  return issue('ARTIFACT_NOT_FOUND', pointer, 'Allowlisted artifact does not exist beneath the export root.')
}

function resolveLinuxDescriptorPath(descriptor) {
  try {
    return fs.realpathSync(`/proc/self/fd/${descriptor}`)
  } catch {
    return { unavailable: true }
  }
}

function resolveMacDescriptorPath(descriptor) {
  const lsof = spawnSync('/usr/sbin/lsof', [
    '-nP', '-a', '-p', String(process.pid), '-d', String(descriptor), '-Fn0',
  ], { encoding: 'buffer', timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true })
  if (lsof.error?.code === 'ENOENT') return { unavailable: true }
  if (lsof.error || lsof.status !== 0 || !Buffer.isBuffer(lsof.stdout)) return undefined
  let currentDescriptor = false
  let resolvedPath
  for (const rawField of lsof.stdout.toString('utf8').split('\0')) {
    const field = rawField.replace(/^\n+/, '')
    if (field === '') continue
    if (field.startsWith('f')) {
      const match = /^f(\d+)/.exec(field)
      currentDescriptor = match !== null && Number(match[1]) === descriptor
      continue
    }
    if (field.startsWith('n') && currentDescriptor) {
      if (resolvedPath !== undefined || field.length === 1) return undefined
      resolvedPath = field.slice(1)
    }
  }
  return resolvedPath
}

function platformDescriptorPathResolver() {
  if (process.platform === 'linux' && fs.existsSync('/proc/self/fd')) return resolveLinuxDescriptorPath
  if (process.platform === 'darwin' && fs.existsSync('/usr/sbin/lsof')) return resolveMacDescriptorPath
  return null
}

function resolveOpenedDescriptorPath(resolver, descriptor) {
  try {
    const resolved = resolver(descriptor)
    if (resolved?.unavailable === true) return { unavailable: true }
    if (typeof resolved !== 'string' || resolved === '' || !path.isAbsolute(resolved)) return { failed: true }
    return { path: resolved }
  } catch {
    return { failed: true }
  }
}

function extractVerificationOptions(options) {
  try {
    if (options === null || (typeof options !== 'object' && typeof options !== 'function')) return { code: 'UNSAFE_INPUT_ACCESS' }
    Object.keys(options)
    const checkpoint = options.checkpoint
    const descriptorPathResolver = options.descriptorPathResolver
    if (checkpoint !== undefined && typeof checkpoint !== 'function') return { code: 'UNSAFE_INPUT_ACCESS' }
    if (descriptorPathResolver !== undefined && descriptorPathResolver !== null && typeof descriptorPathResolver !== 'function') return { code: 'UNSAFE_INPUT_ACCESS' }
    return { value: { checkpoint, descriptorPathResolver } }
  } catch {
    return { code: 'UNSAFE_INPUT_ACCESS' }
  }
}

function checkpointIssue(code, pointer) {
  if (code === 'ASYNC_CHECKPOINT_UNSUPPORTED') {
    return issue(code, pointer, 'Checkpoint callbacks must return undefined synchronously.')
  }
  if (code === 'CHECKPOINT_RETURN_VALUE_UNSUPPORTED') {
    return issue(code, pointer, 'Checkpoint callbacks must return undefined.')
  }
  return issue('UNSAFE_CHECKPOINT_CALLBACK', pointer, 'Checkpoint callback could not be safely invoked.')
}

function invokeCheckpointSafely(checkpoint, stage, pointer) {
  if (checkpoint === undefined) return undefined
  let callbackResult
  try {
    callbackResult = checkpoint(stage)
  } catch {
    return checkpointIssue('UNSAFE_CHECKPOINT_CALLBACK', pointer)
  }
  if (callbackResult === undefined) return undefined
  if (callbackResult !== null && (typeof callbackResult === 'object' || typeof callbackResult === 'function')) {
    let then
    try {
      then = callbackResult.then
    } catch {
      return checkpointIssue('ASYNC_CHECKPOINT_UNSUPPORTED', pointer)
    }
    if (typeof then === 'function') {
      try {
        Promise.resolve(callbackResult).catch(() => {})
      } catch {}
      return checkpointIssue('ASYNC_CHECKPOINT_UNSUPPORTED', pointer)
    }
  }
  return checkpointIssue('CHECKPOINT_RETURN_VALUE_UNSUPPORTED', pointer)
}

function verifySanitizedExportFilesTrusted(value, root, options = {}) {
  const { checkpoint, descriptorPathResolver } = options
  const structural = validateSanitizedExportManifestTrusted(value)
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
  if (typeof fs.constants.O_NOFOLLOW !== 'number' || fs.constants.O_NOFOLLOW === 0) {
    return result([issue('NOFOLLOW_UNAVAILABLE', '', 'Filesystem verification requires no-follow open semantics.')])
  }
  const resolver = descriptorPathResolver === undefined ? platformDescriptorPathResolver() : descriptorPathResolver
  if (typeof resolver !== 'function') {
    return result([issue('DESCRIPTOR_RESOLVER_UNAVAILABLE', '', 'Filesystem verification requires a supported descriptor path resolver.')])
  }
  let rootRealpath
  try {
    rootRealpath = fs.realpathSync(resolvedRoot)
  } catch {
    return result([issue('INVALID_EXPORT_ROOT', '', 'Export root does not exist.')])
  }
  const verifiedArtifacts = []
  for (const [index, artifact] of value.allowlistedArtifacts.entries()) {
    const pointer = `/allowlistedArtifacts/${index}`
    const segments = artifact.path.split('/')
    const target = path.resolve(resolvedRoot, ...segments)
    const relative = path.relative(resolvedRoot, target)
    if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      errors.push(issue('EXPORT_PATH_TRAVERSAL', `${pointer}/path`, 'Artifact path escapes the export root.'))
      continue
    }
    const before = snapshotArtifactPath(resolvedRoot, rootRealpath, segments)
    if (before.error) {
      errors.push(artifactPathIssue(before.error, `${pointer}/path`))
      continue
    }
    let descriptor
    const errorsBeforeArtifact = errors.length
    try {
      const beforeOpenCheckpointError = invokeCheckpointSafely(checkpoint, 'beforeOpen', pointer)
      if (beforeOpenCheckpointError) {
        errors.push(beforeOpenCheckpointError)
        continue
      }
      try {
        descriptor = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
      } catch {
        errors.push(issue('ARTIFACT_NOT_FOUND', `${pointer}/path`, 'Allowlisted artifact does not exist beneath the export root.'))
        continue
      }
      const afterOpenCheckpointError = invokeCheckpointSafely(checkpoint, 'afterOpen', pointer)
      if (afterOpenCheckpointError) {
        errors.push(afterOpenCheckpointError)
        continue
      }
      const opened = fs.fstatSync(descriptor)
      const openedMetadata = fs.fstatSync(descriptor, { bigint: true })
      if (!opened.isFile()) {
        errors.push(issue('NON_REGULAR_ARTIFACT_FORBIDDEN', `${pointer}/path`, 'Allowlisted artifacts must be regular files.'))
        continue
      }
      const descriptorResolution = resolveOpenedDescriptorPath(resolver, descriptor)
      if (descriptorResolution.unavailable) {
        errors.push(issue('DESCRIPTOR_RESOLVER_UNAVAILABLE', `${pointer}/path`, 'Filesystem verification requires a supported descriptor path resolver.'))
        continue
      }
      if (descriptorResolution.failed) {
        errors.push(issue('DESCRIPTOR_PATH_RESOLUTION_FAILED', `${pointer}/path`, 'Opened artifact path could not be resolved.'))
        continue
      }
      if (!isContainedPath(rootRealpath, descriptorResolution.path)) {
        errors.push(issue('DESCRIPTOR_PATH_OUTSIDE_ROOT', `${pointer}/path`, 'Opened artifact is outside the export root.'))
        continue
      }
      const contents = fs.readFileSync(descriptor)
      const after = snapshotArtifactPath(resolvedRoot, rootRealpath, segments)
      if (after.error
        || !sameFileIdentity(before.leaf, opened)
        || !sameFileIdentity(after.leaf, opened)
        || !sameArtifactPathSnapshot(before, after)) {
        errors.push(issue('ARTIFACT_PATH_RACE_DETECTED', `${pointer}/path`, 'Allowlisted artifact path changed while it was being verified.'))
        continue
      }
      if (opened.size !== artifact.sizeBytes) errors.push(issue('ARTIFACT_SIZE_MISMATCH', `${pointer}/sizeBytes`, 'Artifact byte size does not match the manifest.'))
      const digest = crypto.createHash('sha256').update(contents).digest('hex')
      if (digest !== artifact.sha256.toLowerCase()) errors.push(issue('ARTIFACT_HASH_MISMATCH', `${pointer}/sha256`, 'Artifact SHA-256 digest does not match the manifest.'))
      const afterPathSnapshotCheckpointError = invokeCheckpointSafely(checkpoint, 'afterPathSnapshotBeforeFinalFstat', pointer)
      if (afterPathSnapshotCheckpointError) {
        errors.push(afterPathSnapshotCheckpointError)
        continue
      }
      const afterReadCheckpointError = invokeCheckpointSafely(checkpoint, 'afterReadBeforeFinalFstat', pointer)
      if (afterReadCheckpointError) {
        errors.push(afterReadCheckpointError)
        continue
      }
      let firstFinalDescriptor
      try {
        firstFinalDescriptor = fs.fstatSync(descriptor, { bigint: true })
      } catch {
        errors.push(issue('ARTIFACT_MUTATED_DURING_VERIFICATION', `${pointer}/path`, 'Allowlisted artifact changed while it was being verified.'))
        continue
      }
      if (!sameDescriptorMetadata(descriptorMetadataSnapshot(openedMetadata), descriptorMetadataSnapshot(firstFinalDescriptor))
        || firstFinalDescriptor.size !== BigInt(contents.length)) {
        errors.push(issue('ARTIFACT_MUTATED_DURING_VERIFICATION', `${pointer}/path`, 'Allowlisted artifact changed while it was being verified.'))
        continue
      }
      const afterFirstFinalFstatCheckpointError = invokeCheckpointSafely(checkpoint, 'afterFirstFinalFstat', pointer)
      if (afterFirstFinalFstatCheckpointError) {
        errors.push(afterFirstFinalFstatCheckpointError)
        continue
      }
      const finalNamespace = snapshotArtifactNamespace(resolvedRoot, segments)
      if (finalNamespace.error
        || !sameArtifactPathSnapshot(before, finalNamespace.snapshot)
        || !sameFileIdentity(finalNamespace.snapshot.leaf, opened)) {
        errors.push(issue('ARTIFACT_PATH_RACE_DETECTED', `${pointer}/path`, 'Allowlisted artifact path changed while it was being verified.'))
        continue
      }
      const beforeFinalDescriptorPathResolutionCheckpointError = invokeCheckpointSafely(checkpoint, 'beforeFinalDescriptorPathResolution', pointer)
      if (beforeFinalDescriptorPathResolutionCheckpointError) {
        errors.push(beforeFinalDescriptorPathResolutionCheckpointError)
        continue
      }
      const finalDescriptorResolution = resolveOpenedDescriptorPath(resolver, descriptor)
      if (finalDescriptorResolution.unavailable) {
        errors.push(issue('DESCRIPTOR_RESOLVER_UNAVAILABLE', `${pointer}/path`, 'Filesystem verification requires a supported descriptor path resolver.'))
        continue
      }
      if (finalDescriptorResolution.failed) {
        errors.push(issue('DESCRIPTOR_PATH_RESOLUTION_FAILED', `${pointer}/path`, 'Opened artifact path could not be resolved.'))
        continue
      }
      let currentRootRealpath
      try {
        currentRootRealpath = fs.realpathSync(resolvedRoot)
      } catch {
        errors.push(issue('ARTIFACT_PATH_RACE_DETECTED', `${pointer}/path`, 'Allowlisted artifact path changed while it was being verified.'))
        continue
      }
      if (currentRootRealpath !== finalNamespace.rootRealpath || !isContainedPath(currentRootRealpath, finalDescriptorResolution.path)) {
        errors.push(issue('ARTIFACT_PATH_RACE_DETECTED', `${pointer}/path`, 'Allowlisted artifact path changed while it was being verified.'))
        continue
      }
      const afterFinalDescriptorPathResolutionCheckpointError = invokeCheckpointSafely(checkpoint, 'afterFinalDescriptorPathResolutionBeforeFinalFstat', pointer)
      if (afterFinalDescriptorPathResolutionCheckpointError) {
        errors.push(afterFinalDescriptorPathResolutionCheckpointError)
        continue
      }
      let finalDescriptor
      try {
        finalDescriptor = fs.fstatSync(descriptor, { bigint: true })
      } catch {
        errors.push(issue('ARTIFACT_MUTATED_DURING_VERIFICATION', `${pointer}/path`, 'Allowlisted artifact changed while it was being verified.'))
        continue
      }
      if (!sameDescriptorMetadata(descriptorMetadataSnapshot(openedMetadata), descriptorMetadataSnapshot(finalDescriptor))
        || !sameDescriptorMetadata(descriptorMetadataSnapshot(firstFinalDescriptor), descriptorMetadataSnapshot(finalDescriptor))
        || finalDescriptor.size !== BigInt(contents.length)) {
        errors.push(issue('ARTIFACT_MUTATED_DURING_VERIFICATION', `${pointer}/path`, 'Allowlisted artifact changed while it was being verified.'))
        continue
      }
      if (errors.length === errorsBeforeArtifact) {
        verifiedArtifacts.push({ artifactIndex: index, sha256: digest, sizeBytes: contents.length, dev: opened.dev, ino: opened.ino })
      }
    } finally {
      if (descriptor !== undefined) {
        try { fs.closeSync(descriptor) } catch {}
      }
    }
  }
  const output = result(errors)
  if (output.valid) {
    output.verificationSemantics = 'descriptor-snapshot'
    output.verifiedArtifacts = verifiedArtifacts
  }
  return output
}

function verifySanitizedExportFiles(value, root, options = {}) {
  const cloned = cloneUntrustedValue(value)
  if (cloned.code) return inputSafetyResult(cloned.code)
  const safeOptions = extractVerificationOptions(options)
  if (safeOptions.code) return inputSafetyResult(safeOptions.code)
  return verifySanitizedExportFilesTrusted(cloned.value, root, safeOptions.value)
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
