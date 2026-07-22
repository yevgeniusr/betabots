#!/usr/bin/env node
const crypto = require('node:crypto')
const fs = require('node:fs')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)

function hasFlag(name) {
  return args.includes(name)
}

function optionValue(name) {
  const index = args.indexOf(name)
  return index === -1 ? '' : args[index + 1] || ''
}

function fetchBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
        if (redirects > 5) {
          reject(new Error(`too many redirects for ${url}`))
          return
        }
        resolve(fetchBuffer(new URL(response.headers.location, url).toString(), redirects + 1))
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error(`download failed for ${url}: HTTP ${response.statusCode}`))
        return
      }
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

function verifyIntegrity(buffer, integrity, packageName) {
  const [algorithm, expected] = String(integrity || '').split('-')
  if (algorithm !== 'sha512' || !expected) {
    throw new Error(`unsupported integrity for ${packageName}: ${integrity}`)
  }
  const actual = crypto.createHash('sha512').update(buffer).digest('base64')
  if (actual !== expected) {
    throw new Error(`integrity mismatch for ${packageName}`)
  }
}

function packageNameFromKey(key) {
  return key.replace(/^node_modules\//, '')
}

function shouldSkip(entry, options) {
  if (options.omitDev && entry.dev) return true
  if (entry.optional && !options.includeOptional) return true
  if (entry.os && !entry.os.includes(os.platform())) return true
  return false
}

function extractTarball(buffer, destination, packageName) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-package-'))
  const tarball = path.join(tempRoot, 'package.tgz')
  fs.writeFileSync(tarball, buffer)
  fs.mkdirSync(destination, { recursive: true })
  const result = spawnSync('tar', ['-xzf', tarball, '-C', destination, '--strip-components', '1'], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
  fs.rmSync(tempRoot, { recursive: true, force: true })
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`failed to extract ${packageName}${output ? `\n${output}` : ''}`)
  }
}

function linkBins(prefix, packageName, entry) {
  if (!entry.bin) return
  const bins = typeof entry.bin === 'string'
    ? { [path.basename(packageName)]: entry.bin }
    : entry.bin
  const binDir = path.join(prefix, 'node_modules', '.bin')
  fs.mkdirSync(binDir, { recursive: true })
  for (const [name, target] of Object.entries(bins)) {
    const packageTarget = path.join(prefix, 'node_modules', packageName, target)
    if (fs.existsSync(packageTarget)) {
      fs.chmodSync(packageTarget, fs.statSync(packageTarget).mode | 0o111)
    }
    const linkPath = path.join(binDir, name)
    fs.rmSync(linkPath, { force: true })
    const relativeTarget = path.relative(binDir, packageTarget)
    fs.symlinkSync(relativeTarget, linkPath)
  }
}

async function installPrefix(prefix, options) {
  const lockfile = path.join(prefix, 'package-lock.json')
  if (!fs.existsSync(lockfile)) {
    throw new Error(`missing lockfile: ${lockfile}`)
  }
  const lock = JSON.parse(fs.readFileSync(lockfile, 'utf8'))
  const packages = Object.entries(lock.packages || {})
    .filter(([key]) => key)
    .sort(([left], [right]) => left.localeCompare(right))

  fs.rmSync(path.join(prefix, 'node_modules'), { recursive: true, force: true })
  fs.mkdirSync(path.join(prefix, 'node_modules'), { recursive: true })

  for (const [key, entry] of packages) {
    if (shouldSkip(entry, options)) continue
    const packageName = packageNameFromKey(key)
    if (!entry.resolved || !entry.integrity) {
      throw new Error(`lockfile entry for ${packageName} is missing resolved tarball metadata`)
    }
    const destination = path.join(prefix, 'node_modules', packageName)
    const buffer = await fetchBuffer(entry.resolved)
    verifyIntegrity(buffer, entry.integrity, packageName)
    extractTarball(buffer, destination, packageName)
    linkBins(prefix, packageName, entry)
  }
}

async function main() {
  const includeOptional = hasFlag('--include-optional')
  const explicitPrefix = optionValue('--prefix')
  const targets = []

  if (explicitPrefix) {
    targets.push({ prefix: path.resolve(explicitPrefix), omitDev: hasFlag('--omit-dev') })
  } else if (hasFlag('--runtime')) {
    targets.push({ prefix: path.join(root, 'skills', 'betabots'), omitDev: true })
  } else if (hasFlag('--all')) {
    targets.push({ prefix: root, omitDev: false })
    targets.push({ prefix: path.join(root, 'skills', 'betabots'), omitDev: true })
  } else {
    targets.push({ prefix: root, omitDev: false })
  }

  for (const target of targets) {
    await installPrefix(target.prefix, { omitDev: target.omitDev, includeOptional })
    console.log(`installed dependencies: ${path.relative(root, target.prefix) || '.'}`)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
