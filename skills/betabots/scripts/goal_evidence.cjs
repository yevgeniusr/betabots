const path = require('node:path')

function normalizeEvidence(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function appendGoalEvidence(ledger, observation = {}) {
  if (!Array.isArray(ledger)) return null
  const visibleText = String(observation.text || observation.visibleText || '').trim().slice(0, 4000)
  if (!visibleText) return null

  const entry = {
    phase: String(observation.phase || 'captured screen'),
    url: String(observation.url || ''),
    title: String(observation.title || ''),
    visibleText,
    screenshot: String(observation.screenshot || ''),
  }
  const identity = normalizeEvidence(`${entry.url}\n${entry.title}\n${entry.visibleText}`)
  const existing = ledger.find((candidate) => candidate.identity === identity)
  if (existing) {
    if (entry.screenshot) existing.screenshot = entry.screenshot
    return existing
  }
  const recorded = { ...entry, identity }
  ledger.push(recorded)
  return recorded
}

function buildGoalEvidenceText(ledger, actions = []) {
  const screens = (Array.isArray(ledger) ? ledger : []).map((entry) => [
    entry.phase,
    entry.url,
    entry.title,
    entry.visibleText,
  ].filter(Boolean).join('\n'))
  return [...screens, ...(Array.isArray(actions) ? actions : [])].join('\n')
}

function validateSignalClaims(requiredSignals, claims, evidenceText) {
  const normalizedEvidence = normalizeEvidence(evidenceText)
  const availableClaims = Array.isArray(claims) ? claims : []

  return (Array.isArray(requiredSignals) ? requiredSignals : []).map((signal) => {
    const claim = availableClaims.find(
      (candidate) => normalizeEvidence(candidate?.signal) === normalizeEvidence(signal),
    )
    const citation = normalizeEvidence(claim?.evidence)
    const citationVerified = citation.length >= 8 && normalizedEvidence.includes(citation)
    return {
      signal,
      observed: claim?.observed === true && citationVerified,
      evidence: citationVerified ? String(claim.evidence).trim() : '',
    }
  })
}

function normalizeRecordedScreen(entry = {}, sessionNumber) {
  return {
    sessionNumber,
    phase: String(entry.phase || 'captured screen'),
    url: String(entry.url || ''),
    title: String(entry.title || ''),
    visibleText: String(entry.visibleText || entry.text || '').trim().slice(0, 4000),
    screenshot: String(entry.screenshot || ''),
  }
}

function buildCrossSessionGoalContext({
  previousSessions = [],
  currentScreens = [],
  currentActions = [],
  runDir = '',
} = {}) {
  const priorRecordedUiEvidence = []
  const priorRecordedActions = []

  for (const session of Array.isArray(previousSessions) ? previousSessions : []) {
    const sessionNumber = Number(session?.sessionNumber || 0) || null
    const sessionScreens = Array.isArray(session?.goalScreens)
      ? session.goalScreens
      : Array.isArray(session?.recentScreens) ? session.recentScreens : []
    const sessionActions = Array.isArray(session?.goalActions)
      ? session.goalActions
      : Array.isArray(session?.recentActions) ? session.recentActions : []
    for (const screen of sessionScreens) {
      const normalized = normalizeRecordedScreen(screen, sessionNumber)
      if (normalized.visibleText) priorRecordedUiEvidence.push(normalized)
    }
    for (const action of sessionActions) {
      const value = String(action || '').trim()
      if (value) priorRecordedActions.push({ sessionNumber, action: value })
    }
  }

  const currentRecordedUiEvidence = (Array.isArray(currentScreens) ? currentScreens : [])
    .map((screen) => normalizeRecordedScreen(screen, null))
    .filter((screen) => screen.visibleText)
  const currentRecordedActions = (Array.isArray(currentActions) ? currentActions : [])
    .map((action) => String(action || '').trim())
    .filter(Boolean)
  const allScreens = [...priorRecordedUiEvidence, ...currentRecordedUiEvidence]
  const allActions = [
    ...priorRecordedActions.map(({ sessionNumber, action }) => `Session ${sessionNumber}: ${action}`),
    ...currentRecordedActions.map((action) => `Current session: ${action}`),
  ]
  const screenshotPaths = [...new Set(allScreens
    .map((screen) => screen.screenshot)
    .filter(Boolean)
    .map((screenshot) => (
      path.isAbsolute(screenshot) || !runDir ? screenshot : path.resolve(runDir, screenshot)
    )))]

  return {
    priorRecordedUiEvidence,
    currentRecordedUiEvidence,
    priorRecordedActions,
    currentRecordedActions,
    evidenceText: buildGoalEvidenceText(allScreens, allActions),
    screenshotPaths,
  }
}

function finalizeGoalAssessment({
  requiredSignals = [],
  assessment = {},
  evidenceText = '',
  fallbackReason = 'The recorded UI journey does not prove that the stated goal was completed.',
  priorAchievedAssessment = null,
} = {}) {
  const currentSignalResults = validateSignalClaims(
    requiredSignals,
    assessment.signalResults,
    evidenceText,
  )
  const priorSignalResults = Array.isArray(priorAchievedAssessment?.signalResults)
    ? priorAchievedAssessment.signalResults
    : []
  const signalResults = currentSignalResults.map((result) => {
    if (result.observed) return result
    const prior = priorSignalResults.find((candidate) => (
      normalizeEvidence(candidate?.signal) === normalizeEvidence(result.signal) &&
      candidate?.observed === true &&
      String(candidate?.evidence || '').trim()
    ))
    return prior ? {
      signal: result.signal,
      observed: true,
      evidence: String(prior.evidence).trim(),
    } : result
  })
  const allSignalsObserved = signalResults.length === 0 || signalResults.every((entry) => entry.observed)
  const priorCompletionApplies = priorAchievedAssessment?.achieved === true && allSignalsObserved
  const currentCompletionApplies = assessment.achieved === true && allSignalsObserved
  return {
    achieved: currentCompletionApplies || priorCompletionApplies,
    retainedFromPriorSession: priorCompletionApplies,
    confidence: priorCompletionApplies
      ? Math.max(Number(assessment.confidence || 0), Number(priorAchievedAssessment.confidence || 0))
      : Number(assessment.confidence || 0),
    reason: priorCompletionApplies && !currentCompletionApplies
      ? `Goal was already proven in a prior session: ${String(priorAchievedAssessment.reason || 'the required success signals were completed.')}`
      : String(assessment.reason || fallbackReason),
    signalResults,
  }
}

module.exports = {
  appendGoalEvidence,
  buildCrossSessionGoalContext,
  buildGoalEvidenceText,
  finalizeGoalAssessment,
  validateSignalClaims,
}
