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
