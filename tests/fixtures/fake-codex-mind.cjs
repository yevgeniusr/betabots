#!/usr/bin/env node
const fs = require('node:fs')

const args = process.argv.slice(2)
const outputIndex = args.indexOf('-o')
const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : ''
let prompt = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { prompt += chunk })
process.stdin.on('end', () => {
  let response
  if (prompt.includes('task "product_analysis"')) {
    response = {
      productName: 'Thinking Body Fixture',
      category: 'interactive product fixture',
      visibleValueProposition: 'A visible action should produce a clear result.',
      primaryWorkflows: ['Use the Continue control and inspect the changed state.'],
      visibleAudienceSignals: ['People who need immediate interface feedback.'],
      trustSignals: ['The main action is plainly labeled.'],
      frictionRisks: ['The initial page does not explain what happens next.'],
      unknowns: ['No pricing or account model is visible.'],
      evidence: ['The page visibly contains a Continue button.']
    }
  } else if (prompt.includes('task "persona_generation"')) {
    const countMatch = prompt.match(/"requestedPersonaCount":\s*(\d+)/)
    const count = Number(countMatch?.[1] || 1)
    response = {
      personas: Array.from({ length: count }, (_, index) => ({
        name: index === 0 ? 'Samira Khan' : `Generated Person ${index + 1}`,
        role: index === 0 ? 'skeptical team lead testing response clarity' : `careful evaluator ${index + 1}`,
        identity: 'I am accountable for choosing tools that do not waste my team\'s attention.',
        lifeSituation: 'I lead a busy team after a previous rollout failed to earn trust.',
        trigger: 'A confusing workflow caused a visible mistake this week.',
        jobToBeDone: 'Prove that one clear action creates an understandable result.',
        priorAttempts: ['I tried documenting the workflow manually.'],
        stakes: ['My credibility with the team.'],
        constraints: ['I have only a few minutes to evaluate this.'],
        anxieties: ['The feedback may be generic or misleading.'],
        objections: ['A simple interface can hide weak results.'],
        trustThreshold: 'I need a visible state change tied directly to my action.',
        decisionCriteria: ['Clear first action.', 'Specific visible result.'],
        vocabulary: ['state change', 'clear next step'],
        digitalHabits: ['I use desktop tools during focused evaluation.'],
        socialContext: 'My skeptical teammates will challenge vague evidence.',
        successEvidence: ['Done: the action changed the product.'],
        abandonmentConditions: ['The main action produces no visible response.'],
        lifeGoal: 'Protect my team from costly, confusing software decisions.',
        emotionalBaseline: 'guarded',
        technicalComfort: 'medium',
        provenance: {
          observedEvidence: ['The page visibly contains a Continue button.'],
          userGuidance: prompt.includes('Prioritize skeptical team adoption decisions.')
            ? ['Prioritize skeptical team adoption decisions.']
            : [],
          assumptions: ['This evaluator is accountable to a skeptical team.']
        }
      }))
    }
  } else if (prompt.includes('task "betabot_reflection"')) {
    if (!args.includes('-i')) process.exit(3)
    response = {
      thought: 'The visible Continue button is the clearest way to test whether this responds.',
      opinion: 'The page is simple enough to try once.',
      idea: 'Idea: show a clear result after the action.',
      truthfulAssessment: 'I only know this works if the status changes after I click.',
      lifeCostJustification: 'One click is worth the small cost because it directly tests my goal.',
      actionReason: 'the button is visible and directly matches my goal',
      action: { type: 'click', targetId: 'control-1', value: '' }
    }
  } else if (prompt.includes('task "betabot_goal_assessment"')) {
    response = {
      achieved: true,
      confidence: 1,
      reason: 'The recorded UI says the action changed the product.',
      signalResults: [{
        signal: 'Done: the action changed the product.',
        observed: true,
        evidence: 'Done: the action changed the product.'
      }]
    }
  } else {
    response = { text: 'Test response.' }
  }
  fs.writeFileSync(outputFile, JSON.stringify(response))
})
