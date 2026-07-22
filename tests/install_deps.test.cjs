const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  })
}

test('dependency installer uses npm lockfile install with lifecycle scripts disabled', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-install-deps-test-'))
  const project = path.join(tempRoot, 'project')
  const dependency = path.join(tempRoot, 'local-dependency')
  const marker = path.join(tempRoot, 'lifecycle-script-ran')
  fs.mkdirSync(project, { recursive: true })
  fs.mkdirSync(dependency, { recursive: true })
  fs.writeFileSync(path.join(dependency, 'package.json'), JSON.stringify({
    name: 'betabots-local-lifecycle-dependency',
    version: '1.0.0',
    main: 'index.js',
    scripts: {
      install: 'node install.js',
    },
  }, null, 2))
  fs.writeFileSync(path.join(dependency, 'index.js'), 'module.exports = 42\n')
  fs.writeFileSync(
    path.join(dependency, 'install.js'),
    "require('node:fs').writeFileSync(process.env.BETABOTS_LIFECYCLE_MARKER, 'ran')\n",
  )
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
    name: 'betabots-install-deps-fixture',
    version: '1.0.0',
    private: true,
    dependencies: {
      'betabots-local-lifecycle-dependency': `file:${dependency}`,
    },
  }, null, 2))

  const lockResult = run(npmCommand(), ['install', '--package-lock-only', '--ignore-scripts'], { cwd: project })
  assert.equal(lockResult.status, 0, lockResult.stderr || lockResult.stdout)

  const installResult = run(process.execPath, [path.join(root, 'scripts', 'install-deps.cjs'), '--prefix', project], {
    env: {
      ...process.env,
      BETABOTS_LIFECYCLE_MARKER: marker,
      npm_config_cache: path.join(tempRoot, '.npm-cache'),
      npm_config_update_notifier: 'false',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_progress: 'false',
    },
  })

  assert.equal(installResult.status, 0, installResult.stderr || installResult.stdout)
  assert.equal(fs.existsSync(path.join(project, 'node_modules', 'betabots-local-lifecycle-dependency', 'index.js')), true)
  assert.equal(fs.existsSync(marker), false)
})

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}
