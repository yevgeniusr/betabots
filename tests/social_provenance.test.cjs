const test = require('node:test')
const assert = require('node:assert/strict')

const {
  hasPersonaLlmProvenance,
  requireLlmSocialText,
} = require('../skills/betabots/scripts/social_provenance.cjs')

test('rejects fallback and empty LLM social text', () => {
  assert.throws(
    () => requireLlmSocialText({ text: 'Hard-coded fallback', _betabotMindFallback: true }),
    /LLM social text unavailable/i,
  )
  assert.throws(() => requireLlmSocialText({ text: '   ' }), /empty social text/i)
})

test('accepts only explicit persona LLM provenance for social writes', () => {
  assert.equal(hasPersonaLlmProvenance({ origin: 'persona-llm', decisionId: 'social-bot-1-1' }), true)
  assert.equal(hasPersonaLlmProvenance({ origin: 'persona-llm' }), false)
  assert.equal(hasPersonaLlmProvenance({ origin: 'deterministic', decisionId: 'social-bot-1-1' }), false)
})
