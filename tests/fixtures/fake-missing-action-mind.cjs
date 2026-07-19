#!/usr/bin/env node
const fs = require('node:fs')

const args = process.argv.slice(2)
const outputIndex = args.indexOf('-o')
const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : ''
let prompt = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { prompt += chunk })
process.stdin.on('end', () => {
  const response = prompt.includes('task "betabot_reflection"')
    ? {
        thought: 'I noticed the page but omitted the required action.',
        opinion: 'This response must be rejected.',
      }
    : {
        achieved: false,
        confidence: 0,
        reason: 'No validated action occurred.',
        signalResults: [],
      }
  fs.writeFileSync(outputFile, JSON.stringify(response))
})
