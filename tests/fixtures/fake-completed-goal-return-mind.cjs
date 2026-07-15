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
    const returning = /"previousSessions":\s*\[\s*\{/.test(prompt)
    response = {
      thought: returning ? 'I completed this earlier, so I am leaving now.' : 'I need to complete the visible action.',
      opinion: returning ? 'There is no reason to repeat the action.' : 'The action is clear.',
      idea: 'Idea: retain completed goals across return visits.',
      truthfulAssessment: returning ? 'I am not taking a new action.' : 'I will verify the visible change.',
      lifeCostJustification: returning ? 'Leaving costs no unnecessary action.' : 'One action directly proves my goal.',
      actionReason: returning ? 'the long-term goal was already completed' : 'the visible action proves my goal',
      action: returning
        ? { type: 'leave', targetId: '', value: '' }
        : { type: 'click', targetId: 'control-1', value: '' }
    }
  } else if (prompt.includes('task "betabot_goal_assessment"')) {
    const returning = /"priorSessionUiEvidence":\s*\[\s*\{/.test(prompt)
    response = returning
      ? {
          achieved: false,
          confidence: 0.4,
          reason: 'The return session did not repeat the earlier action.',
          signalResults: []
        }
      : {
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
