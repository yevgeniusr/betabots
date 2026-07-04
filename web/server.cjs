#!/usr/bin/env node
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { URL } = require('node:url')

const args = process.argv.slice(2)
const argValue = (name, fallback = '') => {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const port = Number(argValue('--port', process.env.PORT || '3999'))
const projectRoot = path.resolve(__dirname, '..')
const runsRoot = path.resolve(argValue('--runs', process.env.BETABOTS_RUNS_DIR || path.join(process.cwd(), '.betabots', 'runs')))
const staticRoot = path.join(__dirname, 'static')

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body, null, 2))
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(text)
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function readText(file, fallback = '') {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return fallback
  }
}

function readJsonl(file) {
  return readText(file, '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function elapsedSeconds(value = '') {
  const parts = String(value).split(':').map((part) => Number(part))
  if (parts.some((part) => Number.isNaN(part))) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

function sectionLines(rawText, heading) {
  const match = rawText.match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?:\\n## |$)`, 'm'))
  if (!match) return []
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^- /, '').trim())
    .filter((line) => line && line !== 'None')
}

function looksLoading(event) {
  if (event.type !== 'screenshot') return false
  const text = String(event.visibleText || '').trim()
  const title = String(event.title || '').trim()
  if (text.length < 20) return true
  if (/\b(loading|please wait|spinner|skeleton|fetching|initializing)\b/i.test(text)) return true
  if (title && !text) return true
  return false
}

function classifyEvent(event) {
  const label = `${event.text || ''} ${event.label || ''}`
  if (event.type === 'screenshot' && looksLoading(event)) return 'loading-risk'
  if (/betabook/i.test(label)) return 'betabook'
  if (/destiny|hunch|nudge/i.test(label)) return 'destiny'
  if (/llm|reflection|think|thought|reaction|idea|truth|life-cost/i.test(`${event.type || ''} ${label}`)) return 'mind'
  if (/click|navigat|opened|sent|changed|adjusted|created|reserve|save|message/i.test(label)) return 'action'
  if (['screenshot', 'screenshot-error'].includes(event.type)) return 'screen'
  if (['thought', 'reaction', 'idea', 'truth-assessment', 'life-cost'].includes(event.type)) return 'mind'
  return 'log'
}

function evidenceForBot(dir, botId) {
  const events = readJsonl(path.join(dir, 'evidence', `${botId}.jsonl`))
  let previousSeconds = null
  return events.map((event, index) => {
    const seconds = elapsedSeconds(event.elapsed)
    const sincePreviousSeconds = seconds !== null && previousSeconds !== null ? Math.max(0, seconds - previousSeconds) : null
    if (seconds !== null) previousSeconds = seconds
    return {
      index,
      type: event.type || 'log',
      kind: classifyEvent(event),
      at: event.at || '',
      elapsed: event.elapsed || '',
      seconds,
      sincePreviousSeconds,
      label: event.label || '',
      text: event.text || event.label || '',
      screenshot: event.screenshot || '',
      url: event.url || '',
      title: event.title || '',
      screenHash: event.screenHash || '',
      visibleText: event.visibleText || '',
      loadingRisk: looksLoading(event),
    }
  })
}

function actorMatches(value, botId) {
  return value === botId || value === `bot:${botId}` || String(value || '').includes(botId)
}

function betabookForBot(betabook, botId) {
  if (!betabook) return { posts: [], comments: [], invites: [], events: [] }
  return {
    posts: (betabook.posts || []).filter((post) => actorMatches(post.authorId, botId)),
    comments: (betabook.comments || []).filter((comment) => actorMatches(comment.authorId, botId)),
    invites: (betabook.invites || []).filter((invite) => actorMatches(invite.fromBotId, botId) || actorMatches(invite.toBotId, botId)),
    events: (betabook.events || []).filter((event) => actorMatches(event.authorId, botId) || actorMatches(event.fromBotId, botId) || actorMatches(event.toBotId, botId)),
  }
}

function destinyForBot(destiny, botId) {
  if (!destiny) return { events: [], nudges: [], plans: [] }
  return {
    events: (destiny.events || []).filter((event) => actorMatches(event.botId, botId) || actorMatches(event.from, botId) || actorMatches(event.to, botId)),
    nudges: (destiny.nudges || []).filter((nudge) => actorMatches(nudge.botId, botId)),
    plans: (destiny.masterPlan || []).filter((plan) => actorMatches(plan.a, botId) || actorMatches(plan.b, botId)),
  }
}

function summarizeBetabook(betabook, summary = {}) {
  const source = betabook || summary.betabook || {}
  return {
    enabled: Boolean(source.enabled),
    posts: source.posts?.length ?? source.posts ?? 0,
    comments: source.comments?.length ?? source.comments ?? 0,
    invites: source.invites?.length ?? source.invites ?? 0,
    events: source.events?.length ?? source.events ?? 0,
    errors: source.errors?.length ?? source.errors ?? 0,
  }
}

