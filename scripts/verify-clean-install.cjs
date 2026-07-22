#!/usr/bin/env node
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const args = new Set(process.argv.slice(2))
const skipBrowserInstall = args.has('--skip-browser-install')
const keepTmp = args.has('--keep-tmp')

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  })
  if (result.status !== 0) {
    const rendered = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${command} ${commandArgs.join(' ')} failed with exit ${result.status}${rendered ? `\n${rendered}` : ''}`)
  }
  return result.stdout
}

function runBuffer(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'buffer',
    maxBuffer: 256 * 1024 * 1024,
    stdio: 'pipe',
  })
  if (result.status !== 0) {
    const rendered = (result.stderr || Buffer.alloc(0)).toString('utf8').trim()
    throw new Error(`${command} ${commandArgs.join(' ')} failed with exit ${result.status}${rendered ? `\n${rendered}` : ''}`)
  }
  return result.stdout
}

function runSmoke(cleanRepo, env) {
  const result = spawnSync('bash', ['tests/smoke.sh'], {
    cwd: cleanRepo,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status === 0) return
  console.error('tests/smoke.sh failed in clean install; rerunning with shell tracing for the failing command.')
  run('bash', ['-x', 'tests/smoke.sh'], {
    cwd: cleanRepo,
    env,
    stdio: 'inherit',
  })
}

function indexedModes(sourceRoot) {
  const modes = new Map()
  const output = run('git', ['ls-files', '--cached', '-s'], { cwd: sourceRoot })
  for (const line of output.split('\n')) {
    const match = line.match(/^(\d+)\s+[0-9a-f]+\s+\d+\t(.+)$/)
    if (match) modes.set(match[2], match[1])
  }
  return modes
}

function copyIndexedFiles(sourceRoot, destinationRoot) {
  const modes = indexedModes(sourceRoot)
  const files = run('git', ['ls-files', '--cached', '-z'], { cwd: sourceRoot })
    .split('\0')
    .filter(Boolean)
  for (const file of files) {
    const destination = path.join(destinationRoot, file)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    const mode = modes.get(file)
    if (mode === '120000') {
      throw new Error(`Refusing to verify clean install with tracked symlink: ${file}`)
    }
    fs.writeFileSync(destination, runBuffer('git', ['show', `:${file}`], { cwd: sourceRoot }))
    fs.chmodSync(destination, mode === '100755' ? 0o755 : 0o644)
  }
}

function nodeBinDirectory() {
  return path.dirname(process.execPath)
}

function isolatedEnv(home) {
  const env = {
    HOME: home,
    PATH: [
      nodeBinDirectory(),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ].join(path.delimiter),
    TMPDIR: os.tmpdir(),
    npm_config_cache: path.join(home, '.npm-cache'),
    npm_config_update_notifier: 'false',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_progress: 'false',
  }
  return env
}

function defaultBrowserCache(home) {
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Caches', 'ms-playwright')
  if (process.platform === 'linux') return path.join(home, '.cache', 'ms-playwright')
  return ''
}

function assertLocalPlaywright(skillDir, env) {
  const packagePath = path.join(skillDir, 'node_modules', 'playwright', 'package.json')
  if (!fs.existsSync(packagePath)) {
    throw new Error(`Installed skill is missing local Playwright runtime: ${packagePath}`)
  }
  run(process.execPath, ['-e', "require('playwright'); console.log('playwright resolved locally')"], {
    cwd: skillDir,
    env: { ...env, NODE_PATH: '' },
  })
}

function assertChromiumLaunch(skillDir, env) {
  run(process.execPath, ['-e', [
    "const { chromium } = require('playwright')",
    "(async () => {",
    "  const browser = await chromium.launch({ headless: true })",
    "  await browser.close()",
    "  console.log('chromium launched locally')",
    "})().catch((error) => { console.error(error.message); process.exit(1) })",
  ].join(';')], {
    cwd: skillDir,
    env: { ...env, NODE_PATH: '' },
    stdio: 'inherit',
  })
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-clean-install-'))
  const cleanRepo = path.join(tempRoot, 'repo')
  const home = path.join(tempRoot, 'home')
  fs.mkdirSync(cleanRepo, { recursive: true })
  fs.mkdirSync(home, { recursive: true })

  try {
    copyIndexedFiles(root, cleanRepo)
    const env = isolatedEnv(home)
    if (skipBrowserInstall) {
      const browserCache = process.env.PLAYWRIGHT_BROWSERS_PATH || defaultBrowserCache(os.homedir())
      if (browserCache && fs.existsSync(browserCache)) {
        env.PLAYWRIGHT_BROWSERS_PATH = browserCache
      } else {
        throw new Error('Chromium browser install was skipped, but no existing Playwright browser cache was found. Omit --skip-browser-install or set PLAYWRIGHT_BROWSERS_PATH.')
      }
    }
    run(process.execPath, ['scripts/install-deps.cjs', '--all'], { cwd: cleanRepo, env, stdio: 'pipe' })
    run(process.execPath, ['scripts/install.cjs', 'all', '--skip-cli'], { cwd: cleanRepo, env, stdio: 'pipe' })

    const installedSkills = [
      path.join(home, 'plugins', 'betabots', 'skills', 'betabots'),
      path.join(home, '.codex', 'skills', 'betabots'),
      path.join(home, '.agents', 'skills', 'betabots'),
      path.join(home, '.claude', 'plugins', 'local', 'betabots', 'skills', 'betabots'),
      path.join(home, '.claude', 'skills', 'betabots'),
      path.join(home, '.cursor', 'plugins', 'betabots', 'skills', 'betabots'),
      path.join(home, '.cursor', 'skills', 'betabots'),
      path.join(home, '.cursor', 'skills-cursor', 'betabots'),
    ]
    for (const skillDir of installedSkills) {
      assertLocalPlaywright(skillDir, env)
    }

    if (!skipBrowserInstall) {
      run(process.execPath, [path.join(home, '.codex', 'skills', 'betabots', 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'], {
        cwd: cleanRepo,
        env,
        stdio: 'inherit',
      })
      assertChromiumLaunch(path.join(home, '.codex', 'skills', 'betabots'), env)
    }

    runSmoke(cleanRepo, { ...env, NODE_PATH: '' })

    console.log('betabots clean install ok')
  } finally {
    if (!keepTmp) {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    } else {
      console.log(`kept temp directory: ${tempRoot}`)
    }
  }
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
