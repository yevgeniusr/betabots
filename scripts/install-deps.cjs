#!/usr/bin/env node
const fs = require('node:fs')
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

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function npmCiArgs(options) {
  const commandArgs = [
    'ci',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ]
  if (options.omitDev) commandArgs.push('--omit=dev')
  if (!options.includeOptional) commandArgs.push('--omit=optional')
  return commandArgs
}

function installPrefix(prefix, options) {
  const lockfile = path.join(prefix, 'package-lock.json')
  const manifest = path.join(prefix, 'package.json')
  if (!fs.existsSync(lockfile)) {
    throw new Error(`missing lockfile: ${lockfile}`)
  }
  if (!fs.existsSync(manifest)) {
    throw new Error(`missing package manifest: ${manifest}`)
  }

  const command = npmCommand()
  const commandArgs = npmCiArgs(options)
  const result = spawnSync(command, commandArgs, {
    cwd: prefix,
    env: {
      ...process.env,
      npm_config_ignore_scripts: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
    },
    encoding: 'utf8',
    stdio: 'pipe',
  })
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(
      `failed to install dependencies with ${command} ${commandArgs.join(' ')} in ${prefix}${output ? `\n${output}` : ''}`,
    )
  }
}

function targets() {
  const explicitPrefix = optionValue('--prefix')
  if (explicitPrefix) {
    return [{ prefix: path.resolve(explicitPrefix), omitDev: hasFlag('--omit-dev') }]
  }
  if (hasFlag('--runtime')) {
    return [{ prefix: path.join(root, 'skills', 'betabots'), omitDev: true }]
  }
  if (hasFlag('--all')) {
    return [
      { prefix: root, omitDev: false },
      { prefix: path.join(root, 'skills', 'betabots'), omitDev: true },
    ]
  }
  return [{ prefix: root, omitDev: false }]
}

function main() {
  const includeOptional = hasFlag('--include-optional')
  for (const target of targets()) {
    installPrefix(target.prefix, { omitDev: target.omitDev, includeOptional })
    console.log(`installed dependencies: ${path.relative(root, target.prefix) || '.'}`)
  }
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
