#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { validateArtifact } = require('../skills/betabots/scripts/study_contracts.cjs')

const args = process.argv.slice(2)
const json = args[0] === '--json'
const files = args.filter((arg) => arg !== '--json')

if (files.length === 0) {
  console.error('Usage: node scripts/validate-study-artifacts.cjs [--json] <artifact.json> [...]')
  process.exitCode = 2
} else {
  const results = files.map((file) => {
    try {
      return { file, ...validateArtifact(JSON.parse(fs.readFileSync(file, 'utf8'))) }
    } catch (error) {
      return {
        file,
        valid: false,
        errors: [{ code: 'INVALID_JSON', path: '', message: error.message }],
      }
    }
  })
  const valid = results.every((result) => result.valid)
  if (json) {
    process.stdout.write(`${JSON.stringify({ valid, results }, null, 2)}\n`)
  } else {
    for (const result of results) {
      console.log(`${result.valid ? 'valid' : 'invalid'} ${path.relative(process.cwd(), result.file) || result.file}`)
      for (const error of result.errors) console.log(`  ${error.code} ${error.path}: ${error.message}`)
    }
  }
  if (!valid) process.exitCode = 1
}
