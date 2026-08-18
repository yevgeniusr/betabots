/**
 * LLM provider for BETABOT_LLM_PROVIDER=opencode.
 *
 * Spawns the local `opencode` CLI in non-interactive mode and parses its last
 * structured JSON message. Mirrors the spawn pattern used by `codex.cjs`
 * inside the bundle but does not attempt multimodal coverage — opencode's
 * image-injection flags vary by version and CLI mode, so this provider is
 * documented as dev-only / smoke-only.
 *
 * Environment:
 *   BETABOT_OPENCODE_COMMAND – path to the opencode binary (default: opencode).
 *   BETABOT_OPENCODE_MODEL   – the model flag passed with `-m`.
 *   BETABOT_OPENCODE_TIMEOUT_MS – per-call timeout (default 90s).
 *   BETABOT_OPENCODE_FLAGS   – extra flags, space-separated.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function resolveConfig() {
  return {
    command: process.env.BETABOT_OPENCODE_COMMAND || 'opencode',
    model: process.env.BETABOT_OPENCODE_MODEL || '',
    timeoutMs: Number(
      process.env.BETABOT_OPENCODE_TIMEOUT_MS ||
        process.env.BETABOT_LLM_TIMEOUT_MS ||
        90_000,
    ),
    extraFlags: (process.env.BETABOT_OPENCODE_FLAGS || '').trim(),
  }
}

function runProcess(command, args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill('SIGKILL')
      } catch {
        // child already exited
      }
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`${command} exited ${code}: ${stderr || stdout}`))
      }
    })
    child.stdin.end(input)
  })
}

async function callOpencode(prompt, imagePaths = []) {
  void imagePaths
  const cfg = resolveConfig()
  const outputFile = path.join(
    os.tmpdir(),
    `betabots-opencode-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 100000)}.txt`,
  )
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    '--color',
    'never',
    '-o',
    outputFile,
  ]
  if (cfg.model) args.push('-m', cfg.model)
  if (cfg.extraFlags) {
    for (const flag of cfg.extraFlags.split(/\s+/u)) {
      if (flag) args.push(flag)
    }
  }
  args.push('-')
  const result = await runProcess(cfg.command, args, prompt, cfg.timeoutMs)
  if (fs.existsSync(outputFile)) {
    const text = fs.readFileSync(outputFile, 'utf8')
    fs.rmSync(outputFile, { force: true })
    return text
  }
  return result.stdout
}

module.exports = {
  callOpencode,
  resolveConfig,
}
