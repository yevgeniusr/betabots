'use strict'

const DEFAULT_PATTERNS = {
  aiChatUrlPatterns: ['/chat', '/assistant', '/tutor', '/coach'],
  aiSubmitControlPatterns: ['send message', 'send', 'reply', 'ask', 'submit message'],
  activityUrlPatterns: ['/verification/quests/', '/activities/', '/activity/', '/simulator/'],
  activityInteractionPatterns: ['continue', 'submit evidence', 'submit answer', 'save response', 'complete scenario'],
  activityCompletionPatterns: ['verification passed', 'knowledge gap found', 'activity completed', 'quest completed', 'scenario complete'],
}

function asNonNegativeInteger(value, label) {
  const number = Number(value ?? 0)
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer.`)
  }
  return number
}

function stringList(value, fallback) {
  if (!Array.isArray(value)) return [...fallback]
  return value.map((item) => String(item)).filter(Boolean)
}

function normalizeEvidenceRequirements(input = {}) {
  return {
    minAiUserTurns: asNonNegativeInteger(input.minAiUserTurns, 'Minimum AI user turns'),
    minCompletedActivities: asNonNegativeInteger(input.minCompletedActivities, 'Minimum completed activities'),
    aiChatUrlPatterns: stringList(input.aiChatUrlPatterns, DEFAULT_PATTERNS.aiChatUrlPatterns),
    aiSubmitControlPatterns: stringList(input.aiSubmitControlPatterns, DEFAULT_PATTERNS.aiSubmitControlPatterns),
    activityUrlPatterns: stringList(input.activityUrlPatterns, DEFAULT_PATTERNS.activityUrlPatterns),
    activityInteractionPatterns: stringList(input.activityInteractionPatterns, DEFAULT_PATTERNS.activityInteractionPatterns),
    activityCompletionPatterns: stringList(input.activityCompletionPatterns, DEFAULT_PATTERNS.activityCompletionPatterns),
  }
}

function mergeEvidenceRequirements(cohortInput = {}, roleInput = {}, runInput = {}) {
  const cohort = normalizeEvidenceRequirements(cohortInput)
  const combined = normalizeEvidenceRequirements({ ...cohortInput, ...roleInput })
  return {
    ...combined,
    minAiUserTurns: Math.max(
      cohort.minAiUserTurns,
      combined.minAiUserTurns,
      asNonNegativeInteger(runInput.minAiUserTurns, 'Run-wide minimum AI user turns'),
    ),
    minCompletedActivities: Math.max(
      cohort.minCompletedActivities,
      combined.minCompletedActivities,
      asNonNegativeInteger(runInput.minCompletedActivities, 'Run-wide minimum completed activities'),
    ),
  }
}

function createEvidenceTracker(requirements = {}) {
  return {
    requirements: normalizeEvidenceRequirements(requirements),
    aiUserTurns: 0,
    activityInteractions: 0,
    completedActivities: 0,
    pendingChatText: '',
    submittedChatTurns: [],
    activityInteractionsByKey: {},
    activityCompletionKeys: [],
  }
}

function canonicalEvidenceUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return `${url.origin}${url.pathname}`.replace(/\/$/, '')
  } catch {
    return String(value || '').split(/[?#]/, 1)[0].replace(/\/$/, '')
  }
}

function patternToRegExp(pattern) {
  const value = String(pattern || '')
  const literal = value.match(/^\/(.*)\/([a-z]*)$/i)
  if (literal) return new RegExp(literal[1], literal[2] || 'i')
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
}

function matchesAny(value, patterns) {
  return patterns.some((pattern) => patternToRegExp(pattern).test(String(value || '')))
}

function normalizedTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function tokenPhraseIndex(haystack, needle) {
  if (!needle.length || haystack.length < needle.length) return -1
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((token, offset) => haystack[index + offset] === token)) return index
  }
  return -1
}

function isSameOrCreatedConversation(observationUrl, submissionUrl) {
  const observation = canonicalEvidenceUrl(observationUrl)
  const submission = canonicalEvidenceUrl(submissionUrl)
  if (observation === submission) return true
  try {
    const observed = new URL(observation)
    const submitted = new URL(submission)
    const submittedPath = submitted.pathname.replace(/\/$/, '')
    return observed.origin === submitted.origin && observed.pathname.startsWith(`${submittedPath}/`)
  } catch {
    return false
  }
}

function hasVisibleResponseAfterSubmission(observation, submission, requirements) {
  const continuedConversation = isSameOrCreatedConversation(observation.url, submission.url)
  const createdConversation = submission.startedOutsideChat && matchesAny(
    observation.url,
    requirements.aiChatUrlPatterns,
  )
  if (!continuedConversation && !createdConversation) return false
  const visibleTokens = normalizedTokens(observation.text)
  const submittedTokens = normalizedTokens(submission.text)
  const submittedIndex = tokenPhraseIndex(visibleTokens, submittedTokens)
  const baselineTokens = new Set(normalizedTokens(submission.beforeText))
  if (submittedIndex < 0) {
    const novelTokens = visibleTokens.filter((token) => !baselineTokens.has(token))
    return novelTokens.length >= 8 && novelTokens.join('').length >= 48
  }
  const responseTokens = visibleTokens
    .slice(submittedIndex + submittedTokens.length)
    .filter((token) => !baselineTokens.has(token))
  return responseTokens.length >= 3 && responseTokens.join('').length >= 12
}

function matchingPatterns(value, patterns) {
  return patterns.filter((pattern) => patternToRegExp(pattern).test(String(value || '')))
}

function recordEvidenceAction(tracker, event = {}) {
  const action = event.action || {}
  const control = event.control || {}
  const requirements = tracker.requirements
  const isChat = matchesAny(event.url, requirements.aiChatUrlPatterns)

  if (
    action.type === 'fill' &&
    ['textbox', 'searchbox', 'input', 'textarea'].includes(String(control.kind || '').toLowerCase()) &&
    String(action.value || '').trim()
  ) {
    tracker.pendingChatText = String(action.value).trim()
  }
  if (
    action.type === 'click' &&
    tracker.pendingChatText &&
    matchesAny(control.name, requirements.aiSubmitControlPatterns)
  ) {
    tracker.submittedChatTurns.push({
      text: tracker.pendingChatText,
      url: canonicalEvidenceUrl(event.url),
      beforeText: String(event.beforeText || ''),
      startedOutsideChat: !isChat,
    })
    tracker.pendingChatText = ''
  }

  const isActivityPage = matchesAny(event.url, requirements.activityUrlPatterns)
  const isActivityControl = matchesAny(control.name, requirements.activityInteractionPatterns)
  if (
    ['click', 'fill', 'select'].includes(action.type) &&
    isActivityPage &&
    isActivityControl &&
    typeof event.beforeText === 'string'
  ) {
    tracker.activityInteractions += 1
    const key = canonicalEvidenceUrl(event.url)
    if (key) tracker.activityInteractionsByKey[key] = {
      baselineCompletionPatterns: matchingPatterns(
        event.beforeText,
        requirements.activityCompletionPatterns,
      ),
    }
  }
  return tracker
}

function recordEvidenceObservation(tracker, observation = {}) {
  const pendingSubmissions = []
  for (const submission of tracker.submittedChatTurns) {
    if (hasVisibleResponseAfterSubmission(observation, submission, tracker.requirements)) tracker.aiUserTurns += 1
    else pendingSubmissions.push(submission)
  }
  tracker.submittedChatTurns = pendingSubmissions
  const isActivityPage = matchesAny(observation.url, tracker.requirements.activityUrlPatterns)
  if (!isActivityPage) return tracker
  const key = canonicalEvidenceUrl(observation.url)
  const interaction = tracker.activityInteractionsByKey[key]
  if (!interaction) return tracker
  const newCompletion = matchingPatterns(
    observation.text,
    tracker.requirements.activityCompletionPatterns,
  ).some((pattern) => !interaction.baselineCompletionPatterns.includes(pattern))
  if (!newCompletion) return tracker
  if (!tracker.activityCompletionKeys.includes(key)) {
    tracker.activityCompletionKeys.push(key)
    tracker.completedActivities += 1
  }
  return tracker
}

function evaluateEvidenceRequirements(tracker) {
  const requirements = tracker.requirements
  const failures = []
  if (tracker.aiUserTurns < requirements.minAiUserTurns) {
    failures.push({
      key: 'aiUserTurns',
      required: requirements.minAiUserTurns,
      observed: tracker.aiUserTurns,
    })
  }
  if (tracker.completedActivities < requirements.minCompletedActivities) {
    failures.push({
      key: 'completedActivities',
      required: requirements.minCompletedActivities,
      observed: tracker.completedActivities,
    })
  }
  return {
    met: failures.length === 0,
    requirements,
    observed: {
      aiUserTurns: tracker.aiUserTurns,
      activityInteractions: tracker.activityInteractions,
      completedActivities: tracker.completedActivities,
    },
    failures,
  }
}

function applyEvidenceAssessmentToScore(score, assessment) {
  return assessment?.met === false ? Math.min(Number(score || 0), 49) : Number(score || 0)
}

module.exports = {
  applyEvidenceAssessmentToScore,
  createEvidenceTracker,
  evaluateEvidenceRequirements,
  mergeEvidenceRequirements,
  normalizeEvidenceRequirements,
  recordEvidenceAction,
  recordEvidenceObservation,
}
