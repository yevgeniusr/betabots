#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

function isLoopbackCdpEndpoint(endpoint) {
  try {
    const url = new URL(String(endpoint || ''))
    return ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) &&
      ['127.0.0.1', '::1', 'localhost'].includes(url.hostname.toLowerCase()) &&
      !url.username && !url.password
  } catch {
    return false
  }
}

function parseArguments(argv = []) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!['--cdp', '--target-url', '--output'].includes(key)) {
      throw new Error('Usage: --cdp <loopback endpoint> --target-url <authenticated page URL> --output <state JSON path>')
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--') || values[key]) throw new Error(`A single value is required for ${key}.`)
    values[key] = value
    index += 1
  }
  if (!values['--cdp']) throw new Error('--cdp is required.')
  if (!values['--target-url']) throw new Error('--target-url is required.')
  if (!values['--output']) throw new Error('--output is required.')
  if (!isLoopbackCdpEndpoint(values['--cdp'])) throw new Error('CDP endpoint must be a loopback URL without credentials.')
  try {
    new URL(values['--target-url'])
  } catch {
    throw new Error('--target-url must be an absolute URL.')
  }
  return {
    endpoint: values['--cdp'],
    targetUrl: values['--target-url'],
    outputPath: values['--output'],
  }
}

function comparableUrl(value) {
  const url = new URL(value)
  url.hash = ''
  return url.href
}

async function exportStorageStateFromCdp(options = {}) {
  if (!isLoopbackCdpEndpoint(options.endpoint)) throw new Error('CDP endpoint must be a loopback URL without credentials.')
  const targetUrl = comparableUrl(options.targetUrl)
  const outputPath = path.resolve(String(options.outputPath || ''))
  if (!options.outputPath) throw new Error('--output is required.')
  if (fs.existsSync(outputPath)) throw new Error('Refusing to overwrite an existing storage-state output file.')
  const connectOverCDP = options.connectOverCDP || require('playwright').chromium.connectOverCDP
  const browser = await connectOverCDP(options.endpoint)
  try {
    const context = browser.contexts()
      .find((candidate) => candidate.pages().some((page) => {
        try {
          return comparableUrl(page.url()) === targetUrl
        } catch {
          return false
        }
      }))
    if (!context) throw new Error('Requested authenticated target page is not present in the CDP browser.')
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    const temporaryPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`)
    try {
      await context.storageState({ path: temporaryPath, indexedDB: true })
      fs.chmodSync(temporaryPath, 0o600)
      fs.renameSync(temporaryPath, outputPath)
    } finally {
      fs.rmSync(temporaryPath, { force: true })
    }
    return { outputPath }
  } finally {
    await browser.close?.()
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const result = await exportStorageStateFromCdp(options)
  console.log(`Storage state exported to ${result.outputPath}`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = {
  exportStorageStateFromCdp,
  isLoopbackCdpEndpoint,
  parseArguments,
}
