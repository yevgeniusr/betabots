const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  loadPersonaGenerationConfig,
  normalizeGeneratedPersonas,
  normalizeProductAnalysis,
  normalizeSuppliedPersonas,
  personaGenerationFingerprint,
  resolvePersonaSource,
  shouldProceedWithPersonas,
  validateApprovedPersonaArtifact,
} = require('../skills/betabots/scripts/persona_generation.cjs')

function deepPersona(overrides = {}) {
  return {
    name: 'Samira Khan',
    role: 'team lead rebuilding confidence after a failed rollout',
    lifeSituation: 'I lead a distributed team and own the consequences of another tool change.',
    trigger: 'A difficult review exposed that the current workflow is not helping people improve.',
    jobToBeDone: 'Decide whether this can create repeatable practice without embarrassing my team.',
    priorAttempts: ['Weekly peer practice that faded after two sessions.'],
    stakes: ['My credibility with the team.', 'A limited enablement budget.'],
    constraints: ['Thirty minutes per week.', 'No dedicated facilitator.'],
    anxieties: ['The product may feel childish to senior staff.'],
    objections: ['AI feedback may be generic or overconfident.'],
    trustThreshold: 'I need to see specific feedback grounded in something I actually said.',
    decisionCriteria: ['Useful feedback in the first session.', 'Respectful tone.', 'Clear privacy controls.'],
    vocabulary: ['practice loop', 'psychological safety', 'manager overhead'],
    digitalHabits: ['Uses mobile between meetings and desktop for team planning.'],
    socialContext: 'Two skeptical senior teammates influence whether the group adopts anything.',
    successEvidence: ['A completed practice with specific, credible feedback.'],
    abandonmentConditions: ['Mandatory signup before seeing value.', 'Vague praise without evidence.'],
    provenance: {
      observedEvidence: ['The product offers communication practice and feedback.'],
      userGuidance: ['Include team adoption stakes.'],
      assumptions: ['Senior teammates are skeptical.'],
    },
    ...overrides,
  }
}

test('defaults to generated personas with automatic approval', () => {
  const config = loadPersonaGenerationConfig({}, '/tmp/project', '/tmp/run')

  assert.equal(config.approvalMode, 'auto')
  assert.equal(config.approved, false)
  assert.equal(config.guidance, '')
  assert.equal(resolvePersonaSource(config).kind, 'generate')
})

test('loads inline and file guidance and validates approval mode', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-persona-guidance-'))
  const guidanceFile = path.join(temp, 'guidance.md')
  fs.writeFileSync(guidanceFile, 'Prioritize people with workplace speaking stakes.')
  const config = loadPersonaGenerationConfig({
    BETABOT_PERSONA_APPROVAL_MODE: 'required',
    BETABOT_PERSONAS_APPROVED: 'true',
    BETABOT_PERSONA_GUIDANCE: 'Include a skeptical self-directed learner.',
    BETABOT_PERSONA_GUIDANCE_FILE: guidanceFile,
  }, temp, path.join(temp, 'run'))

  assert.equal(config.approvalMode, 'required')
  assert.equal(config.approved, true)
  assert.match(config.guidance, /workplace speaking stakes/)
  assert.match(config.guidance, /skeptical self-directed learner/)
  assert.throws(
    () => loadPersonaGenerationConfig({ BETABOT_PERSONA_APPROVAL_MODE: 'sometimes' }, temp, path.join(temp, 'run')),
    /approval mode/i,
  )
})

test('resolves cohort, supplied persona, approved artifact, then generation precedence', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-persona-source-'))
  const cohortFile = path.join(temp, 'cohort.json')
  const personasFile = path.join(temp, 'personas.json')
  const runDir = path.join(temp, 'run')
  fs.mkdirSync(runDir)
  fs.writeFileSync(cohortFile, JSON.stringify({ roles: [{ role: 'legacy' }] }))
  fs.writeFileSync(personasFile, JSON.stringify({ personas: [deepPersona()] }))
  fs.writeFileSync(path.join(runDir, 'generated-personas.json'), JSON.stringify({ personas: [deepPersona()] }))

  assert.equal(resolvePersonaSource(loadPersonaGenerationConfig({
    BETABOT_COHORT_FILE: cohortFile,
    BETABOT_PERSONAS_FILE: personasFile,
    BETABOT_PERSONAS_APPROVED: 'true',
  }, temp, runDir)).kind, 'cohort')
  assert.equal(resolvePersonaSource(loadPersonaGenerationConfig({
    BETABOT_PERSONAS_FILE: personasFile,
    BETABOT_PERSONAS_APPROVED: 'true',
  }, temp, runDir)).kind, 'supplied')
  assert.equal(resolvePersonaSource(loadPersonaGenerationConfig({
    BETABOT_PERSONAS_APPROVED: 'true',
  }, temp, runDir)).kind, 'approved-generated')
})

