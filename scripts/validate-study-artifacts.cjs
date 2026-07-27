#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const {
  SANITIZED_EXPORT_V1,
  validateArtifacts,
  verifySanitizedExportFiles,
} = require('../skills/betabots/scripts/study_contracts.cjs')

const args = process.argv.slice(2)
let json = false
let verifyExportFiles = false
let exportRoot
const files = []
let usageError

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index]
  if (argument === '--json') json = true
  else if (argument === '--verify-export-files') verifyExportFiles = true
  else if (argument === '--export-root') {
    exportRoot = args[index + 1]
    index += 1
    if (!exportRoot) usageError = '--export-root requires a directory.'
  } else files.push(argument)
}

if (files.length === 0) usageError = usageError || 'At least one artifact JSON file is required.'
if (exportRoot && !verifyExportFiles) usageError = usageError || '--export-root requires --verify-export-files.'

function print(output) {
  if (json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
    return
  }
  for (const entry of output.results) {
    console.log(`${entry.valid ? 'valid' : 'invalid'} ${entry.file}`)
    for (const error of entry.errors) console.log(`  ${error.code} ${error.path}: ${error.message}`)
  }
}

if (usageError) {
  const output = { valid: false, results: [{ file: '', valid: false, errors: [{ code: 'USAGE_ERROR', path: '', message: usageError }] }] }
  print(output)
  if (!json) console.error('Usage: node scripts/validate-study-artifacts.cjs [--json] [--verify-export-files [--export-root <directory>]] <artifact.json> [...]')
  process.exitCode = 2
} else {
  const parsed = files.map((file, index) => {
    const label = `input[${index}]`
    try {
      return { index, file, label, value: JSON.parse(fs.readFileSync(file, 'utf8')) }
    } catch {
      return { index, file, label, error: { code: 'INVALID_JSON', path: '', message: 'Input could not be read as JSON.' } }
    }
  })
  const validInputs = parsed.filter((entry) => !entry.error)
  const batch = validateArtifacts(validInputs.map((entry) => entry.value))
  const results = parsed.map((entry) => {
    if (entry.error) return { file: entry.label, valid: false, errors: [entry.error] }
    const batchIndex = validInputs.indexOf(entry)
    const artifactResult = batch.results[batchIndex]
    return { file: entry.label, ...artifactResult }
  })
  if (verifyExportFiles) {
    for (const [index, entry] of parsed.entries()) {
      if (entry.error || entry.value?.schema !== SANITIZED_EXPORT_V1 || !results[index].valid) continue
      const root = exportRoot || path.dirname(path.resolve(entry.file))
      const filesystemResult = verifySanitizedExportFiles(entry.value, root)
      if (!filesystemResult.valid) {
        results[index].valid = false
        results[index].errors.push(...filesystemResult.errors)
      }
    }
  }
  const output = { valid: results.every((entry) => entry.valid), results }
  print(output)
  if (!output.valid) process.exitCode = 1
}