function summarizeDestiny(destiny, summary = {}) {
  const source = destiny || summary.destiny || {}
  return {
    enabled: Boolean(source.enabled),
    masterPlan: source.masterPlan?.length ?? 0,
    events: source.events?.length ?? source.events ?? 0,
    errors: source.errors?.length ?? source.errors ?? 0,
  }
}

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const full = path.join(dir, entry.name)
        return { name: entry.name, full, stat: fs.statSync(full) }
      })
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
  } catch {
    return []
  }
}

function listFiles(dir, predicate = () => true) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

function walkFiles(dir, base = dir, out = []) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, base, out)
    if (entry.isFile()) out.push(path.relative(base, full))
  }
  return out.sort()
}

function safeRunDir(runId) {
  if (!runId || runId.includes('/') || runId.includes('\\') || runId.includes('..')) return null
  const full = path.resolve(runsRoot, runId)
  if (!full.startsWith(`${runsRoot}${path.sep}`)) return null
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) return null
  return full
}

function parseRaw(rawText, file) {
  const lineValue = (label) => {
    const found = rawText.match(new RegExp(`^- ${label}: (.*)$`, 'm'))
    return found ? found[1].trim() : ''
  }
  const truthAssessments = [...rawText.matchAll(/Truth assessment: (.*?)(?: \[screen:|$)/gm)].map((match) => match[1].trim())
  const lifeDecisions = [...rawText.matchAll(/Life-cost decision: (.*?)(?: \[screen:|$)/gm)].map((match) => match[1].trim())
  const ideas = [...rawText.matchAll(/Idea: (.*?)(?: \[screen:|$)/gm)].map((match) => match[1].trim())
  const avatarUrl = lineValue('Avatar')
  return {
    file,
    id: file.replace(/\.md$/, ''),
    name: lineValue('Name'),
    role: lineValue('Role'),
    lifeGoal: lineValue('Life goal'),
    score: Number(lineValue('Happiness score') || 0),
    endReason: lineValue('End reason'),
    returnLikelihood: lineValue('Return likelihood'),
    trustLevel: lineValue('Trust level'),
    valueUnderstood: lineValue('Value understood'),
    avatar: avatarUrl ? {
      provider: 'dicebear',
      url: avatarUrl,
      style: lineValue('Avatar style'),
      seed: lineValue('Avatar seed'),
    } : null,
    actionEvidence: sectionLines(rawText, 'Action Evidence'),
    truthAssessments,
    lifeDecisions,
    ideas,
    raw: rawText,
  }
}

function cohortBotsById(cohort) {
  return new Map((cohort?.bots || []).map((bot) => [bot.id, bot]))
}

function hydrateBotFromCohort(bot, cohortBot) {
  if (!cohortBot) return bot
  return {
    ...cohortBot,
    ...bot,
    name: bot.name || cohortBot.name,
    role: bot.role || cohortBot.role,
    lifeGoal: bot.lifeGoal || cohortBot.lifeGoal,
    avatar: bot.avatar || cohortBot.avatar || null,
  }
}

function enrichBotWithEvidence(dir, bot, betabook = null, destiny = null) {
  const evidenceEvents = evidenceForBot(dir, bot.id)
  const loadingEvents = evidenceEvents.filter((event) => event.loadingRisk)
  const timelineActions = evidenceEvents.filter((event) => event.kind === 'action')
  const firstScreenshot = evidenceEvents.find((event) => event.type === 'screenshot')
  const botBetabook = betabookForBot(betabook, bot.id)
  const botDestiny = destinyForBot(destiny, bot.id)
  return {
    ...bot,
    evidenceEvents,
    loadingEvents,
    timelineActions,
    betabook: botBetabook,
    destiny: botDestiny,
    actionCount: bot.actionEvidence.length || timelineActions.length,
    eventCount: evidenceEvents.length,
    betabookEventCount: botBetabook.posts.length + botBetabook.comments.length + botBetabook.invites.length + botBetabook.events.length,
    destinyEventCount: botDestiny.events.length + botDestiny.nudges.length + botDestiny.plans.length,
    firstScreenshotDelaySeconds: firstScreenshot?.seconds ?? null,
  }
}

function summarizeRun(runId, dir) {
  const summary = readJson(path.join(dir, 'summary.json'), {})
  const cohort = readJson(path.join(dir, 'cohort.json'), {})
  const betabook = readJson(path.join(dir, 'betabook.json'), null)
  const destiny = readJson(path.join(dir, 'destiny.json'), null)
  const cohortBotMap = cohortBotsById(cohort)
  const rawFiles = listFiles(path.join(dir, 'raw'), (name) => name.endsWith('.md'))
  const rawBots = rawFiles
    .map((file) => parseRaw(readText(path.join(dir, 'raw', file)), file))
    .map((bot) => hydrateBotFromCohort(bot, cohortBotMap.get(bot.id)))
    .map((bot) => enrichBotWithEvidence(dir, bot, betabook, destiny))
  const botCount = summary.results?.length || rawBots.length || cohort.bots?.length || 0
  const scores = rawBots.map((bot) => bot.score).filter(Boolean)
  const fallbackCount = summary.llm?.fallbacks || 0
  const legacyTruthPressure = summary[`mortal${'Truth'}`] || {}
  const truthPressure = summary.truthPressure || legacyTruthPressure
  const truthCount = truthPressure.truthAssessments
    ?? truthPressure.truthAuditRiskEvents
    ?? rawBots.reduce((sum, bot) => sum + bot.truthAssessments.length, 0)
  const actions = summary.results?.reduce((sum, result) => sum + (result.actions || 0), 0)
    ?? rawBots.reduce((sum, bot) => sum + bot.actionCount, 0)
  const loadingRisks = rawBots.reduce((sum, bot) => sum + bot.loadingEvents.length, 0)
  return {
    id: runId,
    appName: summary.cohort?.appName || cohort.cohort?.appName || cohort.appName || 'Unknown app',
    updatedAt: fs.statSync(dir).mtime.toISOString(),
    hasSummary: fs.existsSync(path.join(dir, 'summary.json')),
    hasAnalysis: fs.existsSync(path.join(dir, 'analysis.md')),
    bots: botCount,
    happy: summary.happy ?? null,
    unhappy: summary.unhappy ?? null,
    median: summary.median ?? (scores.length ? scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] : null),
    screenshots: summary.results?.reduce((sum, result) => sum + (result.screenshots || 0), 0) || walkFiles(path.join(dir, 'screenshots')).length,
    fallbacks: fallbackCount,
    truthAssessments: truthCount,
    actions,
    loadingRisks,
    betabook: summarizeBetabook(betabook, summary),
    destiny: summarizeDestiny(destiny, summary),
    truthPressure: truthPressure.enabled ?? true,
    llmProvider: summary.llm?.provider || summary.config?.llmProvider || '',
    llm: summary.llm || {},
  }
}

function runDetail(runId, dir) {
  const summary = readJson(path.join(dir, 'summary.json'), {})
  const cohort = readJson(path.join(dir, 'cohort.json'), {})
  const betabook = readJson(path.join(dir, 'betabook.json'), null)
  const destiny = readJson(path.join(dir, 'destiny.json'), null)
  const analysis = readText(path.join(dir, 'analysis.md'), '')
  const rawDir = path.join(dir, 'raw')
  const cohortBotMap = cohortBotsById(cohort)
  const rawBots = listFiles(rawDir, (name) => name.endsWith('.md'))
    .map((file) => parseRaw(readText(path.join(rawDir, file)), file))
    .map((bot) => hydrateBotFromCohort(bot, cohortBotMap.get(bot.id)))
    .map((bot) => enrichBotWithEvidence(dir, bot, betabook, destiny))
  const screenshots = walkFiles(path.join(dir, 'screenshots'))
    .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
  const files = walkFiles(dir).filter((file) => !file.startsWith('screenshots/'))
  return {
    ...summarizeRun(runId, dir),
    summary,
    cohort,
    betabookRaw: betabook,
    destinyRaw: destiny,
    analysis,
    rawBots,
    screenshots,
    files,
  }
}

function serveStatic(reqUrl, res) {
  const pathname = reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname
  const file = path.resolve(staticRoot, `.${pathname}`)
  if (!file.startsWith(`${staticRoot}${path.sep}`)) return sendText(res, 403, 'Forbidden')
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return sendText(res, 404, 'Not found')
  const ext = path.extname(file)
  const type = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
  }[ext] || 'application/octet-stream'
  res.writeHead(200, { 'content-type': type })
  fs.createReadStream(file).pipe(res)
}

function serveRunFile(reqUrl, res) {
  const runId = reqUrl.searchParams.get('run')
  const rel = reqUrl.searchParams.get('path') || ''
  const dir = safeRunDir(runId)
  if (!dir || rel.includes('..')) return sendText(res, 404, 'Not found')
  const file = path.resolve(dir, rel)
  if (!file.startsWith(`${dir}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return sendText(res, 404, 'Not found')
  }
  const ext = path.extname(file).toLowerCase()
  const type = ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.webp' ? 'image/webp'
        : ext === '.json' ? 'application/json; charset=utf-8'
          : 'text/plain; charset=utf-8'
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (reqUrl.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, projectRoot, runsRoot, runCount: listDirs(runsRoot).length })
  }
  if (reqUrl.pathname === '/api/runs') {
    return sendJson(res, 200, { runsRoot, runs: listDirs(runsRoot).map((run) => summarizeRun(run.name, run.full)) })
  }
  if (reqUrl.pathname.startsWith('/api/runs/')) {
    const runId = decodeURIComponent(reqUrl.pathname.replace('/api/runs/', ''))
    const dir = safeRunDir(runId)
    if (!dir) return sendJson(res, 404, { error: 'Run not found' })
    return sendJson(res, 200, runDetail(runId, dir))
  }
  if (reqUrl.pathname === '/api/file') return serveRunFile(reqUrl, res)
  return serveStatic(reqUrl, res)
})

const host = process.env.HOST || '127.0.0.1'

server.listen(port, host, () => {
  console.log(`Betabots dashboard: http://${host}:${port}`)
  console.log(`Reading runs from: ${runsRoot}`)
})
