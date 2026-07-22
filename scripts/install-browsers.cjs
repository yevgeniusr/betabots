#!/usr/bin/env node
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const isRuntime = args.includes('--runtime')
const withDeps = args.includes('--with-deps')
const prefixIndex = args.indexOf('--prefix')
const cwd = prefixIndex === -1
  ? (isRuntime ? path.join(root, 'skills', 'betabots') : root)
  : path.resolve(args[prefixIndex + 1] || '.')
const cli = path.join(cwd, 'node_modules', 'playwright', 'cli.js')

if (!require('node:fs').existsSync(cli)) {
  console.error(`Missing Playwright CLI at ${cli}.`)
  console.error('Install dependencies first:')
  console.error(cwd === root ? '  node scripts/install-deps.cjs --all' : `  node scripts/install-deps.cjs --prefix ${cwd} --omit-dev`)
  process.exit(2)
}

const result = spawnSync(process.execPath, [cli, 'install', ...(withDeps ? ['--with-deps'] : []), 'chromium'], {
  cwd,
  stdio: 'inherit',
  env: process.env,
})

if (result.status !== 0) {
  console.error('')
  console.error('Failed to install Playwright Chromium.')
  console.error('Run this command after installing dependencies:')
  console.error(cwd === root ? '  node scripts/install-browsers.cjs' : `  node scripts/install-browsers.cjs --prefix ${cwd}`)
  console.error('On minimal Linux images, run with system dependency installation:')
  console.error(cwd === root ? '  node scripts/install-browsers.cjs --with-deps' : `  node scripts/install-browsers.cjs --prefix ${cwd} --with-deps`)
  console.error('Set BETABOT_BROWSER_EXECUTABLE_PATH to an existing Chrome/Chromium executable to use a system browser instead.')
  process.exit(result.status || 1)
}
