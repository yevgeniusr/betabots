'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const GENERATED_PERSONAS_FILENAME = 'generated-personas.json'
const PRODUCT_ANALYSIS_FILENAME = 'product-analysis.json'

function text(value, limit = 4000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function list(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean)
  const single = text(value)
  return single ? [single] : []
}

function resolveFile(cwd, value) {
  if (!value) return ''
  return path.resolve(cwd, value)
}

function readOptionalText(file, label) {
  if (!file) return ''
  try {
    return fs.readFileSync(file, 'utf8').trim()
  } catch (error) {
    throw new Error(`${label} could not be read at ${file}: ${error.message}`)
  }
}

function loadPersonaGenerationConfig(env = process.env, cwd = process.cwd(), runDir = '') {
  const approvalMode = text(env.BETABOT_PERSONA_APPROVAL_MODE || 'auto', 30).toLowerCase()
  if (!['auto', 'required'].includes(approvalMode)) {
    throw new Error('BETABOT_PERSONA_APPROVAL_MODE approval mode must be "auto" or "required".')
  }
  const resolvedRunDir = path.resolve(cwd, runDir || env.BETABOT_RUN_DIR || '.betabots/runs/persona-generation')
  const guidanceFile = resolveFile(cwd, env.BETABOT_PERSONA_GUIDANCE_FILE)
  const guidance = [
    readOptionalText(guidanceFile, 'BETABOT_PERSONA_GUIDANCE_FILE'),
    text(env.BETABOT_PERSONA_GUIDANCE, 12000),
  ].filter(Boolean).join('\n\n')

  return {
    approvalMode,
    approved: text(env.BETABOT_PERSONAS_APPROVED, 10).toLowerCase() === 'true',
    cohortFile: resolveFile(cwd, env.BETABOT_COHORT_FILE),
    personasFile: resolveFile(cwd, env.BETABOT_PERSONAS_FILE),
    guidanceFile,
    guidance,
    preflightStorageState: resolveFile(cwd, env.BETABOT_PERSONA_PREFLIGHT_STORAGE_STATE),
    runDir: resolvedRunDir,
    generatedPersonasFile: path.join(resolvedRunDir, GENERATED_PERSONAS_FILENAME),
    productAnalysisFile: path.join(resolvedRunDir, PRODUCT_ANALYSIS_FILENAME),
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
  }
  return value
}

function personaGenerationFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function personaGuidanceEvidence(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => text(line, 4000))
    .filter(Boolean)
}

function validateApprovedPersonaArtifact(document, expectedInputs, productAnalysisDocument) {
  const expectedInputFingerprint = personaGenerationFingerprint(expectedInputs)
  if (!document?.inputFingerprint || document.inputFingerprint !== expectedInputFingerprint) {
    throw new Error('Approved generated personas do not match the reviewed inputs. Regenerate and review them for this app and guidance.')
  }
  const expectedAnalysisFingerprint = personaGenerationFingerprint(productAnalysisDocument)
  if (!document.productAnalysisFingerprint || document.productAnalysisFingerprint !== expectedAnalysisFingerprint) {
    throw new Error('Approved generated personas do not match the reviewed product analysis. Regenerate and review them.')
  }
  return true
}

function resolvePersonaSource(config) {
  if (config.cohortFile) return { kind: 'cohort', file: config.cohortFile, approved: true }
  if (config.personasFile) return { kind: 'supplied', file: config.personasFile, approved: true }
  if (config.approved && fs.existsSync(config.generatedPersonasFile)) {
    return { kind: 'approved-generated', file: config.generatedPersonasFile, approved: true }
  }
  return { kind: 'generate', file: '', approved: false }
}

function loadPersonaDocument(file) {
  let document
  try {
    document = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`Persona file could not be loaded at ${file}: ${error.message}`)
  }
  if (Array.isArray(document)) return { personas: document }
  if (document && Array.isArray(document.personas || document.roles)) {
    return { ...document, personas: document.personas || document.roles }
  }
  throw new Error(`Persona file at ${file} must be an array or contain a personas array.`)
}

function normalizeProvenance(value, source, assumptions = []) {
  const provenance = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    source: text(provenance.source || source, 100),
    observedEvidence: list(provenance.observedEvidence || provenance.observed || provenance.researchBacked),
    userGuidance: list(provenance.userGuidance || provenance.guided),
    assumptions: [...new Set([...list(provenance.assumptions || provenance.assumed), ...assumptions])],
  }
}

