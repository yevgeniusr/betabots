#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const name = 'betabots'
const args = process.argv.slice(2)
const target = args.find((arg) => !arg.startsWith('-')) || 'all'
const skipCli = args.includes('--skip-cli') || process.env.BETABOTS_INSTALL_SKIP_CLI === 'true'
const home = process.env.HOME

if (!home) {
  console.error('HOME is required so Betabots can choose local agent install directories.')
  process.exit(2)
}

const excludedNames = new Set(['.git', 'node_modules', '.betabots'])
const excludedFiles = new Set(['.env', '.env.local', '.npmrc'])

function isExcluded(relativePath) {
  if (!relativePath) return false
  if (excludedFiles.has(path.basename(relativePath))) return true
  if (/\.log$/i.test(relativePath)) return true
  return relativePath.split(path.sep).some((part) => excludedNames.has(part))
}

function listTrackedFiles(source) {
  const sourceRelative = path.relative(root, source) || '.'
  if (sourceRelative.startsWith('..')) return null
  const result = spawnSync('git', ['-C', root, 'ls-files', '-z', '--', sourceRelative], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
  if (result.status !== 0) return null
  return result.stdout
    .split('\0')
    .filter(Boolean)
    .map((file) => ({
      source: path.join(root, file),
      relative: sourceRelative === '.' ? file : path.relative(sourceRelative, file),
    }))
    .filter((file) => file.relative && !file.relative.startsWith('..') && !isExcluded(file.relative))
}

function copyTrackedTree(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true })
  fs.mkdirSync(destination, { recursive: true })
  const trackedFiles = listTrackedFiles(source)
  if (trackedFiles && trackedFiles.length > 0) {
    for (const file of trackedFiles) {
      const target = path.join(destination, file.relative)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(file.source, target)
      fs.chmodSync(target, fs.statSync(file.source).mode)
    }
    return
  }

  const stack = ['']
  while (stack.length) {
    const relative = stack.pop()
    const currentSource = path.join(source, relative)
    const currentDestination = path.join(destination, relative)
    for (const entry of fs.readdirSync(currentSource, { withFileTypes: true })) {
      const childRelative = path.join(relative, entry.name)
      if (isExcluded(childRelative)) continue
      const childSource = path.join(source, childRelative)
      const childDestination = path.join(destination, childRelative)
      if (entry.isDirectory()) {
        fs.mkdirSync(childDestination, { recursive: true })
        stack.push(childRelative)
      } else if (entry.isSymbolicLink()) {
        fs.mkdirSync(path.dirname(childDestination), { recursive: true })
        fs.symlinkSync(fs.readlinkSync(childSource), childDestination)
      } else if (entry.isFile()) {
        fs.mkdirSync(path.dirname(childDestination), { recursive: true })
        fs.copyFileSync(childSource, childDestination)
        fs.chmodSync(childDestination, fs.statSync(childSource).mode)
      }
    }
  }
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: options.stdio || 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function installRuntimeDeps(skillDir) {
  run(process.execPath, [path.join(root, 'scripts', 'install-deps.cjs'), '--prefix', skillDir, '--omit-dev'])
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

function updateCodexMarketplace() {
  const marketplacePath = path.join(home, '.agents', 'plugins', 'marketplace.json')
  let data
  if (fs.existsSync(marketplacePath)) {
    data = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'))
  } else {
    data = { name: 'personal', interface: { displayName: 'Personal' }, plugins: [] }
  }
  data.plugins = (data.plugins || []).filter((plugin) => plugin.name !== name)
  data.plugins.push({
    name,
    source: { source: 'local', path: './plugins/betabots' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Coding',
  })
  writeJson(marketplacePath, data)
}

function maybeRunCli(command, commandArgs) {
  if (skipCli) return
  const probe = spawnSync('command', ['-v', command], { shell: true, stdio: 'ignore' })
  if (probe.status === 0) {
    spawnSync(command, commandArgs, { stdio: 'ignore' })
  }
}

function copySkill(destination) {
  copyTrackedTree(path.join(root, 'skills', 'betabots'), destination)
  installRuntimeDeps(destination)
}

function copyPlugin(destination) {
  copyTrackedTree(root, destination)
  installRuntimeDeps(path.join(destination, 'skills', 'betabots'))
}

function installCodex() {
  const pluginDir = path.join(home, 'plugins', name)
  copyPlugin(pluginDir)
  updateCodexMarketplace()
  maybeRunCli('codex', ['plugin', 'add', `${name}@personal`])
  copySkill(path.join(home, '.codex', 'skills', name))
  copySkill(path.join(home, '.agents', 'skills', name))
}

function installClaude() {
  const pluginDir = path.join(home, '.claude', 'plugins', 'local', name)
  copyPlugin(pluginDir)
  copySkill(path.join(home, '.claude', 'skills', name))
  maybeRunCli('claude', ['plugin', 'marketplace', 'add', pluginDir])
  maybeRunCli('claude', ['plugin', 'install', `${name}@betabots-dev`, '--scope', 'user'])
}

function installCursor() {
  const pluginDir = path.join(home, '.cursor', 'plugins', name)
  copyPlugin(pluginDir)
  copySkill(path.join(home, '.cursor', 'skills', name))
  copySkill(path.join(home, '.cursor', 'skills-cursor', name))
}

if (!['all', 'codex', 'claude', 'cursor'].includes(target)) {
  console.error(`usage: ${path.relative(process.cwd(), __filename)} [all|codex|claude|cursor] [--skip-cli]`)
  process.exit(2)
}

if (target === 'all' || target === 'codex') installCodex()
if (target === 'all' || target === 'claude') installClaude()
if (target === 'all' || target === 'cursor') installCursor()

console.log(`Installed ${name} locally for ${target}. Restart/new thread required for agents to load updated skills.`)