test('normalizes legacy supplied personas and labels inferred depth', () => {
  const personas = normalizeSuppliedPersonas([{
    name: 'Lee',
    role: 'privacy-sensitive learner',
    past: 'I have been surprised by invasive products before.',
    discovery_circumstance: 'A friend sent me a practice link.',
    goal_today: 'See whether I can practice without exposing private material.',
    lifeGoal: 'Keep control of my identity.',
    technical_comfort: 'low',
    attention_span_minutes: 7,
  }])

  assert.equal(personas[0].jobToBeDone, 'See whether I can practice without exposing private material.')
  assert.equal(personas[0].lifeSituation, 'I have been surprised by invasive products before.')
  assert.equal(personas[0].trigger, 'A friend sent me a practice link.')
  assert.equal(personas[0].technicalComfort, 'low')
  assert.equal(personas[0].attentionSpanMinutes, 7)
  assert.equal(personas[0].provenance.source, 'supplied')
  assert.ok(personas[0].provenance.assumptions.length > 0)
})

test('requires complete, exact-count generated personas', () => {
  const personas = normalizeGeneratedPersonas({ personas: [deepPersona()] }, 1)

  assert.equal(personas.length, 1)
  assert.equal(personas[0].role, 'team lead rebuilding confidence after a failed rollout')
  assert.throws(() => normalizeGeneratedPersonas({ personas: [deepPersona()] }, 2), /exactly 2/i)
  assert.throws(
    () => normalizeGeneratedPersonas({ personas: [deepPersona({ trustThreshold: '' })] }, 1),
    /trustThreshold/i,
  )
  assert.throws(
    () => normalizeGeneratedPersonas({ personas: [deepPersona({ provenance: {} })] }, 1),
    /observedEvidence/i,
  )
  assert.throws(
    () => normalizeGeneratedPersonas({ personas: [deepPersona({
      provenance: { observedEvidence: [], userGuidance: [], assumptions: [] },
    })] }, 1),
    /observedEvidence/i,
  )
  assert.throws(
    () => normalizeGeneratedPersonas({ personas: [deepPersona()] }, 1, {
      productEvidence: ['A different visible claim.'],
    }),
    /product analysis evidence/i,
  )
  assert.throws(
    () => normalizeGeneratedPersonas({ personas: [deepPersona()] }, 1, {
      userGuidance: ['Include procurement constraints.'],
    }),
    /actual user guidance/i,
  )
  assert.throws(
    () => normalizeGeneratedPersonas({ personas: [deepPersona()] }, 1, {
      userGuidance: [],
    }),
    /actual user guidance/i,
  )
})

test('requires substantive visible product analysis', () => {
  assert.throws(() => normalizeProductAnalysis({}), /productName/i)
  assert.throws(() => normalizeProductAnalysis({
    productName: 'Fixture',
    category: 'tool',
    visibleValueProposition: 'Helps a user continue.',
    primaryWorkflows: ['Continue through the flow.'],
    visibleAudienceSignals: ['People evaluating the flow.'],
    evidence: [],
  }), /evidence/i)

  const analysis = normalizeProductAnalysis({
    productName: 'Fixture',
    category: 'tool',
    visibleValueProposition: 'Helps a user continue.',
    primaryWorkflows: ['Continue through the flow.'],
    visibleAudienceSignals: ['People evaluating the flow.'],
    evidence: ['A Continue button is visible.'],
  })
  assert.deepEqual(analysis.evidence, ['A Continue button is visible.'])
  assert.throws(() => normalizeProductAnalysis({ ...analysis, evidence: ['Invented pricing claim.'] }, {
    visibleText: 'Fixture Continue',
    visibleControls: [{ name: 'Continue' }],
  }), /visible interface/i)
})

test('binds approved generated artifacts to their reviewed inputs and analysis', () => {
  const inputs = { appUrl: 'https://example.test', count: 1, guidance: 'Include cautious buyers.' }
  const analysisArtifact = { analysis: { productName: 'Example' }, visibleEvidence: { visibleText: 'Buy carefully.' } }
  const artifact = {
    inputFingerprint: personaGenerationFingerprint(inputs),
    productAnalysisFingerprint: personaGenerationFingerprint(analysisArtifact),
  }

  assert.doesNotThrow(() => validateApprovedPersonaArtifact(artifact, inputs, analysisArtifact))
  assert.throws(
    () => validateApprovedPersonaArtifact(artifact, { ...inputs, guidance: 'Include administrators.' }, analysisArtifact),
    /reviewed inputs/i,
  )
  assert.throws(
    () => validateApprovedPersonaArtifact(artifact, inputs, { ...analysisArtifact, visibleEvidence: { visibleText: 'Changed.' } }),
    /product analysis/i,
  )
})

test('requires review only for unapproved generated personas', () => {
  assert.equal(shouldProceedWithPersonas({ sourceKind: 'generated', approvalMode: 'auto', approved: false }), true)
  assert.equal(shouldProceedWithPersonas({ sourceKind: 'generated', approvalMode: 'required', approved: false }), false)
  assert.equal(shouldProceedWithPersonas({ sourceKind: 'approved-generated', approvalMode: 'required', approved: true }), true)
  assert.equal(shouldProceedWithPersonas({ sourceKind: 'supplied', approvalMode: 'required', approved: false }), true)
})
