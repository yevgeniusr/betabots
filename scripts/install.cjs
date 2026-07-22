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
  return relativePath.split(/[\\/]+/).some((part) => excludedNames.has(part))
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

function assertSafeRelative(relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to install unsafe path ${relativePath}`)
  }
  if (relativePath.split(/[\\/]+/).includes('..')) {
    throw new Error(`Refusing to install path that traverses outside the install root: ${relativePath}`)
  }
}

function assertInsideDirectory(parent, child) {
  const relative = path.relative(parent, child)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to install outside destination: ${child}`)
  }
}

function preflightTrackedTree(source) {
  const trackedFiles = listTrackedFiles(source)
  if (trackedFiles && trackedFiles.length > 0) {
    const entries = []
    for (const file of trackedFiles) {
      assertSafeRelative(file.relative)
      const sourceStat = fs.lstatSync(file.source)
      if (sourceStat.isSymbolicLink()) {
        throw new Error(`Refusing to install symlink ${file.relative}. Betabots local installs copy regular tracked files only.`)
      }
      if (!sourceStat.isFile()) {
        throw new Error(`Refusing to install non-file tracked path ${file.relative}. Betabots local installs copy regular tracked files only.`)
      }
      entries.push({ source: file.source, relative: file.relative, mode: sourceStat.mode })
    }
    return entries
  }

  const entries = []
  const stack = ['']
  while (stack.length) {
    const relative = stack.pop()
    const currentSource = path.join(source, relative)
    for (const entry of fs.readdirSync(currentSource, { withFileTypes: true })) {
      const childRelative = path.join(relative, entry.name)
      if (isExcluded(childRelative)) continue
      assertSafeRelative(childRelative)
      const childSource = path.join(source, childRelative)
      if (entry.isDirectory()) {
        stack.push(childRelative)
      } else if (entry.isSymbolicLink()) {
        throw new Error(`Refusing to install symlink ${childRelative}. Betabots local installs copy regular files only.`)
      } else if (entry.isFile()) {
        const sourceStat = fs.lstatSync(childSource)
        if (sourceStat.isSymbolicLink()) {
          throw new Error(`Refusing to install symlink ${childRelative}. Betabots local installs copy regular files only.`)
        }
        entries.push({ source: childSource, relative: childRelative, mode: sourceStat.mode })
      }
    }
  }
  return entries
}

function copyPreflightedTree(entries, destination) {
  const destinationRoot = path.resolve(destination)
  fs.mkdirSync(destinationRoot, { recursive: true })
  for (const entry of entries) {
    const target = path.resolve(destinationRoot, entry.relative)
    assertInsideDirectory(destinationRoot, target)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(entry.source, target)
    fs.chmodSync(target, entry.mode)
  }
}

function replaceDirectory(staged, destination) {
  const destinationParent = path.dirname(destination)
  const destinationName = path.basename(destination)
  const backup = path.join(destinationParent, `.betabots-install-${destinationName}-backup-${process.pid}-${Date.now()}`)

  if (!fs.existsSync(destination)) {
    fs.renameSync(staged, destination)
    return
  }

  fs.renameSync(destination, backup)
  try {
    fs.renameSync(staged, destination)
  } catch (error) {
    if (!fs.existsSync(destination) && fs.existsSync(backup)) {
      fs.renameSync(backup, destination)
    }
    throw error
  }
  fs.rmSync(backup, { recursive: true, force: true })
}

function installTrackedTree(source, destination, afterCopy) {
  const entries = preflightTrackedTree(source)
  const destinationParent = path.dirname(destination)
  const destinationName = path.basename(destination)
  fs.mkdirSync(destinationParent, { recursive: true })
  let staged = fs.mkdtempSync(path.join(destinationParent, `.betabots-install-${destinationName}-`))
  try {
    copyPreflightedTree(entries, staged)
    afterCopy(staged)
    replaceDirectory(staged, destination)
    staged = null
  } finally {
    if (staged) {
      fs.rmSync(staged, { recursive: true, force: true })
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
    const error = new Error(`${command} ${commandArgs.join(' ')} failed with exit ${result.status || 1}`)
    error.status = result.status || 1
    throw error
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
  installTrackedTree(path.join(root, 'skills', 'betabots'), destination, installRuntimeDeps)
}

function copyPlugin(destination) {
  installTrackedTree(root, destination, (staged) => installRuntimeDeps(path.join(staged, 'skills', 'betabots')))
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

try {
  if (target === 'all' || target === 'codex') installCodex()
  if (target === 'all' || target === 'claude') installClaude()
  if (target === 'all' || target === 'cursor') installCursor()

  console.log(`Installed ${name} locally for ${target}. Restart/new thread required for agents to load updated skills.`)
} catch (error) {
  console.error(error.message)
  process.exit(error.status || 1)
}
