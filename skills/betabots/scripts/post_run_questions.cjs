#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const os = require('node:os')

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  return fallback
}

const config = {
  runDir: argValue('--run-dir', process.env.BETABOT_RUN_DIR || ''),
  questionsFile: argValue('--questions-file', process.env.BETABOT_POST_RUN_QUESTIONS_FILE || ''),
  questionsJson: process.env.BETABOT_POST_RUN_QUESTIONS || '',
  outputFile: argValue('--out', process.env.BETABOT_POST_RUN_OUTPUT || ''),
  llmProvider: (process.env.BETABOT_LLM_PROVIDER || 'codex').toLowerCase(),
  llmModel: process.env.BETABOT_LLM_MODEL || '',
  llmTimeoutMs: Number(process.env.BETABOT_LLM_TIMEOUT_MS || 120000),
  concurrency: Number(process.env.BETABOT_POST_RUN_CONCURRENCY || 3),
  maxBots: Number(process.env.BETABOT_POST_RUN_MAX_BOTS || 0),
  rawLimit: Number(process.env.BETABOT_POST_RUN_RAW_LIMIT || 14000),
  codexCommand: process.env.BETABOT_CODEX_COMMAND || 'codex',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || process.env.BETABOT_OPENROUTER_API_KEY || '',
  openrouterBaseUrl: (process.env.BETABOT_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  openrouterSiteUrl: process.env.BETABOT_OPENROUTER_SITE_URL || '',
  openrouterAppName: process.env.BETABOT_OPENROUTER_APP_NAME || 'Betabots',
}

function usage() {
  console.error(`Usage:
  BETABOT_RUN_DIR=.betabots/runs/<run> BETABOT_POST_RUN_QUESTIONS='["Question?"]' node post_run_questions.cjs
  node post_run_questions.cjs --run-dir .betabots/runs/<run> --questions-file questions.json

Questions file may be a JSON array of strings, {"questions":[...]}, or plain text with one question per line.`)
}

function validateConfig() {
  if (!config.runDir) {
    usage()
    throw new Error('BETABOT_RUN_DIR or --run-dir is required')
  }
  if (!fs.existsSync(path.join(config.runDir, 'raw'))) {
    throw new Error(`raw session folder not found: ${path.join(config.runDir, 'raw')}`)
  }
  const validProviders = new Set(['codex', 'openrouter'])
  if (!validProviders.has(config.llmProvider)) {
    throw new Error(`Post-run questions require an LLM provider. Use codex or openrouter, not "${config.llmProvider}".`)
  }
}

function readQuestions() {
  let source = config.questionsJson
  if (config.questionsFile) source = fs.readFileSync(config.questionsFile, 'utf8')
  if (!source.trim()) throw new Error('No post-run questions provided')
  try {
    const parsed = JSON.parse(source)
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    if (Array.isArray(parsed.questions)) return parsed.questions.map(String).filter(Boolean)
  } catch {}
  return source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
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
      child.kill('SIGTERM')
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
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
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} exited ${code}: ${stderr || stdout}`))
    })
    child.stdin.end(input)
  })
}

async function callCodex(prompt) {
  const outputFile = path.join(os.tmpdir(), `betabots-postrun-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 100000)}.txt`)
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    '--ignore-rules',
    '--sandbox',
    'read-only',
    '--color',
    'never',
    '-o',
    outputFile,
  ]
  if (config.llmModel) args.push('-m', config.llmModel)
  args.push('-')
  const result = await runProcess(config.codexCommand, args, prompt, config.llmTimeoutMs)
  if (fs.existsSync(outputFile)) {
    const text = fs.readFileSync(outputFile, 'utf8')
    fs.rmSync(outputFile, { force: true })
    return text
  }
  return result.stdout
}

async function callOpenRouter(prompt) {
  if (!config.openrouterApiKey) throw new Error('OPENROUTER_API_KEY or BETABOT_OPENROUTER_API_KEY is required')
  const model = config.llmModel || 'openai/gpt-4.1-mini'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.llmTimeoutMs)
  try {
    const headers = {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      'Content-Type': 'application/json',
    }
    if (config.openrouterSiteUrl) headers['HTTP-Referer'] = config.openrouterSiteUrl
    if (config.openrouterAppName) headers['X-Title'] = config.openrouterAppName
    const response = await fetch(`${config.openrouterBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You answer as a synthetic user from a saved session. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.75,
      }),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${text}`)
    const body = JSON.parse(text)
    return body.choices?.[0]?.message?.content || ''
  } finally {
    clearTimeout(timer)
  }
}

function extractJson(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('empty LLM response')
  try {
    return JSON.parse(trimmed)
  } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return JSON.parse(fenced[1])
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1))
  throw new Error(`could not parse JSON from LLM response: ${trimmed.slice(0, 200)}`)
}

async function llmJson(prompt) {
  const raw = config.llmProvider === 'openrouter'
    ? await callOpenRouter(prompt)
    : await callCodex(prompt)
  return extractJson(raw)
}

function parsePersona(rawText, fallbackId) {
  const get = (label) => {
    const match = rawText.match(new RegExp(`^- ${label}:\\\\s*(.+)$`, 'mi'))
    return match ? match[1].trim() : ''
  }
  return {
    id: fallbackId.replace(/\.md$/, ''),
    name: get('Name'),
    role: get('Role'),
    past: get('Past'),
    discovery: get('Discovery circumstance'),
    goal: get('Goal today'),
    emotionalBaseline: get('Emotional baseline'),
    technicalComfort: get('Technical comfort'),
    endReason: (rawText.match(/^- End reason:\s*(.+)$/mi) || [])[1] || '',
    happinessScore: (rawText.match(/^- Happiness score:\s*(.+)$/mi) || [])[1] || '',
    returnLikelihood: (rawText.match(/^- Return likelihood:\s*(.+)$/mi) || [])[1] || '',
  }
}

function compactRaw(rawText) {
  const persona = rawText.match(/## Persona[\s\S]*?(?=\n## )/)?.[0] || ''
  const journey = rawText.match(/## Raw Journey[\s\S]*?(?=\n## Session End)/)?.[0] || ''
  const sessionEnd = rawText.match(/## Session End[\s\S]*?(?=\n## )/)?.[0] || ''
  const actions = rawText.match(/## Action Evidence[\s\S]*?(?=\n## )/)?.[0] || ''
  const combined = [persona, journey, sessionEnd, actions].filter(Boolean).join('\n\n')
  if (combined.length <= config.rawLimit) return combined
  const head = combined.slice(0, Math.floor(config.rawLimit * 0.55))
  const tail = combined.slice(-Math.floor(config.rawLimit * 0.45))
  return `${head}\n\n[...middle of raw session omitted for token budget...]\n\n${tail}`
}

function promptForBot(persona, rawMemory, questions) {
  return `Return only valid JSON.

