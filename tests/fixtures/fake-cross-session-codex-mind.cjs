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
    const returning = prompt.includes('"sessionNumber": 1')
    response = {
      thought: 'The one visible action advances my two-visit goal.',
      opinion: 'This is a clear next step.',
      idea: 'Idea: preserve proof across visits.',
      truthfulAssessment: 'I will only count what visibly changes.',
      lifeCostJustification: 'One direct action is worth the small cost.',
      actionReason: 'the visible button is the next required step',
      action: { type: 'click', targetId: returning ? 'control-2' : 'control-1', value: '' }
    }
  } else if (prompt.includes('task "betabot_goal_assessment"')) {
    response = {
      achieved: true,
      confidence: 1,
      reason: 'The recorded screens prove both parts of the goal.',
      signalResults: [
        {
          signal: 'Sample verification result inspected',
          observed: true,
          evidence: 'Sample verification result inspected with retained evidence.'
        },
        {
          signal: 'Pilot request opened',
          observed: true,
          evidence: 'Pilot request opened for customer support.'
        }
      ]
    }
  } else {
    response = { text: 'Test response.' }
  }
  fs.writeFileSync(outputFile, JSON.stringify(response))
})