function normalizePersona(input = {}, index = 0, source = 'supplied') {
  const assumptions = []
  const lifeSituation = text(input.lifeSituation || input.life_situation || input.past)
  const trigger = text(input.trigger || input.discoveryTrigger || input.discovery || input.discovery_circumstance)
  const jobToBeDone = text(input.jobToBeDone || input.job_to_be_done || input.goal || input.goal_today)
  const priorAttempts = list(input.priorAttempts || input.prior_attempts)
  const stakes = list(input.stakes)
  const constraints = list(input.constraints)
  const anxieties = list(input.anxieties)
  const objections = list(input.objections)
  const trustThreshold = text(input.trustThreshold || input.trust_threshold)
  const decisionCriteria = list(input.decisionCriteria || input.decision_criteria)
  const vocabulary = list(input.vocabulary)
  const digitalHabits = list(input.digitalHabits || input.digital_habits)
  const socialContext = text(input.socialContext || input.social_context)
  const successEvidence = list(input.successEvidence || input.success_evidence || input.successSignals || input.success_signals)
  const abandonmentConditions = list(input.abandonmentConditions || input.abandonment_conditions)

  if (!trigger) assumptions.push('Discovery trigger was not supplied.')
  if (!priorAttempts.length) assumptions.push('Prior attempts were not supplied.')
  if (!stakes.length) assumptions.push('Detailed stakes were not supplied.')
  if (!constraints.length) assumptions.push('Practical constraints were not supplied.')
  if (!anxieties.length) assumptions.push('Anxieties were not supplied.')
  if (!objections.length) assumptions.push('Objections were not supplied.')
  if (!trustThreshold) assumptions.push('Trust threshold was not supplied.')
  if (!decisionCriteria.length) assumptions.push('Decision criteria were not supplied.')
  if (!vocabulary.length) assumptions.push('Persona vocabulary was not supplied.')
  if (!digitalHabits.length) assumptions.push('Digital habits were not supplied.')
  if (!socialContext) assumptions.push('Social context was not supplied.')
  if (!abandonmentConditions.length) assumptions.push('Abandonment conditions were not supplied.')

  const role = text(input.role || input.identity || `persona ${index + 1}`, 500)
  const lifeGoal = text(input.lifeGoal || input.life_goal || stakes[0])
  return {
    ...input,
    name: text(input.name || `Persona ${index + 1}`, 200),
    role,
    identity: text(input.identity || role, 500),
    lifeSituation,
    trigger,
    jobToBeDone,
    priorAttempts,
    stakes,
    constraints,
    anxieties,
    objections,
    trustThreshold,
    decisionCriteria,
    vocabulary,
    digitalHabits,
    socialContext,
    successEvidence,
    abandonmentConditions,
    past: text(input.past || lifeSituation),
    discovery: text(input.discovery || trigger),
    goal: text(input.goal || jobToBeDone),
    lifeGoal,
    successSignals: list(input.successSignals || input.success_signals || successEvidence),
    emotionalBaseline: text(input.emotionalBaseline || input.emotional_baseline),
    technicalComfort: text(input.technicalComfort || input.technical_comfort),
    screenSize: input.screenSize || input.screen_size,
    attentionSpanMinutes: input.attentionSpanMinutes || input.attention_span_minutes,
    provenance: normalizeProvenance(input.provenance, source, assumptions),
  }
}

function normalizeSuppliedPersonas(value) {
  const source = Array.isArray(value) ? value : value?.personas
  if (!Array.isArray(source) || !source.length) throw new Error('At least one supplied persona is required.')
  return source.map((persona, index) => normalizePersona(
    typeof persona === 'string' ? { role: persona } : persona,
    index,
    'supplied',
  ))
}

const REQUIRED_GENERATED_TEXT = [
  'name',
  'role',
  'lifeSituation',
  'trigger',
  'jobToBeDone',
  'trustThreshold',
  'socialContext',
]
const REQUIRED_GENERATED_LISTS = [
  'priorAttempts',
  'stakes',
  'constraints',
  'anxieties',
  'objections',
  'decisionCriteria',
  'vocabulary',
  'digitalHabits',
  'successEvidence',
  'abandonmentConditions',
]

