function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function scoreSession({
  value,
  trust,
  errors = [],
  stats = {},
  strictScoring = true,
  requiresSocialAction = false,
  destinyEnabled = false,
  destinyMoments = 0,
  betabookEnabled = false,
  betabookMoments = 0,
  elapsedMs = 0,
  minimumSessionMs = 0,
  endedByChoice = false,
  goalAssessment = null,
}) {
  let score = clamp(value + trust - errors.length * 20, 0, 100)

  if (strictScoring) {
    score -= Math.min(35, Number(stats.repeatedScreens || 0) * 2)
    score -= Math.min(50, Number(stats.passes || 0) * 35)
    if (Number(stats.passes || 0) > Number(stats.likes || 0) + 3) {
      score -= Math.min(
        20,
        (Number(stats.passes || 0) - Number(stats.likes || 0) - 3) * 2,
      )
    }
    if (requiresSocialAction && Number(stats.meaningfulSocialActions || 0) === 0) {
      score -= 25
    }
    if (
      Number(stats.loopHelpRequests || 0) > 0 &&
      Number(stats.loopRescuesFollowed || 0) === 0
    ) {
      score -= Math.min(18, Number(stats.loopHelpRequests) * 6)
    }
    score -= Math.min(20, Number(stats.navigationFallbacks || 0) * 3)
    if (destinyEnabled && destinyMoments === 0) score -= 8
    if (betabookEnabled && betabookMoments === 0) score -= 8
    score = clamp(score, 0, 100)

    if (
      minimumSessionMs > 0 &&
      elapsedMs < minimumSessionMs &&
      !endedByChoice &&
      errors.length === 0 &&
      !(
        goalAssessment?.achieved === true &&
        goalAssessment?.retainedFromPriorSession === true
      )
    ) {
      score = Math.min(score, 49)
    }
    if (!goalAssessment || goalAssessment.achieved !== true) {
      score = Math.min(score, 69)
    }
  }

  return clamp(score, 0, 100)
}

function scoreMultiSessionJourney(sessions = [], evidenceAssessment = {}) {
  const recordedSessions = Array.isArray(sessions) ? sessions : []
  const weighted = recordedSessions.reduce((result, session) => {
    const actionWeight = Math.max(0, Number(session?.actions || 0))
    const recordedErrors = Array.isArray(session?.errors) ? session.errors.length : 0
    const browserIssues = Math.max(0, Number(session?.browserIssues || 0))
    const issueWeight = Math.max(recordedErrors, browserIssues)
    const weight = 1 + actionWeight + issueWeight
    result.score += Number(session?.score || 0) * weight
    result.weight += weight
    return result
  }, { score: 0, weight: 0 })
  const average = weighted.weight > 0 ? Math.round(weighted.score / weighted.weight) : 0
  return evidenceAssessment?.met === false ? Math.min(average, 49) : average
}

module.exports = { scoreMultiSessionJourney, scoreSession }
