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

function makeInstallerFixture(symlinkTarget) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-install-symlink-test-'))
  const repo = path.join(tempRoot, 'repo')
  const home = path.join(tempRoot, 'home')
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'skills', 'betabots'), { recursive: true })
  fs.mkdirSync(home, { recursive: true })
  fs.copyFileSync(path.join(root, 'scripts', 'install.cjs'), path.join(repo, 'scripts', 'install.cjs'))
  fs.writeFileSync(path.join(repo, 'scripts', 'install-deps.cjs'), '#!/usr/bin/env node\n')
  fs.writeFileSync(path.join(repo, 'skills', 'betabots', 'SKILL.md'), '# Fixture skill\n')
  fs.writeFileSync(path.join(repo, 'skills', 'outside-skill-tree.txt'), 'outside skill tree\n')
  fs.symlinkSync(symlinkTarget, path.join(repo, 'skills', 'betabots', 'unsafe-link'))
  run('git', ['init'], { cwd: repo })
  run('git', ['add', '.'], { cwd: repo })
  return { tempRoot, repo, home }
}

function writeExistingInstall(home, relativeParts) {
  const installDir = path.join(home, ...relativeParts)
  fs.mkdirSync(installDir, { recursive: true })
  fs.writeFileSync(path.join(installDir, 'existing-marker.txt'), 'keep me\n')
  return installDir
}

function assertExistingInstallPreserved(installDir) {
  assert.equal(fs.readFileSync(path.join(installDir, 'existing-marker.txt'), 'utf8'), 'keep me\n')
}

function assertNoInstallerTemps(parent) {
  const names = fs.existsSync(parent) ? fs.readdirSync(parent) : []
  assert.deepEqual(names.filter((name) => name.includes('.betabots-install-')), [])
}

test('local installer rejects tracked symlinks that traverse outside the skill tree', { skip: process.platform === 'win32' }, () => {
  const { repo, home } = makeInstallerFixture('../outside-skill-tree.txt')

  const result = run(process.execPath, ['scripts/install.cjs', 'codex', '--skip-cli'], {
    cwd: repo,
    env: { ...process.env, HOME: home },
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stderr}\n${result.stdout}`, /symlink/i)
  assert.equal(fs.existsSync(path.join(home, '.codex', 'skills', 'betabots', 'unsafe-link')), false)
})

test('local installer preserves an existing plugin install when tracked symlink preflight fails', { skip: process.platform === 'win32' }, () => {
  const { repo, home } = makeInstallerFixture('../outside-skill-tree.txt')
  const pluginDir = writeExistingInstall(home, ['plugins', 'betabots'])

  const result = run(process.execPath, ['scripts/install.cjs', 'codex', '--skip-cli'], {
    cwd: repo,
    env: { ...process.env, HOME: home },
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stderr}\n${result.stdout}`, /symlink/i)
  assertExistingInstallPreserved(pluginDir)
  assert.equal(fs.existsSync(path.join(pluginDir, 'unsafe-link')), false)
  assertNoInstallerTemps(path.dirname(pluginDir))
})

test('local installer rejects tracked absolute symlinks outside the repository', { skip: process.platform === 'win32' }, () => {
  const outside = path.join(os.tmpdir(), 'betabots-outside-target')
  fs.writeFileSync(outside, 'outside\n')
  const { repo, home } = makeInstallerFixture(outside)

  const result = run(process.execPath, ['scripts/install.cjs', 'codex', '--skip-cli'], {
    cwd: repo,
    env: { ...process.env, HOME: home },
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stderr}\n${result.stdout}`, /symlink/i)
  assert.equal(fs.existsSync(path.join(home, '.codex', 'skills', 'betabots', 'unsafe-link')), false)
})

test('local installer preserves an existing plugin install when dependency installation fails', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-install-deps-rollback-test-'))
  const repo = path.join(tempRoot, 'repo')
  const home = path.join(tempRoot, 'home')
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'skills', 'betabots'), { recursive: true })
  fs.mkdirSync(home, { recursive: true })
  fs.copyFileSync(path.join(root, 'scripts', 'install.cjs'), path.join(repo, 'scripts', 'install.cjs'))
  fs.writeFileSync(
    path.join(repo, 'scripts', 'install-deps.cjs'),
    "#!/usr/bin/env node\nconsole.error('fixture dependency install failed')\nprocess.exit(42)\n",
  )
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({
    name: 'betabots-install-rollback-fixture',
    version: '1.0.0',
    private: true,
  }, null, 2))
  fs.writeFileSync(path.join(repo, 'skills', 'betabots', 'SKILL.md'), '# Fixture skill\n')
  fs.writeFileSync(path.join(repo, 'skills', 'betabots', 'package.json'), JSON.stringify({
    name: 'betabots-skill-rollback-fixture',
    version: '1.0.0',
    private: true,
  }, null, 2))
  run('git', ['init'], { cwd: repo })
  run('git', ['add', '.'], { cwd: repo })
  const pluginDir = writeExistingInstall(home, ['plugins', 'betabots'])

  const result = run(process.execPath, ['scripts/install.cjs', 'codex', '--skip-cli'], {
    cwd: repo,
    env: { ...process.env, HOME: home },
  })

  assert.equal(result.status, 42)
  assert.match(`${result.stderr}\n${result.stdout}`, /fixture dependency install failed/)
  assertExistingInstallPreserved(pluginDir)
  assert.equal(fs.existsSync(path.join(pluginDir, 'skills', 'betabots', 'SKILL.md')), false)
  assertNoInstallerTemps(path.dirname(pluginDir))
})