function normalizeGeneratedPersonas(document, count, grounding = {}) {
  const source = Array.isArray(document) ? document : document?.personas
  if (!Array.isArray(source) || source.length !== count) {
    throw new Error(`Persona generation must return exactly ${count} personas.`)
  }
  return source.map((input, index) => {
    for (const field of REQUIRED_GENERATED_TEXT) {
      if (!text(input?.[field])) throw new Error(`Generated persona ${index + 1} requires ${field}.`)
    }
    for (const field of REQUIRED_GENERATED_LISTS) {
      if (!list(input?.[field]).length) throw new Error(`Generated persona ${index + 1} requires ${field}.`)
    }
    const provenance = input?.provenance
    if (!provenance || typeof provenance !== 'object') {
      throw new Error(`Generated persona ${index + 1} requires provenance.`)
    }
    if (!Array.isArray(provenance.observedEvidence) || !list(provenance.observedEvidence).length) {
      throw new Error(`Generated persona ${index + 1} provenance requires observedEvidence.`)
    }
    const allowedEvidence = new Set(list(grounding.productEvidence).map((item) => item.toLowerCase()))
    if (allowedEvidence.size && list(provenance.observedEvidence).some((item) => !allowedEvidence.has(item.toLowerCase()))) {
      throw new Error(`Generated persona ${index + 1} observedEvidence must cite product analysis evidence exactly.`)
    }
    for (const field of ['userGuidance', 'assumptions']) {
      if (!Array.isArray(provenance[field])) {
        throw new Error(`Generated persona ${index + 1} provenance requires ${field} as an array.`)
      }
    }
    if (Object.prototype.hasOwnProperty.call(grounding, 'userGuidance')) {
      const allowedGuidance = new Set(list(grounding.userGuidance).map((item) => item.toLowerCase()))
      if (list(provenance.userGuidance).some((item) => !allowedGuidance.has(item.toLowerCase()))) {
        throw new Error(`Generated persona ${index + 1} userGuidance must cite actual user guidance exactly.`)
      }
    }
    const normalized = normalizePersona(input, index, 'generated')
    normalized.provenance.source = 'generated'
    return normalized
  })
}

function normalizeProductAnalysis(input = {}, visibleEvidence = null) {
  const normalized = {
    productName: text(input.productName, 500),
    category: text(input.category, 500),
    visibleValueProposition: text(input.visibleValueProposition, 2000),
    primaryWorkflows: list(input.primaryWorkflows),
    visibleAudienceSignals: list(input.visibleAudienceSignals),
    trustSignals: list(input.trustSignals),
    frictionRisks: list(input.frictionRisks),
    unknowns: list(input.unknowns),
    evidence: list(input.evidence),
  }
  for (const field of ['productName', 'category', 'visibleValueProposition']) {
    if (!normalized[field]) throw new Error(`Product analysis requires ${field}.`)
  }
  for (const field of ['primaryWorkflows', 'visibleAudienceSignals', 'evidence']) {
    if (!normalized[field].length) throw new Error(`Product analysis requires ${field}.`)
  }
  if (visibleEvidence) {
    const visibleText = [
      text(visibleEvidence.title, 1000),
      text(visibleEvidence.visibleText, 12000),
      ...list(visibleEvidence.visibleControls?.map((control) => control?.name)),
    ].join(' ').toLowerCase()
    for (const evidence of normalized.evidence) {
      if (!visibleText.includes(evidence.toLowerCase())) {
        throw new Error(`Product analysis evidence is not present in the visible interface: ${evidence}`)
      }
    }
  }
  return normalized
}

function shouldProceedWithPersonas({ sourceKind, approvalMode, approved }) {
  if (['cohort', 'supplied'].includes(sourceKind)) return true
  if (sourceKind === 'approved-generated' && approved) return true
  return approvalMode !== 'required'
}

function personaGenerationShape(count) {
  return {
    personas: Array.from({ length: count }, () => ({
      name: 'plausible full name',
      role: 'specific role plus current tension, not a generic segment label',
      identity: 'how this person understands themself in the situation',
      lifeSituation: 'concrete first-person life and work context',
      trigger: 'specific event that caused this visit now',
      jobToBeDone: 'decision or progress sought in this session',
      priorAttempts: ['specific prior behavior or alternative'],
      stakes: ['what becomes better or worse based on this decision'],
      constraints: ['time, money, access, ability, policy, or attention constraint'],
      anxieties: ['private fear or uncertainty'],
      objections: ['reason to distrust or reject this product'],
      trustThreshold: 'evidence required before taking a meaningful risk',
      decisionCriteria: ['criterion used to compare or continue'],
      vocabulary: ['terms this person naturally uses'],
      digitalHabits: ['device, channel, and workflow habit'],
      socialContext: 'people or institutions influencing the decision',
      successEvidence: ['visible evidence that would prove progress'],
      abandonmentConditions: ['specific reason to stop or leave'],
      lifeGoal: 'larger life goal that makes the stakes coherent',
      emotionalBaseline: 'current emotional posture',
      technicalComfort: 'low, medium, or high',
      provenance: {
        observedEvidence: ['claim grounded in visible product evidence'],
        userGuidance: ['claim grounded in user guidance, or none'],
        assumptions: ['explicit speculation that should not be mistaken for research'],
      },
    })),
  }
}

module.exports = {
  GENERATED_PERSONAS_FILENAME,
  PRODUCT_ANALYSIS_FILENAME,
  loadPersonaDocument,
  loadPersonaGenerationConfig,
  normalizeGeneratedPersonas,
  normalizeProductAnalysis,
  normalizeSuppliedPersonas,
  personaGenerationFingerprint,
  personaGuidanceEvidence,
  personaGenerationShape,
  resolvePersonaSource,
  shouldProceedWithPersonas,
  validateApprovedPersonaArtifact,
}
