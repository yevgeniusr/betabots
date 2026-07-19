'use strict'

function cleanText(value, limit = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function requireLlmSocialText(result = {}) {
  if (result._betabotMindFallback) {
    throw new Error(`LLM social text unavailable: ${result._betabotMindError || 'provider fallback'}`)
  }
  const text = cleanText(result.text)
  if (!text) throw new Error('LLM returned empty social text.')
  return text
}

function hasPersonaLlmProvenance(value = {}) {
  return value.origin === 'persona-llm' && Boolean(cleanText(value.decisionId, 200))
}

module.exports = {
  hasPersonaLlmProvenance,
  requireLlmSocialText,
}