You are continuing as the same betabot after the product session. You are not QA and not an analyst.
Use the saved first-person raw journey as your memory of what you saw, clicked, felt, misunderstood, trusted, and disliked.
Answer from your persona's perspective. If a question asks for advice, answer as what you personally would suggest after your visit.
Do not invent pages you did not see. If your memory is incomplete, say what you infer and why.

Persona:
${JSON.stringify(persona, null, 2)}

Questions:
${questions.map((question, index) => `${index + 1}. ${question}`).join('\n')}

Saved session memory:
${rawMemory}

JSON shape:
{
  "botId": "${persona.id}",
  "name": "${persona.name}",
  "role": "${persona.role}",
  "answers": [
    {
      "question": "question text",
      "answer": "first-person answer, concrete and concise",
      "confidence": "high|medium|low",
      "memoryEvidence": ["short references to what I saw or felt"]
    }
  ],
  "overallAdvice": "one concise thing I would change first"
}`
}

async function runPool(items, worker, concurrency) {
  let cursor = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index], index)
    }
  })
  await Promise.all(workers)
}

function writeMarkdown(outputPath, runDir, questions, rows) {
  const lines = [
    '# Betabot Post-Run Questions',
    '',
    `Run: \`${runDir}\``,
    `Bots asked: ${rows.length}`,
    '',
    '## Questions',
    '',
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    '',
    '## Individual Answers',
    '',
  ]
  for (const row of rows) {
    lines.push(`### ${row.botId} — ${row.name || 'Unnamed'} (${row.role || 'unknown role'})`)
    if (row.error) {
      lines.push('', `Error: ${row.error}`, '')
      continue
    }
    for (const answer of row.answers || []) {
      lines.push('', `**${answer.question}**`, '', answer.answer || '', '')
      if (answer.memoryEvidence?.length) lines.push(`Evidence: ${answer.memoryEvidence.join('; ')}`, '')
    }
    if (row.overallAdvice) lines.push(`Overall advice: ${row.overallAdvice}`, '')
  }
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`)
}

async function main() {
  validateConfig()
  const questions = readQuestions()
  const rawDir = path.join(config.runDir, 'raw')
  let files = fs.readdirSync(rawDir).filter((file) => file.endsWith('.md')).sort()
  if (config.maxBots > 0) files = files.slice(0, config.maxBots)
  const outputJson = config.outputFile || path.join(config.runDir, 'post-run-questions.json')
  const outputMd = outputJson.replace(/\.json$/i, '.md')
  const rows = []

  await runPool(files, async (file) => {
    const rawText = fs.readFileSync(path.join(rawDir, file), 'utf8')
    const persona = parsePersona(rawText, file)
    const rawMemory = compactRaw(rawText)
    try {
      const parsed = await llmJson(promptForBot(persona, rawMemory, questions))
      rows.push({ ...parsed, botId: parsed.botId || persona.id, name: parsed.name || persona.name, role: parsed.role || persona.role })
    } catch (error) {
      rows.push({ botId: persona.id, name: persona.name, role: persona.role, error: error.message })
    }
  }, Math.max(1, config.concurrency))

  rows.sort((a, b) => String(a.botId).localeCompare(String(b.botId)))
  const result = {
    runDir: config.runDir,
    questions,
    config: {
      llmProvider: config.llmProvider,
      llmModel: config.llmModel || null,
      concurrency: config.concurrency,
      rawLimit: config.rawLimit,
    },
    asked: rows.length,
    errors: rows.filter((row) => row.error).length,
    rows,
  }
  fs.writeFileSync(outputJson, JSON.stringify(result, null, 2))
  writeMarkdown(outputMd, config.runDir, questions, rows)
  console.log(JSON.stringify({ outputJson, outputMd, asked: rows.length, errors: result.errors }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
