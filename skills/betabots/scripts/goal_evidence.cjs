function normalizeEvidence(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function appendGoalEvidence(ledger, observation = {}) {
  if (!Array.isArray(ledger)) return
  const visibleText = String(observation.text || observation.visibleText || '').trim().slice(0, 4000)
  if (!visibleText) return

  const entry = {
    phase: String(observation.phase || 'captured screen'),
    url: String(observation.url || ''),
    title: String(observation.title || ''),
    visibleText,
  }
  const identity = normalizeEvidence(`${entry.url}\n${entry.title}\n${entry.visibleText}`)
  if (ledger.some((candidate) => candidate.identity === identity)) return
  ledger.push({ ...entry, identity })
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

module.exports = {
  appendGoalEvidence,
  buildGoalEvidenceText,
  validateSignalClaims,
}
