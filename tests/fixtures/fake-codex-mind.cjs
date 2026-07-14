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
  if (prompt.includes('task "betabot_reflection"')) {
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
