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
      errors.length === 0
    ) {
      score = Math.min(score, 49)
    }
    if (!goalAssessment || goalAssessment.achieved !== true) {
      score = Math.min(score, 69)
    }
  }

  return clamp(score, 0, 100)
}

module.exports = { scoreSession }
