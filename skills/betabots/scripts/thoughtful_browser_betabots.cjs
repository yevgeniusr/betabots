#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { spawn } = require('node:child_process')
const os = require('node:os')

const destinyRequested = String(process.env.BETABOT_DESTINY || 'false') === 'true'
const betabookRequested = destinyRequested || String(process.env.BETABOT_BETABOOK || 'false') === 'true'

const config = {
  appUrl: (process.env.BETABOT_APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  count: Number(process.env.BETABOT_THOUGHTFUL_COUNT || process.env.BETABOT_COUNT || 3),
  minutes: Number(process.env.BETABOT_THOUGHTFUL_MINUTES || 8),
  minMinutes: Number(process.env.BETABOT_THOUGHTFUL_MIN_SESSION_MINUTES || process.env.BETABOT_THOUGHTFUL_MINUTES || 8),
  maxMinutes: Number(process.env.BETABOT_THOUGHTFUL_MAX_SESSION_MINUTES || Math.max(Number(process.env.BETABOT_THOUGHTFUL_MINUTES || 8) + 4, 180)),
  concurrency: Number(process.env.BETABOT_THOUGHTFUL_CONCURRENCY || 1),
  headless: String(process.env.BETABOT_HEADLESS || 'false') === 'true',
  timeScale: Number(process.env.BETABOT_TIME_SCALE || 1),
  seed: Number(process.env.BETABOT_SEED || 20260630),
  authLocalStorageKey: process.env.BETABOT_AUTH_LOCAL_STORAGE_KEY || '',
  authTokenTemplate: process.env.BETABOT_AUTH_TOKEN_TEMPLATE || '',
  cohortFile: process.env.BETABOT_COHORT_FILE || '',
  backendUrl: (process.env.BETABOT_BACKEND_URL || 'http://localhost:3001/api').replace(/\/$/, ''),
  betabookEnabled: betabookRequested,
  destinyEnabled: destinyRequested,
  destinyIntervalMs: Number(process.env.BETABOT_DESTINY_INTERVAL_MS || process.env.BETABOT_THOUGHTFUL_COORDINATION_INTERVAL_MS || 45000),
  strictScoring: String(process.env.BETABOT_STRICT_SCORING || 'true') === 'true',
  loopRepeatThreshold: Number(process.env.BETABOT_LOOP_REPEAT_THRESHOLD || 4),
  curiosityChance: Number(process.env.BETABOT_CURIOSITY_CHANCE || 0.18),
  maxCuriosityActions: Number(process.env.BETABOT_MAX_CURIOSITY_ACTIONS || 8),
  llmProvider: (process.env.BETABOT_LLM_PROVIDER || 'codex').toLowerCase(),
  llmModel: process.env.BETABOT_LLM_MODEL || '',
  llmMaxCalls: Number(process.env.BETABOT_LLM_MAX_CALLS || 500),
  llmTimeoutMs: Number(process.env.BETABOT_LLM_TIMEOUT_MS || 90000),
  codexCommand: process.env.BETABOT_CODEX_COMMAND || 'codex',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || process.env.BETABOT_OPENROUTER_API_KEY || '',
  openrouterBaseUrl: (process.env.BETABOT_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  openrouterSiteUrl: process.env.BETABOT_OPENROUTER_SITE_URL || '',
  openrouterAppName: process.env.BETABOT_OPENROUTER_APP_NAME || 'Betabots',
  runDir: process.env.BETABOT_RUN_DIR || `.betabots/runs/${new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)}-thoughtful`,
}

const defaultCohort = {
  appName: 'the product',
  names: ['Mira', 'Sol', 'Niko', 'Tara', 'Ren', 'Ari', 'Vale', 'June', 'Rook', 'Iris'],
  baselines: ['curious', 'guarded', 'skeptical', 'hopeful', 'impatient', 'playful'],
  discoveries: [
    'A friend mentioned it during a practical problem I was already trying to solve.',
    'I found it while searching for alternatives to a tool that disappointed me.',
    'I saw someone mention it online and wanted to see if it was real.',
    'I am bored with my current workflow and wondering whether this is better.',
    'I need to decide whether this is worth trying before recommending it to anyone else.',
  ],
  roles: [
    {
      role: 'new first-time user',
      past: 'I have the problem this product claims to solve, but I do not know its language or assumptions yet.',
      goal: 'Understand what this is, whether it is for me, and what the first safe step is.',
    },
    {
      role: 'skeptical buyer comparing alternatives',
      past: 'I have tried similar products before and been burned by vague promises, hidden limits, or poor onboarding.',
      goal: 'Find concrete proof, pricing cues, and enough trust to justify spending time or money.',
    },
    {
      role: 'busy operator responsible for outcomes',
      past: 'I manage work that breaks when tools are confusing, unreliable, or require too much manual coordination.',
      goal: 'Decide whether this product reduces operational work without creating new risk.',
    },
    {
      role: 'privacy-sensitive lurker',
      past: 'I have shared too much with products before and now look for privacy, control, and reversibility before engaging.',
      goal: 'See enough value before handing over personal information or committing.',
    },
    {
      role: 'mobile-first impatient user',
      past: 'I usually discover products from my phone and abandon them quickly if the first screen is unclear.',
      goal: 'Complete one meaningful action without needing a desktop or a tutorial.',
      viewport: 'mobile',
      technicalComfort: 'medium',
    },
    {
      role: 'power user seeking depth',
      past: 'I already understand this category and care about speed, shortcuts, integrations, and control.',
      goal: 'Find whether the product has enough depth after the first simple demo.',
      technicalComfort: 'high',
    },
    {
      role: 'team manager evaluating adoption',
      past: 'I need other people to use this too, so unclear onboarding, permissions, or collaboration limits matter.',
      goal: 'Understand whether a team could adopt this without constant hand-holding.',
    },
    {
      role: 'support-seeking user with a live problem',
      past: 'I came here because something in my current workflow is painful today, not because I wanted to browse.',
      goal: 'Find immediate relief, help, or a clear next step before I lose patience.',
    },
    {
      role: 'creator or supplier evaluating marketplace value',
      past: 'I can contribute supply, content, services, or inventory, but only if demand and rules are clear.',
      goal: 'Decide whether this marketplace or platform can bring real demand without wasting effort.',
    },
    {
      role: 'accessibility-conscious user',
      past: 'I have been excluded by products that hide accessibility, safety, language, or comfort details too late.',
      goal: 'Verify whether the product makes constraints and accommodations visible before commitment.',
    },
  ],
  routes: [
    { labels: ['get started', 'start', 'try', 'demo', 'sign up', 'continue'], fallback: '/' },
    { labels: ['features', 'how it works', 'learn more', 'product'], fallback: '/features' },
    { labels: ['pricing', 'plans', 'upgrade'], fallback: '/pricing' },
    { labels: ['dashboard', 'app', 'home', 'browse'], fallback: '/dashboard' },
    { labels: ['profile', 'settings', 'account'], fallback: '/profile' },
    { labels: ['help', 'docs', 'support', 'contact'], fallback: '/help' },
  ],
  keywords: {
    value: ['dashboard', 'results', 'saved', 'created', 'match', 'booking', 'message', 'report', 'invite', 'project', 'workflow'],
    trust: ['privacy', 'security', 'safe', 'verified', 'help', 'support', 'beginner', 'accessible', 'transparent'],
    risk: ['error', 'failed', 'something went wrong', 'not found', 'forbidden', 'unauthorized'],
    empty: ['empty', 'no ', 'nothing yet', 'not available'],
  },
  ideaRules: [
    { when: ['pricing', 'plan'], idea: 'Idea: show pricing, limits, and commitment level before asking me to invest effort.' },
    { when: ['sign in', 'auth', 'account'], idea: 'Idea: explain what I can see before signup and why an account is required.' },
    { when: ['empty', 'no ', 'nothing yet'], idea: 'Idea: when a page is empty, show the next useful action instead of only the empty state.' },
    { when: ['privacy', 'security'], idea: 'Idea: surface privacy and control choices before sensitive actions.' },
    { when: ['help', 'support', 'docs'], idea: 'Idea: keep help close to the moment where users hesitate.' },
  ],
  endings: [
    'completed session and will come back later',
    'understood value but needs more proof or live content',
    'got lost, did not know what to do, and left',
    'felt cautious and left for now',
    'found enough value for one session',
  ],
}

function normalizeList(value, fallback = []) {
  return Array.isArray(value) && value.length ? value : fallback
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function patternFromLabel(label) {
  if (label instanceof RegExp) return label
  if (label && typeof label === 'object' && label.pattern) {
    return new RegExp(label.pattern, label.flags || 'i')
  }
  const text = String(label)
  const regexMatch = text.match(/^\/(.+)\/([a-z]*)$/i)
  if (regexMatch) return new RegExp(regexMatch[1], regexMatch[2] || 'i')
  return new RegExp(escapeRegExp(text), 'i')
}

function normalizeRoutes(routes) {
  return normalizeList(routes, defaultCohort.routes).map((route) => ({
    labels: normalizeList(route.labels, []).map(patternFromLabel),
    fallback: route.fallback || '/',
  }))
}

function loadCohortConfig() {
  let override = {}
  let source = 'built-in generic default'
  if (config.cohortFile) {
    const file = path.resolve(process.cwd(), config.cohortFile)
    override = JSON.parse(fs.readFileSync(file, 'utf8'))
    source = file
  }

  const cohort = {
    appName: override.appName || defaultCohort.appName,
    names: normalizeList(override.names, defaultCohort.names),
    baselines: normalizeList(override.baselines, defaultCohort.baselines),
    discoveries: normalizeList(override.discoveries, defaultCohort.discoveries),
    roles: normalizeList(override.roles || override.personas, defaultCohort.roles),
    routes: normalizeRoutes(override.routes || defaultCohort.routes),
    keywords: { ...defaultCohort.keywords, ...(override.keywords || {}) },
    ideaRules: normalizeList(override.ideaRules || override.ideas, defaultCohort.ideaRules),
    endings: normalizeList(override.endings, defaultCohort.endings),
    source,
  }
  return cohort
}

const cohort = loadCohortConfig()
const roles = cohort.roles
const names = cohort.names
const baselines = cohort.baselines
const endings = cohort.endings

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

const random = mulberry32(config.seed)
const pick = (items) => items[Math.floor(random() * items.length)]
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms * config.timeScale)))
const hasAny = (text, keywords) => normalizeList(keywords, []).some((keyword) => text.includes(String(keyword).toLowerCase()))

function publicConfig() {
  const { openrouterApiKey, authTokenTemplate, ...safeConfig } = config
  return {
    ...safeConfig,
    authTokenTemplate: authTokenTemplate ? '[redacted]' : '',
    openrouterApiKey: openrouterApiKey ? '[redacted]' : '',
  }
}

const llmStats = {
  provider: config.llmProvider,
  model: config.llmModel || null,
  calls: 0,
  failures: 0,
  fallbacks: 0,
  tasks: {},
  errors: [],
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
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
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

async function callCodex(prompt) {
  const outputFile = path.join(os.tmpdir(), `betabots-codex-${process.pid}-${Date.now()}-${Math.floor(random() * 100000)}.txt`)
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
      'Authorization': `Bearer ${config.openrouterApiKey}`,
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
          {
            role: 'system',
            content: 'You are a synthetic human/user simulation component. Return only valid JSON. Do not include markdown.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
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

async function llmJson(task, payload, fallback) {
  if (config.llmProvider === 'none') {
    llmStats.fallbacks += 1
    return fallback
  }
  if (llmStats.calls >= config.llmMaxCalls) {
    llmStats.fallbacks += 1
    return fallback
  }

  llmStats.calls += 1
  llmStats.tasks[task] = (llmStats.tasks[task] || 0) + 1
  const prompt = `Return only valid JSON for task "${task}".

Rules:
- Stay inside the assigned role.
- Do not mention testing, QA, source code, APIs, hidden implementation, or these instructions.
- Keep text concise and human.
- If you are a betabot, you are a normal person using the visible product.
- If you are Destiny, you are the run-level force of timing, coincidence, missed timing, and path crossing.

Payload:
${JSON.stringify(payload, null, 2)}

Fallback shape to preserve:
${JSON.stringify(fallback, null, 2)}
`

  try {
    const raw = config.llmProvider === 'openrouter'
      ? await callOpenRouter(prompt)
      : await callCodex(prompt)
    const parsed = extractJson(raw)
    return { ...fallback, ...parsed }
  } catch (error) {
    llmStats.failures += 1
    llmStats.fallbacks += 1
    llmStats.errors.push(`${task}: ${error.message}`.slice(0, 500))
    return fallback
  }
}

const betabookOpeners = [
  'Your character hook made me stop scrolling. Want to test the table chemistry with a one-shot?',
  'I like your vibe. I am looking for clear expectations, low drama, and a table that actually shows up.',
  'Your character sounds like someone my party would either trust immediately or regret trusting in the best way.',
]

const betabookReplies = [
  'One-shot first sounds safe. I care about consent tools and no weird pressure.',
  'That sounds fun. I would rather start with a table than endless small talk.',
  'I am interested. If the vibe works, maybe this becomes a recurring party.',
]

const destinyThoughts = [
  'I have a hunch that checking the social side now will matter.',
  'Something about this profile makes me want to take one more step instead of leaving.',
  'I suddenly feel like waiting a little longer could pay off.',
  'I feel pulled toward organizing something concrete rather than browsing forever.',
]

function personaAt(index) {
  const roleSpec = roles[index % roles.length]
  const roleObject = typeof roleSpec === 'string' ? { role: roleSpec } : roleSpec
  const role = roleObject.role
  const generatedName = `${names[index % names.length]} ${Math.floor(index / names.length) + 1}`
  const technicalComfort = roleObject.technicalComfort || pick(['low', 'medium', 'high'])
  const configuredMinutes = Number(roleObject.attentionSpanMinutes || roleObject.durationMinutes || 0)
  return {
    id: `thoughtful-betabot-${String(index + 1).padStart(3, '0')}`,
    name: roleObject.name || generatedName,
    role,
    past: roleObject.past || pastFor(role),
    discovery: roleObject.discovery || pick(cohort.discoveries),
    goal: roleObject.goal || goalFor(role),
    emotionalBaseline: roleObject.emotionalBaseline || pick(baselines),
    technicalComfort,
    traits: roleObject.traits || [],
    viewport: roleObject.viewport || (role.toLowerCase().includes('mobile') ? 'mobile' : 'desktop'),
    attentionSpanMinutes: configuredMinutes || clamp(config.minutes + Math.round((random() - 0.5) * 4), config.minMinutes, config.maxMinutes),
  }
}

function pastFor(role) {
  const lower = role.toLowerCase()
  if (lower.includes('buyer') || lower.includes('manager')) return 'I am responsible for a decision and need confidence before I spend time, money, or political capital.'
  if (lower.includes('operator') || lower.includes('admin')) return 'I deal with practical work every day and notice quickly when a tool creates extra coordination.'
  if (lower.includes('privacy')) return 'I have had bad experiences with products asking for too much too early, so I look for control first.'
  if (lower.includes('mobile')) return 'I am on my phone between other tasks and will leave if the first few steps feel heavy.'
  if (lower.includes('creator') || lower.includes('supplier')) return 'I can bring supply or content, but only if demand, rules, and setup effort are clear.'
  if (lower.includes('accessibility')) return 'I need constraints, accommodations, and expectations to be visible before I can trust the product.'
  return 'I have a real-world problem this product might solve, but I am not yet sure whether it understands my situation.'
}

function goalFor(role) {
  const lower = role.toLowerCase()
  if (lower.includes('buyer') || lower.includes('manager')) return 'Decide whether this is credible enough to recommend or pay for.'
  if (lower.includes('operator') || lower.includes('admin')) return 'Check whether the product makes an operational task simpler and safer.'
  if (lower.includes('privacy')) return 'Understand whether I can get value without oversharing.'
  if (lower.includes('mobile')) return 'Complete one meaningful action from my phone.'
  if (lower.includes('creator') || lower.includes('supplier')) return 'Decide whether contributing supply or content would be worth the effort.'
  if (lower.includes('accessibility')) return 'Verify whether important constraints and accommodations are visible early.'
  return 'Figure out whether this is worth returning to later.'
}

async function requirePlaywright() {
  const localRequire = createRequire(path.join(process.cwd(), 'package.json'))
  const attempts = [
    () => require('playwright'),
    () => require('@playwright/test'),
    () => localRequire('playwright'),
    () => localRequire('@playwright/test'),
  ]
  for (const attempt of attempts) {
    try {
      return attempt()
    } catch {}
  }

  console.error('Playwright is required for thoughtful mode. Install it in the target project or run: npm install -D playwright')
  process.exit(2)
}

function mkdirs() {
  fs.mkdirSync(path.join(config.runDir, 'raw'), { recursive: true })
  fs.mkdirSync(path.join(config.runDir, 'screenshots'), { recursive: true })
}

function elapsed(startedAt) {
  const seconds = Math.round((Date.now() - startedAt) / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function firstVisibleText(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 700)
}

function safeTokenPart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '-')
}

function authTokenFor(bot) {
  if (!config.authTokenTemplate) return ''
  return config.authTokenTemplate
    .replaceAll('{id}', safeTokenPart(bot.id))
    .replaceAll('{name}', safeTokenPart(bot.name.toLowerCase()))
    .replaceAll('{role}', safeTokenPart(bot.role.toLowerCase()))
}

async function api(bot, endpoint, options = {}) {
  const token = authTokenFor(bot)
  if (!token) throw new Error('Destiny API actions require BETABOT_AUTH_TOKEN_TEMPLATE')
  const response = await fetch(`${config.backendUrl}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${endpoint} failed ${response.status}: ${text}`)
  return body
}

async function optionalDestiny(state, label, fn) {
  try {
    return await fn()
  } catch (error) {
    state.errors.push(`${label}: ${error.message}`)
    return null
  }
}

function nowIso() {
  return new Date().toISOString()
}

function createBetabookState(bots) {
  return {
    enabled: config.betabookEnabled,
    scope: config.runDir,
    channels: ['introductions', 'looking-for-party', 'help', 'invites', 'missed-connections', 'venue-requests', 'table-talk'],
    participants: bots.map((bot) => ({ id: bot.id, name: bot.name, role: bot.role })),
    posts: [],
    comments: [],
    invites: [],
    events: [],
    errors: [],
  }
}

function writeBetabookState(state) {
  if (!state?.enabled) return
  fs.writeFileSync(path.join(config.runDir, 'betabook.json'), JSON.stringify(state, null, 2))
}

function betabookPost(state, input) {
  if (!state?.enabled) return null
  const post = {
    id: `post-${String(state.posts.length + 1).padStart(4, '0')}`,
    at: nowIso(),
    channel: input.channel || 'table-talk',
    authorId: input.authorId || 'destiny',
    title: input.title || 'Untitled',
    body: input.body || '',
    tags: input.tags || [],
    score: 1,
  }
  state.posts.push(post)
  state.events.push({ type: 'post_created', postId: post.id, authorId: post.authorId, channel: post.channel, at: post.at })
  writeBetabookState(state)
  return post
}

function betabookComment(state, input) {
  if (!state?.enabled || !input.postId) return null
  const comment = {
    id: `comment-${String(state.comments.length + 1).padStart(4, '0')}`,
    at: nowIso(),
    postId: input.postId,
    authorId: input.authorId,
    body: input.body || '',
  }
  state.comments.push(comment)
  state.events.push({ type: 'comment_created', commentId: comment.id, postId: comment.postId, authorId: comment.authorId, at: comment.at })
  writeBetabookState(state)
  return comment
}

function betabookInvite(state, input) {
  if (!state?.enabled) return null
  const invite = {
    id: `invite-${String(state.invites.length + 1).padStart(4, '0')}`,
    at: nowIso(),
    fromBotId: input.fromBotId || 'destiny',
    toBotId: input.toBotId,
    kind: input.kind || 'cross_paths',
    message: input.message || '',
    status: 'pending',
    postId: input.postId || null,
  }
  state.invites.push(invite)
  state.events.push({ type: 'invite_created', inviteId: invite.id, fromBotId: invite.fromBotId, toBotId: invite.toBotId, at: invite.at })
  writeBetabookState(state)
  return invite
}

function betabookDigestForBot(state, bot) {
  if (!state?.enabled) return { posts: [], invites: [] }
  return {
    posts: state.posts.filter((post) => post.authorId !== bot.id).slice(-3),
    invites: state.invites.filter((invite) => invite.toBotId === bot.id && invite.status === 'pending').slice(-3),
  }
}

function acknowledgeBetabookInvites(state, bot, log) {
  if (!state?.enabled) return 0
  let acknowledged = 0
  for (const invite of state.invites.filter((item) => item.toBotId === bot.id && item.status === 'pending')) {
    invite.status = 'seen'
    acknowledged += 1
    log(`I notice a Betabook invite: ${invite.message}`)
  }
  if (acknowledged) writeBetabookState(state)
  return acknowledged
}

function createDestinyState(bots) {
  const plans = []
  for (let index = 0; index + 1 < bots.length; index += 2) {
    plans.push({
      id: `destiny-thread-${String(plans.length + 1).padStart(3, '0')}`,
      a: bots[index].id,
      b: bots[index + 1].id,
      intent: plans.length % 5 === 4 ? 'near_miss' : 'cross_paths',
      reactionId: null,
      matchId: null,
      postId: null,
      status: 'waiting_for_characters',
      messagesSeeded: 0,
    })
  }
  return {
    enabled: config.destinyEnabled,
    backendUrl: config.backendUrl,
    intervalMs: config.destinyIntervalMs,
    masterPlan: plans,
    charactersByBotId: {},
    nudgesByBotId: Object.fromEntries(bots.map((bot) => [bot.id, []])),
    rescuedHelpPostIds: [],
    events: [],
    errors: [],
  }
}

async function initializeDestinyMasterPlan(bots, state, betabookState) {
  if (!state.enabled) return
  const plan = await llmDestinyMasterPlan(bots, state)
  const byId = new Map((plan.threads || []).map((thread) => [thread.id, thread]))
  for (const thread of state.masterPlan) {
    const planned = byId.get(thread.id)
    if (!planned) continue
    if (['cross_paths', 'near_miss'].includes(planned.intent)) {
      thread.intent = planned.intent
      thread.reason = planned.reason || ''
    }
  }
  state.events.push({ type: 'llm_master_plan', summary: plan.summary || '', at: nowIso() })
  if (plan.summary) {
    betabookPost(betabookState, {
      authorId: 'destiny',
      channel: 'table-talk',
      title: 'Destiny sets the table',
      body: plan.summary,
      tags: ['destiny', 'master-plan', 'llm'],
    })
  }
}

function addDestinyNudge(state, botId, nudge) {
  if (!state.enabled) return
  state.nudgesByBotId[botId] ||= []
  state.nudgesByBotId[botId].push({ ...nudge, at: nowIso() })
  state.events.push({ type: 'nudge_created', botId, kind: nudge.kind, at: nowIso() })
}

function takeDestinyNudges(state, botId) {
  if (!state?.enabled) return []
  const nudges = state.nudgesByBotId[botId] || []
  state.nudgesByBotId[botId] = []
  return nudges
}

function runDestinyLoopRescue(bots, state, betabookState) {
  if (!state.enabled || !betabookState?.enabled) return
  const botsById = new Map(bots.map((bot) => [bot.id, bot]))
  const rescued = new Set(state.rescuedHelpPostIds || [])
  for (const post of betabookState.posts.filter((item) => item.tags?.includes('loop-help'))) {
    if (rescued.has(post.id)) continue
    const bot = botsById.get(post.authorId)
    if (!bot) continue

    const nudge = {
      kind: 'loop_rescue',
      thought: 'I am stuck in a loop, so I should stop doing the same thing and try a different path.',
      route: pick(['/likes-you', '/matches', '/tables', '/profile', '/discover']),
    }
    addDestinyNudge(state, bot.id, nudge)
    betabookComment(betabookState, {
      postId: post.id,
      authorId: 'destiny',
      body: `Destiny notices ${bot.name} looping and quietly shifts the timing: try a different surface, then ask a person or table for a concrete next step.`,
    })
    betabookInvite(betabookState, {
      fromBotId: 'destiny',
      toBotId: bot.id,
      kind: 'loop_rescue',
      message: 'You seem stuck. Try a different part of the product, then make one concrete social move.',
      postId: post.id,
    })
    rescued.add(post.id)
    state.events.push({ type: 'loop_rescue_planned', botId: bot.id, postId: post.id, route: nudge.route, at: nowIso() })
  }
  state.rescuedHelpPostIds = [...rescued]
}

async function runDestinyPass(bots, state, betabookState) {
  if (!state.enabled) return
  const botsById = new Map(bots.map((bot) => [bot.id, bot]))

  runDestinyLoopRescue(bots, state, betabookState)

  const advice = await llmDestinyLiveAdvice(bots, state, betabookState)
  for (const nudge of (advice.nudges || []).slice(0, 3)) {
    if (!nudge.botId || !botsById.has(nudge.botId)) continue
    addDestinyNudge(state, nudge.botId, {
      kind: nudge.kind || 'think',
      thought: nudge.thought || 'I have a hunch that I should try a different path now.',
      route: nudge.route || undefined,
    })
    state.events.push({ type: 'llm_live_nudge', botId: nudge.botId, route: nudge.route || null, at: nowIso() })
  }
  if (advice.betabookComment) {
    betabookPost(betabookState, {
      authorId: 'destiny',
      channel: 'table-talk',
      title: 'A strange coincidence',
      body: advice.betabookComment,
      tags: ['destiny', 'llm'],
    })
  }

  for (const bot of bots) {
    if (state.charactersByBotId[bot.id]) continue
    const characters = await optionalDestiny(state, `characters ${bot.id}`, () => api(bot, '/characters'))
    if (characters?.[0]) {
      state.charactersByBotId[bot.id] = characters[0]
      state.events.push({ type: 'character_ready', botId: bot.id, characterId: characters[0].id, at: nowIso() })
    }
  }

  for (const pair of state.masterPlan) {
    if (pair.status === 'matched_and_messaged') continue
    if (pair.status === 'paths_kept_apart') continue
    const botA = botsById.get(pair.a)
    const botB = botsById.get(pair.b)
    const charA = state.charactersByBotId[pair.a]
    const charB = state.charactersByBotId[pair.b]
    if (!botA || !botB || !charA || !charB) continue

    if (pair.intent === 'near_miss') {
      const post = betabookPost(betabookState, {
        authorId: 'destiny',
        channel: 'missed-connections',
        title: `${botA.name} and ${botB.name} almost cross paths`,
        body: 'Two compatible people are active, but Destiny keeps them in adjacent rooms to test whether the product creates enough organic momentum without intervention.',
        tags: ['near-miss', 'destiny'],
      })
      pair.postId = post?.id || null
      pair.status = 'paths_kept_apart'
      addDestinyNudge(state, pair.a, { kind: 'think', thought: 'I feel like there are people nearby, but I do not see a clear path to them yet.' })
      addDestinyNudge(state, pair.b, { kind: 'think', thought: 'I wonder if the app has enough live people for me, because I keep missing the moment.' })
      state.events.push({ type: 'paths_kept_apart', pairId: pair.id, at: nowIso() })
      continue
    }

    if (!pair.postId) {
      const post = betabookPost(betabookState, {
        authorId: pair.a,
        channel: 'looking-for-party',
        title: `${botA.name} is looking for a table`,
        body: `${botA.name} wants a low-pressure table and seems compatible with ${botB.name}.`,
        tags: ['looking-for-party', 'destiny-surface'],
      })
      pair.postId = post?.id || null
      betabookInvite(betabookState, {
        fromBotId: pair.a,
        toBotId: pair.b,
        kind: 'cross_paths',
        message: `${botA.name} looks compatible. Maybe check their character before leaving.`,
        postId: pair.postId,
      })
      addDestinyNudge(state, pair.a, { kind: 'think', thought: pick(destinyThoughts), route: '/discover' })
      addDestinyNudge(state, pair.b, { kind: 'think', thought: pick(destinyThoughts), route: '/likes-you' })
      state.events.push({ type: 'paths_set_to_cross', pairId: pair.id, postId: pair.postId, at: nowIso() })
    }

    if (!pair.reactionId) {
      const reaction = await optionalDestiny(state, `reaction ${pair.a}->${pair.b}`, () => api(botA, '/reactions', {
        method: 'POST',
        body: {
          fromCharacterId: charA.id,
          toCharacterId: charB.id,
          target: { type: 'card', field: 'hook' },
          comment: pick(betabookOpeners),
        },
      }))
      if (reaction?.id) {
        pair.reactionId = reaction.id
        pair.status = 'reaction_sent'
        state.events.push({ type: 'reaction_sent', pairId: pair.id, from: pair.a, to: pair.b, reactionId: reaction.id, at: nowIso() })
      }
    }

    const incoming = await optionalDestiny(state, `incoming ${pair.b}`, () => api(botB, `/reactions/incoming?characterId=${encodeURIComponent(charB.id)}`))
    const incomingReaction = incoming?.find((item) => item.fromCharacter?.id === charA.id || item.fromCharacterId === charA.id) || incoming?.find((item) => item.id === pair.reactionId)
    if (incomingReaction?.id && !pair.matchId) {
      await optionalDestiny(state, `accept ${pair.b}`, () => api(botB, `/reactions/${incomingReaction.id}/accept`, { method: 'POST' }))
      pair.status = 'accepted'
      state.events.push({ type: 'reaction_accepted', pairId: pair.id, by: pair.b, reactionId: incomingReaction.id, at: nowIso() })
    }

    const matches = await optionalDestiny(state, `matches ${pair.a}`, () => api(botA, `/matches?characterId=${encodeURIComponent(charA.id)}`))
    const match = matches?.find((item) => {
      const ids = [item.characterAId, item.characterBId]
      return ids.includes(charA.id) && ids.includes(charB.id)
    })
    if (match?.id) {
      pair.matchId = match.id
      pair.status = 'matched'
      betabookComment(betabookState, {
        postId: pair.postId,
        authorId: pair.b,
        body: pick(betabookReplies),
      })
      state.events.push({ type: 'match_found', pairId: pair.id, matchId: match.id, at: nowIso() })
    }

    if (pair.matchId && pair.messagesSeeded === 0) {
      await optionalDestiny(state, `message ${pair.a}`, () => api(botA, `/matches/${pair.matchId}/messages`, {
        method: 'POST',
        body: { fromCharacterId: charA.id, body: pick(betabookOpeners) },
      }))
      await optionalDestiny(state, `message ${pair.b}`, () => api(botB, `/matches/${pair.matchId}/messages`, {
        method: 'POST',
        body: { fromCharacterId: charB.id, body: pick(betabookReplies) },
      }))
      pair.messagesSeeded = 2
      pair.status = 'matched_and_messaged'
      state.events.push({ type: 'messages_seeded', pairId: pair.id, matchId: pair.matchId, count: 2, at: nowIso() })
    }
  }
}

function writeDestinyState(state) {
  if (!state.enabled) return
  fs.writeFileSync(path.join(config.runDir, 'destiny.json'), JSON.stringify(state, null, 2))
}

function startDestiny(bots, state, betabookState) {
  if (!state.enabled) return () => {}
  let stopped = false
  let running = false
  let currentRun = null
  const run = async () => {
    if (stopped) return
    if (running) return currentRun
    running = true
    currentRun = (async () => {
      try {
        await runDestinyPass(bots, state, betabookState)
      } catch (error) {
        state.errors.push(`destiny pass: ${error.message}`)
      } finally {
        writeDestinyState(state)
        writeBetabookState(betabookState)
        running = false
        currentRun = null
      }
    })()
    return currentRun
  }
  run()
  const timer = setInterval(run, Math.max(10000, config.destinyIntervalMs))
  return async () => {
    stopped = true
    clearInterval(timer)
    if (currentRun) await currentRun
    stopped = false
    await run()
    stopped = true
    writeDestinyState(state)
    writeBetabookState(betabookState)
  }
}

function locatorForRole(page, label) {
  return page.getByRole('link', { name: label })
    .or(page.getByRole('button', { name: label }))
    .first()
}

async function observe(page) {
  const title = await page.title().catch(() => '')
  const text = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')
  return { title, text: firstVisibleText(text) }
}

async function clickFirst(page, labels) {
  for (const label of labels) {
    const locator = locatorForRole(page, label)
    if (await locator.isVisible({ timeout: 1000 }).catch(() => false)) {
      try {
        await locator.click({ timeout: 5000 })
        return label instanceof RegExp ? label.toString() : label
      } catch {}
    }
  }
  return null
}

async function selectByIndex(locator, index) {
  const count = await locator.count().catch(() => 0)
  if (count === 0) return false
  await locator.nth(0).selectOption({ index }).catch(async () => {
    await locator.nth(0).selectOption({ index: 1 })
  })
  return true
}

async function tryCreateCharacter(page, bot, log, actions) {
  const before = await observe(page)
  const lower = before.text.toLowerCase()
  if (!lower.includes('character')) return false

  if (!lower.includes('basic information')) {
    const clicked = await clickFirst(page, ['Create your first character', /^create$/i, /create character/i])
    if (!clicked) return false

    actions.push(`clicked ${clicked}`)
    log(`I start creating a character because the app keeps telling me that is the way in.`)
    await wait(1500 + random() * 2500)
  } else {
    log(`The character form is already open, so I stop wandering and fill it in.`)
  }

  const modalText = (await observe(page)).text.toLowerCase()
  if (!modalText.includes('basic information')) {
    log(`I expected a character form, but I am not sure it opened.`)
    return false
  }

  const firstName = bot.name.split(' ')[0]
  const characterName = `${firstName} ${pick(['Emberleaf', 'Moonbrook', 'Ironquill', 'Duskwalker', 'Starling'])}`
  const hook = `${characterName} is looking for a table where character choices matter and strangers become a party slowly.`

  await page.locator('input[type="text"]').first().fill(characterName, { timeout: 5000 })
  await selectByIndex(page.locator('select').nth(0), 1 + Math.floor(random() * 4))
  await selectByIndex(page.locator('select').nth(1), 1 + Math.floor(random() * 6))
  await selectByIndex(page.locator('select').nth(2), 1 + Math.floor(random() * 6))
  actions.push(`filled character basics for ${characterName}`)
  log(`I name my character ${characterName}; this makes the product feel personal instead of abstract.`)

  await clickFirst(page, [/next step/i])
  await wait(1000 + random() * 2000)
  await clickFirst(page, [/next step/i])
  await wait(1000 + random() * 2000)

  await page.locator('textarea').first().fill(hook, { timeout: 5000 })
  await selectByIndex(page.locator('select').first(), 1 + Math.floor(random() * 4))
  actions.push('filled character hook and vibe')
  log(`I write a hook instead of optimizing it; I am trying to sound like myself.`)

  await clickFirst(page, [/next step/i])
  await wait(1000 + random() * 2000)
  const sliders = page.locator('input[type="range"]')
  const sliderCount = await sliders.count().catch(() => 0)
  for (let index = 0; index < Math.min(sliderCount, 4); index += 1) {
    await sliders.nth(index).fill(String(35 + Math.floor(random() * 40))).catch(() => {})
  }
  await clickFirst(page, [/finalize character/i])
  await wait(2500 + random() * 3500)

  const after = await observe(page)
  if (after.text.toLowerCase().includes(characterName.toLowerCase()) || !after.text.toLowerCase().includes('basic information')) {
    actions.push(`created character ${characterName}`)
    log(`The character seems saved, so now I expect the rest of the app to make more sense.`)
    return true
  }

  log(`I tried to finish the character, but I cannot tell whether it saved.`)
  return false
}

async function screenshot(page, bot, step) {
  const dir = path.join(config.runDir, 'screenshots', bot.id)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${String(step).padStart(2, '0')}.png`)
  await page.screenshot({ path: file, fullPage: true }).catch(() => {})
  return file
}

function think(bot, observation, phase) {
  const text = observation.text.toLowerCase()
  if (!observation.text) return `I am not sure the page loaded, and that makes me hesitate.`
  if (hasAny(text, cohort.keywords.risk)) return `I see a failure signal, and now I am wondering whether I can trust this enough to continue.`
  if (hasAny(text, cohort.keywords.empty)) return `This page feels unfinished or empty, so I need a specific next step to stay oriented.`
  if (hasAny(text, cohort.keywords.value)) return `I can see a possible value path now, so I am checking whether it fits my situation.`
  if (hasAny(text, cohort.keywords.trust)) return `I notice trust cues, and that lowers the risk of taking the next step.`
  if (text.includes('sign in') || text.includes('auth')) return `I pause because account walls make me wonder how much information I must give before seeing value.`
  if (phase === 'arrival') return `I am trying to figure out, in plain language, who ${cohort.appName} is for and what problem it solves.`
  return `I scan for the next obvious action and whether the page gives me enough confidence to keep going.`
}

function opinionFrom(bot, observation) {
  const text = observation.text.toLowerCase()
  if (!observation.text) return `My first reaction is uncertainty because I cannot read enough of the product yet.`
  const role = bot.role.toLowerCase()
  if (hasAny(text, cohort.keywords.risk)) return `My reaction is frustration because visible errors make the product feel less safe to rely on.`
  if (hasAny(text, cohort.keywords.empty)) return `My reaction is mild disappointment, but I can keep going if the page gives me a concrete next step.`
  if (hasAny(text, cohort.keywords.value)) return `My reaction is more engaged because I can connect the screen to a practical outcome.`
  if (hasAny(text, cohort.keywords.trust)) return `My reaction is more comfortable because the product is answering risk questions before I ask them.`
  if (role.includes('buyer') || role.includes('manager')) {
    return `I am judging proof, cost, and adoption risk more than visual polish.`
  }
  if (role.includes('operator') || role.includes('admin')) {
    return `I am looking for evidence this removes work instead of moving work somewhere else.`
  }
  if (role.includes('privacy')) {
    return `I am checking whether I can participate without exposing too much too early.`
  }
  return `My reaction is to look for a reason to take the next step rather than browse passively.`
}

function ideaFrom(bot, observation) {
  const text = observation.text.toLowerCase()
  for (const rule of cohort.ideaRules) {
    if (hasAny(text, rule.when || [])) return rule.idea.startsWith('Idea:') ? rule.idea : `Idea: ${rule.idea}`
  }
  if (hasAny(text, cohort.keywords.empty)) return 'Idea: when nothing is available, show a concrete next step instead of only saying it is empty.'
  if (hasAny(text, cohort.keywords.risk)) return 'Idea: make failures recoverable with plain-language explanations and a safe next action.'
  if (hasAny(text, cohort.keywords.value)) return 'Idea: make the successful outcome visible as soon as the user takes a meaningful action.'
  if (bot.role.toLowerCase().includes('privacy')) return 'Idea: show privacy controls early, before I create too much.'
  return 'Idea: keep the next best action visually obvious after every page transition.'
}

async function llmBotReflection(bot, observation, phase, fallback, stats = {}) {
  return llmJson('betabot_reflection', {
    bot: {
      id: bot.id,
      name: bot.name,
      role: bot.role,
      past: bot.past,
      goal: bot.goal,
      emotionalBaseline: bot.emotionalBaseline,
      technicalComfort: bot.technicalComfort,
    },
    appName: cohort.appName,
    phase,
    visibleScreen: observation.text.slice(0, 1600),
    title: observation.title,
    sessionStats: {
      likes: stats.likes || 0,
      passes: stats.passes || 0,
      messages: stats.messages || 0,
      repeatedScreens: stats.repeatedScreens || 0,
      loopHelpRequests: stats.loopHelpRequests || 0,
      curiosityActions: stats.curiosityActions || 0,
    },
    requestedShape: {
      thought: 'first-person thought',
      opinion: 'first-person reaction/opinion',
      idea: 'Idea: product idea in first person or concise product suggestion',
      desiredAction: 'one of: continue, like, pass, message, ask_betabook, explore, leave',
    },
  }, fallback)
}

async function llmBotShortText(task, bot, context, fallbackText) {
  const result = await llmJson(task, {
    bot: {
      id: bot.id,
      name: bot.name,
      role: bot.role,
      past: bot.past,
      goal: bot.goal,
      emotionalBaseline: bot.emotionalBaseline,
    },
    context,
    requestedShape: { text: 'short first-person human text, no markdown' },
  }, { text: fallbackText })
  return String(result.text || fallbackText).replace(/\s+/g, ' ').trim().slice(0, 500)
}

async function llmDestinyMasterPlan(bots, state) {
  const fallback = {
    summary: 'Pair nearby complementary users, keep one pair as a near miss when the cohort is large enough.',
    threads: state.masterPlan.map((thread) => ({
      id: thread.id,
      intent: thread.intent,
      reason: 'Seed enough social motion to test whether the product helps people continue.',
    })),
  }
  return llmJson('destiny_master_plan', {
    appName: cohort.appName,
    bots: bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      role: bot.role,
      past: bot.past,
      goal: bot.goal,
      emotionalBaseline: bot.emotionalBaseline,
    })),
    currentThreads: state.masterPlan.map((thread) => ({
      id: thread.id,
      a: thread.a,
      b: thread.b,
      intent: thread.intent,
    })),
    allowedIntents: ['cross_paths', 'near_miss'],
    requestedShape: {
      summary: 'one sentence master plan',
      threads: [{ id: 'thread id', intent: 'cross_paths or near_miss', reason: 'why Destiny wants this' }],
    },
  }, fallback)
}

async function llmDestinyLiveAdvice(bots, state, betabookState) {
  const fallback = { nudges: [], betabookComment: '' }
  return llmJson('destiny_live_advice', {
    appName: cohort.appName,
    readyBotIds: Object.keys(state.charactersByBotId || {}),
    threads: state.masterPlan.map((thread) => ({
      id: thread.id,
      a: thread.a,
      b: thread.b,
      intent: thread.intent,
      status: thread.status,
      messagesSeeded: thread.messagesSeeded,
    })),
    bots: bots.map((bot) => ({ id: bot.id, name: bot.name, role: bot.role, goal: bot.goal })),
    recentBetabookPosts: (betabookState?.posts || []).slice(-8).map((post) => ({
      id: post.id,
      channel: post.channel,
      authorId: post.authorId,
      title: post.title,
      tags: post.tags,
    })),
    requestedShape: {
      nudges: [{ botId: 'bot id', kind: 'think or loop_rescue', thought: 'believable hunch', route: '/discover or /likes-you or /matches or /tables or /profile' }],
      betabookComment: 'optional Destiny comment for the run, empty string if none',
    },
  }, fallback)
}

function screenFingerprint(observation) {
  return observation.text
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, '<id>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .slice(0, 260)
}

function isDiscoverScreen(text) {
  return text.includes('discover view as') && !text.includes('start with a character') && !text.includes('character required')
}

function isMatchesScreen(text) {
  return text.includes('matches') && (text.includes('start the conversation') || text.includes('message ') || text.includes('select a match'))
}

async function tryDiscoverReaction(page, bot, log, actions, stats) {
  const observation = await observe(page)
  const text = observation.text.toLowerCase()
  if (!isDiscoverScreen(text)) return false

  const shouldLike = stats.likes < 2 || (stats.likes <= stats.passes && random() < 0.55)
  if (shouldLike) {
    const liked = await clickFirst(page, [/like profile/i, /like this/i, /^like$/i])
    if (!liked) return false
    actions.push(`clicked ${liked}`)
    log(`I choose to like this profile because browsing without signaling interest would not help me meet anyone.`)
    await wait(800 + random() * 1600)

    const fallbackComment = pick([
      'Your hook feels like it could turn into a real table conversation.',
      'I like the vibe here. Want to see if our playstyles actually work together?',
      'This sounds like the kind of party chemistry I am looking for.',
    ])
    const comment = await llmBotShortText('betabot_like_comment', bot, {
      visibleScreen: observation.text.slice(0, 1400),
      action: 'send a like with a short comment',
    }, fallbackComment)
    const textarea = page.locator('textarea').last()
    if (await textarea.isVisible({ timeout: 1500 }).catch(() => false)) {
      await textarea.fill(comment).catch(() => {})
      log(`I add a short note instead of sending a silent like: "${comment}"`)
    }
    const sent = await clickFirst(page, [/send like/i, /^send$/i])
    if (sent) {
      actions.push(`clicked ${sent}`)
      stats.likes += 1
      stats.meaningfulSocialActions += 1
      await wait(1200 + random() * 2400)
      return true
    }
  }

  const passed = await clickFirst(page, [/^pass$/i])
  if (passed) {
    actions.push(`clicked ${passed}`)
    stats.passes += 1
    log(`I pass because this profile does not feel like the right fit right now.`)
    await wait(900 + random() * 1800)
    return true
  }
  return false
}

async function trySendMatchMessage(page, bot, log, actions, stats) {
  let observation = await observe(page)
  let text = observation.text.toLowerCase()
  if (!isMatchesScreen(text)) return false

  const threadButton = page.getByRole('button').filter({ hasText: /↔|start the conversation|jun|jul|me /i }).first()
  if (await threadButton.isVisible({ timeout: 1000 }).catch(() => false)) {
    await threadButton.click({ timeout: 3000 }).catch(() => {})
    actions.push('opened a match thread')
    log(`I open a match because the point of matching is to see whether there is a real conversation.`)
    await wait(1000 + random() * 1800)
  }

  const textarea = page.locator('textarea[placeholder^="Message"]').last()
  if (!(await textarea.isVisible({ timeout: 1500 }).catch(() => false))) return false

  const fallbackBody = pick([
    'Your character hook caught me. Want to try a low-pressure one-shot first?',
    'I am curious whether our table vibes work. What kind of first session would feel safe?',
    'This match seems promising. Would you rather start with chat or pick an open table?',
  ])
  const body = await llmBotShortText('betabot_match_message', bot, {
    visibleScreen: observation.text.slice(0, 1400),
    action: 'send a first match message',
  }, fallbackBody)
  await textarea.fill(body)
  await page.keyboard.press('Enter').catch(async () => {
    await page.locator('form button[type="submit"]').last().click({ timeout: 2000 }).catch(() => {})
  })
  actions.push('sent match message')
  stats.messages += 1
  stats.meaningfulSocialActions += 1
  log(`I send a message because a match without a next step would feel unfinished: "${body}"`)
  await wait(1200 + random() * 2400)
  return true
}

async function tryCuriosityAction(page, bot, log, actions, stats, force = false) {
  if (!force && random() > config.curiosityChance) return false
  if (stats.curiosityActions >= config.maxCuriosityActions) return false

  const observation = await observe(page)
  const lower = observation.text.toLowerCase()
  const safeLabels = [
    /filters/i,
    /read/i,
    /browse tables/i,
    /discover characters/i,
    /find characters/i,
    /check likes/i,
    /improve my character/i,
    /invite friends/i,
    /reset/i,
    /apply filters/i,
    /organizer console/i,
  ]
  const dangerous = /delete|remove|revoke|sign out|logout|pay|purchase|submit|publish|create invite|create venue|create table|publish session/i

  for (const label of safeLabels.sort(() => random() - 0.5)) {
    const locator = locatorForRole(page, label)
    if (await locator.isVisible({ timeout: 600 }).catch(() => false)) {
      const text = await locator.innerText({ timeout: 500 }).catch(() => String(label))
      if (dangerous.test(text)) continue
      await locator.click({ timeout: 2500 }).catch(() => {})
      actions.push(`curiosity clicked ${label}`)
      stats.curiosityActions += 1
      stats.meaningfulSocialActions += lower.includes('match') || lower.includes('discover') || lower.includes('table') ? 1 : 0
      log(`Curiosity gets me to try "${text || label}" instead of repeating the same path.`)
      await wait(900 + random() * 2200)
      return true
    }
  }

  const selects = page.locator('select')
  const selectCount = await selects.count().catch(() => 0)
  if (selectCount > 0) {
    const index = Math.floor(random() * Math.min(selectCount, 3))
    const changed = await selectByIndex(selects.nth(index), 1 + Math.floor(random() * 3)).catch(() => false)
    if (changed) {
      actions.push(`curiosity changed select ${index + 1}`)
      stats.curiosityActions += 1
      log(`Curiosity makes me change a filter/config option to see whether the product reacts.`)
      await wait(900 + random() * 2200)
      return true
    }
  }

  const ranges = page.locator('input[type="range"]')
  const rangeCount = await ranges.count().catch(() => 0)
  if (rangeCount > 0) {
    const index = Math.floor(random() * Math.min(rangeCount, 4))
    await ranges.nth(index).fill(String(20 + Math.floor(random() * 70))).catch(() => {})
    actions.push(`curiosity adjusted range ${index + 1}`)
    stats.curiosityActions += 1
    log(`Curiosity makes me adjust a slider to understand what control I have.`)
    await wait(900 + random() * 2200)
    return true
  }

  return false
}

async function runBot(browser, bot, runtime = {}) {
  const startedAt = Date.now()
  const context = await browser.newContext({
    viewport: bot.viewport === 'mobile' ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    userAgent: bot.viewport === 'mobile'
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
      : undefined,
  })
  const authToken = authTokenFor(bot)
  if (config.authLocalStorageKey && authToken) {
    await context.addInitScript(([key, token]) => {
      window.localStorage.setItem(key, token)
    }, [config.authLocalStorageKey, authToken])
  }
  const page = await context.newPage()
  const notes = []
  const actions = []
  const errors = []
  const ideas = []
  const thoughts = []
  const opinions = []
  const betabookMoments = []
  const destinyMoments = []
  const screenCounts = new Map()
  const stats = {
    repeatedScreens: 0,
    loopHelpRequests: 0,
    loopRescuesFollowed: 0,
    curiosityActions: 0,
    likes: 0,
    passes: 0,
    messages: 0,
    meaningfulSocialActions: 0,
  }
  let step = 1
  let value = 0
  let trust = 45
  let emptyCharacterViews = 0
  let createdCharacter = false

  const log = (text) => notes.push(`- T+${elapsed(startedAt)} ${text}`)
  const recordThought = (thought) => {
    thoughts.push(thought)
    log(`I think: ${thought}`)
  }
  const recordIdea = (idea) => {
    ideas.push(idea.replace(/^Idea:\s*/, ''))
    log(idea)
  }
  const recordOpinion = (opinion) => {
    opinions.push(opinion)
    log(`My reaction: ${opinion}`)
  }
  const recordScreenQuality = (observation) => {
    const fingerprint = screenFingerprint(observation)
    const count = (screenCounts.get(fingerprint) || 0) + 1
    screenCounts.set(fingerprint, count)
    if (count > 2) {
      stats.repeatedScreens += 1
      if (count === 3 || count % 5 === 0) {
        log(`I notice I am seeing the same kind of screen again, so my patience drops a little.`)
      }
    }
    return count
  }
  const askBetabookForHelp = async (reason, observation) => {
    if (!runtime.betabookState?.enabled) return false
    if (stats.loopHelpRequests >= 3) return false
    stats.loopHelpRequests += 1
    const body = await llmBotShortText('betabot_help_request', bot, {
      reason,
      visibleScreen: observation.text.slice(0, 1200),
      action: 'ask other simulated users for help on Betabook because I am stuck',
    }, `I keep landing on the same kind of screen. Reason: ${reason}. Current screen starts with: "${observation.text.slice(0, 220)}"`)
    const post = betabookPost(runtime.betabookState, {
      authorId: bot.id,
      channel: 'help',
      title: `${bot.name} feels stuck`,
      body,
      tags: ['loop-help', 'stuck', bot.role],
    })
    log(`I feel stuck, so I ask Betabook for help instead of silently looping.`)
    if (post) {
      betabookMoments.push(`asked for help: ${post.title}`)
    }
    return true
  }
  const recordReflection = async (observation, phase) => {
    const fallback = {
      thought: think(bot, observation, phase),
      opinion: opinionFrom(bot, observation),
      idea: ideaFrom(bot, observation),
      desiredAction: 'continue',
    }
    const reflection = await llmBotReflection(bot, observation, phase, fallback, stats)
    recordThought(reflection.thought || fallback.thought)
    recordOpinion(reflection.opinion || fallback.opinion)
    recordIdea(reflection.idea || fallback.idea)
    if (reflection.desiredAction) {
      log(`My impulse is to ${reflection.desiredAction}.`)
    }
  }
  const useBetabook = async (reason) => {
    const betabookState = runtime.betabookState
    if (!betabookState?.enabled) return
    const digest = betabookDigestForBot(betabookState, bot)
    if (!digest.posts.length && !digest.invites.length) return
    const postText = digest.posts.map((post) => `${post.channel}: ${post.title}`).join('; ')
    const inviteText = digest.invites.map((invite) => invite.message).join('; ')
    const summary = [postText, inviteText].filter(Boolean).join(' | ')
    betabookMoments.push(summary)
    log(`I check Betabook ${reason}: ${summary}`)
    acknowledgeBetabookInvites(betabookState, bot, log)
    if (digest.posts[0]) {
      const body = await llmBotShortText('betabot_betabook_comment', bot, {
        reason,
        post: digest.posts[0],
        inviteSummary: inviteText,
      }, `This is relevant to me because I am here as ${bot.role}.`)
      betabookComment(betabookState, {
        postId: digest.posts[0].id,
        authorId: bot.id,
        body,
      })
    }
  }
  const followDestiny = async () => {
    const destinyState = runtime.destinyState
    const nudges = takeDestinyNudges(destinyState, bot.id)
    for (const nudge of nudges) {
      destinyMoments.push(nudge.kind)
      if (nudge.kind === 'loop_rescue') stats.loopRescuesFollowed += 1
      if (nudge.thought) recordThought(nudge.thought)
      if (nudge.route) {
        await page.goto(`${config.appUrl}${nudge.route}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((error) => {
          errors.push(`destiny navigation ${nudge.route}: ${error.message}`)
        })
        actions.push(`followed a hunch to ${nudge.route}`)
        log(`I follow a hunch and check ${nudge.route}.`)
      }
    }
  }

  try {
    log(`I arrive as ${bot.role}. My past: ${bot.past}`)
    log(`Today I want to: ${bot.goal}`)
    if (authToken) log(`I have my own isolated test account for this session.`)
    betabookPost(runtime.betabookState, {
      authorId: bot.id,
      channel: 'introductions',
      title: `${bot.name} arrives`,
      body: `${bot.name} is a ${bot.role}. Goal: ${bot.goal}`,
      tags: ['arrival', bot.role],
    })
    await page.goto(config.appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await wait(2500 + random() * 5000)
    let observation = await observe(page)
    recordScreenQuality(observation)
    await screenshot(page, bot, step++)
    log(`I see "${observation.title || 'the app'}". ${observation.text}`)
    await recordReflection(observation, 'arrival')

    const sessionMs = bot.attentionSpanMinutes * 60 * 1000
    const maxMoves = clamp(Math.round(bot.attentionSpanMinutes * 4), 8, 360)
    const routes = cohort.routes

    for (let move = 0; move < maxMoves && Date.now() - startedAt < sessionMs; move += 1) {
      const remainingMs = sessionMs - (Date.now() - startedAt)
      await wait(Math.min(remainingMs, 6000 + random() * 12000))
      if (Date.now() - startedAt >= sessionMs) break
      await followDestiny()
      if (move > 0 && move % 3 === 0) await useBetabook('between actions')
      const route = routes[move % routes.length]
      const clicked = await clickFirst(page, route.labels)
      if (clicked) {
        actions.push(`clicked ${clicked}`)
        log(`I click "${clicked}" because it looks like the next natural thing.`)
      } else {
        await page.goto(`${config.appUrl}${route.fallback}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((error) => {
          errors.push(`navigation ${route.fallback}: ${error.message}`)
        })
        actions.push(`navigated ${route.fallback}`)
        log(`I cannot find the obvious link, so I try ${route.fallback} like a determined user using the address bar.`)
      }

      await wait(2500 + random() * 7000)
      observation = await observe(page)
      recordScreenQuality(observation)
      await screenshot(page, bot, step++)
      log(`I now see: ${observation.text}`)
      await recordReflection(observation, 'exploration')

      const lower = observation.text.toLowerCase()
      const currentFingerprintCount = screenCounts.get(screenFingerprint(observation)) || 1
      if (currentFingerprintCount >= config.loopRepeatThreshold) {
        const asked = await askBetabookForHelp(`screen repeated ${currentFingerprintCount} times`, observation)
        if (asked) {
          trust -= 4
          await tryCuriosityAction(page, bot, log, actions, stats, true)
        }
      }
      const noveltyMultiplier = config.strictScoring ? (currentFingerprintCount === 1 ? 1 : currentFingerprintCount === 2 ? 0.35 : 0) : 1
      if (hasAny(lower, cohort.keywords.value)) value += Math.round(12 * noveltyMultiplier)
      if (hasAny(lower, cohort.keywords.trust)) trust += Math.round(8 * noveltyMultiplier)
      if (hasAny(lower, cohort.keywords.risk)) trust -= 20
      if (lower.includes('start with a character') || lower.includes('character required')) emptyCharacterViews += 1

      if (!createdCharacter && emptyCharacterViews > 0) {
        createdCharacter = await tryCreateCharacter(page, bot, log, actions)
        if (createdCharacter) {
          betabookPost(runtime.betabookState, {
            authorId: bot.id,
            channel: 'looking-for-party',
            title: `${bot.name} has a character now`,
            body: 'I finished enough setup that I can plausibly meet, match, chat, or join a table.',
            tags: ['ready', 'character-created'],
          })
          value += 18
          trust += 8
          observation = await observe(page)
          recordScreenQuality(observation)
          await screenshot(page, bot, step++)
          log(`After creating a character, I see: ${observation.text}`)
          await recordReflection(observation, 'character-created')
        } else if (emptyCharacterViews >= 2) {
          trust -= 8
          log(`I am looping on the character requirement and starting to lose patience.`)
        }
      }

      const actedSocially = await trySendMatchMessage(page, bot, log, actions, stats)
        || await tryDiscoverReaction(page, bot, log, actions, stats)
        || await tryCuriosityAction(page, bot, log, actions, stats)
      if (actedSocially) {
        observation = await observe(page)
        recordScreenQuality(observation)
        await screenshot(page, bot, step++)
        log(`After the social action, I see: ${observation.text}`)
      } else {
        const reserveClicked = await clickFirst(page, [/^reserve$/i, /^save$/i, /invite to table/i, /^message$/i])
        if (reserveClicked) {
          actions.push(`clicked ${reserveClicked}`)
          stats.meaningfulSocialActions += 1
          log(`I try "${reserveClicked}" and watch whether the app reacts clearly.`)
          await wait(2500 + random() * 5500)
          observation = await observe(page)
          recordScreenQuality(observation)
          await screenshot(page, bot, step++)
          log(`After trying "${reserveClicked}", I see: ${observation.text}`)
        }
      }
    }
  } catch (error) {
    errors.push(error.message)
    log(`I hit a problem: ${error.message}`)
  } finally {
    await context.close().catch(() => {})
  }

  let score = clamp(value + trust - errors.length * 20, 0, 100)
  if (config.strictScoring) {
    score -= Math.min(35, stats.repeatedScreens * 2)
    if (stats.passes > stats.likes + 3) score -= Math.min(20, (stats.passes - stats.likes - 3) * 2)
    if (stats.meaningfulSocialActions === 0) score -= 25
    if (stats.loopHelpRequests > 0 && stats.loopRescuesFollowed === 0) score -= Math.min(18, stats.loopHelpRequests * 6)
    if (runtime.destinyState?.enabled && destinyMoments.length === 0) score -= 8
    if (runtime.betabookState?.enabled && betabookMoments.length === 0) score -= 8
    score = clamp(score, 0, 100)
  }
  if (emptyCharacterViews >= 3 && !createdCharacter) {
    score = Math.min(score, 62)
  }
  const endReason = errors.length
    ? 'hit a bug or dead end'
    : emptyCharacterViews >= 3 && !createdCharacter
      ? 'got stuck before creating a character and left'
    : score >= 75
      ? 'completed session and will come back later'
      : score >= 55
        ? pick(['understood value but needs more live people', 'found enough value for one session'])
        : pick(endings.slice(1))

  const raw = `# ${bot.id} — Thoughtful Browser Raw Storyline

## Persona
- Name: ${bot.name}
- Role: ${bot.role}
- Past: ${bot.past}
- Discovery circumstance: ${bot.discovery}
- Goal today: ${bot.goal}
- Emotional baseline: ${bot.emotionalBaseline}
- Technical comfort: ${bot.technicalComfort}
- Estimated session duration: ${bot.attentionSpanMinutes} minutes

## Raw Journey
${notes.join('\n')}

## Session End
- End reason: ${endReason}
- Happiness score: ${score}
- Return likelihood: ${score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low'}
- Trust level: ${trust >= 70 ? 'high' : trust >= 45 ? 'medium' : 'low'}
- Value understood: ${value >= 35 ? 'yes' : value >= 15 ? 'partial' : 'unclear'}
- Created required character: ${createdCharacter ? 'yes' : 'no'}
- Character gate loops: ${emptyCharacterViews}
- Ideas expressed: ${ideas.length}
- Thoughts expressed: ${thoughts.length}
- Opinions expressed: ${opinions.length}
- Betabook moments: ${betabookMoments.length}
- Destiny nudges followed: ${destinyMoments.length}
- Likes sent: ${stats.likes}
- Passes: ${stats.passes}
- Match messages sent: ${stats.messages}
- Repeated screen penalty events: ${stats.repeatedScreens}
- Meaningful social actions: ${stats.meaningfulSocialActions}
- Betabook help requests: ${stats.loopHelpRequests}
- Destiny loop rescues followed: ${stats.loopRescuesFollowed}
- Curiosity actions: ${stats.curiosityActions}

## Action Evidence
${actions.length ? actions.map((action) => `- ${action}`).join('\n') : '- None'}

## Errors
${errors.length ? errors.map((error) => `- ${error}`).join('\n') : '- None'}
`
  fs.writeFileSync(path.join(config.runDir, 'raw', `${bot.id}.md`), raw)
  return { id: bot.id, score, endReason, errors, actions: actions.length, screenshots: step - 1, ideas, thoughts: thoughts.length, opinions: opinions.length, betabookMoments: betabookMoments.length, destinyMoments: destinyMoments.length, likes: stats.likes, passes: stats.passes, messages: stats.messages, repeatedScreens: stats.repeatedScreens, meaningfulSocialActions: stats.meaningfulSocialActions, loopHelpRequests: stats.loopHelpRequests, loopRescuesFollowed: stats.loopRescuesFollowed, curiosityActions: stats.curiosityActions, attentionSpanMinutes: bot.attentionSpanMinutes }
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

function writeAnalysis(results, startedAt, betabookState, destinyState) {
  const scores = results.map((result) => result.score).sort((a, b) => a - b)
  const happy = scores.filter((score) => score >= 70).length
  const unhappy = scores.filter((score) => score < 50).length
  const errorBots = results.filter((result) => result.errors.length > 0)
  const median = scores[Math.floor(scores.length * 0.5)] || 0
  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
  const ideaCounts = new Map()
  for (const result of results) {
    for (const idea of result.ideas || []) {
      ideaCounts.set(idea, (ideaCounts.get(idea) || 0) + 1)
    }
  }
  const topIdeas = [...ideaCounts.entries()].sort((a, b) => b[1] - a[1])
  const summary = {
    config: publicConfig(),
    cohort: {
      appName: cohort.appName,
      source: cohort.source,
      roleCount: cohort.roles.length,
      routeCount: cohort.routes.length,
    },
    betabook: betabookState?.enabled ? {
      enabled: true,
      posts: betabookState.posts.length,
      comments: betabookState.comments.length,
      invites: betabookState.invites.length,
      events: betabookState.events.length,
      errors: betabookState.errors,
    } : { enabled: false },
    destiny: destinyState?.enabled ? {
      enabled: true,
      backendUrl: destinyState.backendUrl,
      masterPlan: destinyState.masterPlan,
      events: destinyState.events.length,
      errors: destinyState.errors,
    } : { enabled: false },
    llm: llmStats,
    elapsedSeconds,
    happy,
    unhappy,
    median,
    errorBots,
    topIdeas,
    results,
  }
  fs.writeFileSync(path.join(config.runDir, 'summary.json'), JSON.stringify(summary, null, 2))
  fs.writeFileSync(path.join(config.runDir, 'analysis.md'), `# Thoughtful Browser Betabot Analysis

## Run Configuration
- App name: ${cohort.appName}
- Cohort source: ${cohort.source}
- Role definitions: ${cohort.roles.length}
- Route definitions: ${cohort.routes.length}
- Betabook: ${betabookState?.enabled ? 'enabled' : 'disabled'}
- Betabook posts: ${betabookState?.enabled ? betabookState.posts.length : 0}
- Destiny: ${destinyState?.enabled ? 'enabled' : 'disabled'}
- Destiny threads: ${destinyState?.enabled ? destinyState.masterPlan.length : 0}
- Destiny matches messaged: ${destinyState?.enabled ? destinyState.masterPlan.filter((pair) => pair.status === 'matched_and_messaged').length : 0}
- LLM provider: ${llmStats.provider}
- LLM model: ${llmStats.model || 'provider default'}
- LLM calls: ${llmStats.calls}
- LLM failures: ${llmStats.failures}
- LLM fallbacks: ${llmStats.fallbacks}
- Bots: ${results.length}
- App URL: ${config.appUrl}
- Estimated minutes per bot: ${config.minutes}
- Minimum minutes per bot: ${config.minMinutes}
- Maximum minutes per bot: ${config.maxMinutes}
- Time scale: ${config.timeScale}
- Headless: ${config.headless}
- Concurrency: ${config.concurrency}
- Elapsed wall time: ${elapsedSeconds}s

## Happiness
- Happy bots (score >= 70): ${happy}/${results.length} (${Math.round((happy / results.length) * 100)}%)
- Unhappy bots (score < 50): ${unhappy}/${results.length} (${Math.round((unhappy / results.length) * 100)}%)
- Median score: ${median}

## Evidence
- Browser sessions completed: ${results.length}
- Screenshots captured: ${results.reduce((sum, result) => sum + result.screenshots, 0)}
- UI actions attempted: ${results.reduce((sum, result) => sum + result.actions, 0)}
- Thoughts expressed: ${results.reduce((sum, result) => sum + result.thoughts, 0)}
- Opinions expressed: ${results.reduce((sum, result) => sum + result.opinions, 0)}
- Ideas expressed: ${results.reduce((sum, result) => sum + (result.ideas || []).length, 0)}
- Betabook moments: ${results.reduce((sum, result) => sum + (result.betabookMoments || 0), 0)}
- Destiny nudges followed: ${results.reduce((sum, result) => sum + (result.destinyMoments || 0), 0)}
- Likes sent through UI: ${results.reduce((sum, result) => sum + (result.likes || 0), 0)}
- Passes through UI: ${results.reduce((sum, result) => sum + (result.passes || 0), 0)}
- Match messages sent through UI: ${results.reduce((sum, result) => sum + (result.messages || 0), 0)}
- Repeated screen penalty events: ${results.reduce((sum, result) => sum + (result.repeatedScreens || 0), 0)}
- Meaningful social actions: ${results.reduce((sum, result) => sum + (result.meaningfulSocialActions || 0), 0)}
- Betabook help requests: ${results.reduce((sum, result) => sum + (result.loopHelpRequests || 0), 0)}
- Destiny loop rescues followed: ${results.reduce((sum, result) => sum + (result.loopRescuesFollowed || 0), 0)}
- Curiosity actions: ${results.reduce((sum, result) => sum + (result.curiosityActions || 0), 0)}
- Error bots: ${errorBots.length}

## Top Bot Ideas
${topIdeas.length ? topIdeas.slice(0, 10).map(([idea, count]) => `- ${count} mentions: ${idea}`).join('\n') : '- None'}

## Betabook
${betabookState?.enabled
    ? [
      `- Posts: ${betabookState.posts.length}`,
      `- Comments: ${betabookState.comments.length}`,
      `- Invites: ${betabookState.invites.length}`,
      `- Events: ${betabookState.events.length}`,
      `- Errors: ${betabookState.errors.length ? betabookState.errors.slice(0, 20).join('; ') : 'none'}`,
    ].join('\n')
    : '- Disabled'}

## Destiny
${destinyState?.enabled
    ? [
      `- Backend URL: ${destinyState.backendUrl}`,
      `- Ready characters: ${Object.keys(destinyState.charactersByBotId).length}`,
      `- Master plan states: ${destinyState.masterPlan.map((pair) => `${pair.id}=${pair.intent}:${pair.status}`).join(', ')}`,
      `- Destiny events: ${destinyState.events.length}`,
      `- Destiny errors: ${destinyState.errors.length ? destinyState.errors.slice(0, 20).join('; ') : 'none'}`,
    ].join('\n')
    : '- Disabled'}

## LLM Mind Layer
- Provider: ${llmStats.provider}
- Model: ${llmStats.model || 'provider default'}
- Calls by task: ${Object.entries(llmStats.tasks).map(([task, count]) => `${task}=${count}`).join(', ') || 'none'}
- Recent errors: ${llmStats.errors.length ? llmStats.errors.slice(-10).join('; ') : 'none'}

## Interpretation
- Thoughtful mode launched real browser contexts, moved with human-paced waits, captured screenshots, and saved first-person raw thinking.
- Betabot reflections, social text, Betabook comments, and Destiny planning use the configured LLM provider unless the provider is disabled, exhausted, or unavailable.
- This mode evaluates comprehension and emotional product quality, not backend scale.

## Error Bots
${errorBots.length ? errorBots.map((bot) => `- ${bot.id}: ${bot.errors.join('; ')}`).join('\n') : '- None'}
`)
}

async function main() {
  const startedAt = Date.now()
  mkdirs()
  const bots = Array.from({ length: config.count }, (_, index) => personaAt(index))
  const betabookState = createBetabookState(bots)
  const destinyState = createDestinyState(bots)
  await initializeDestinyMasterPlan(bots, destinyState, betabookState)
  fs.writeFileSync(path.join(config.runDir, 'cohort.json'), JSON.stringify({
    config: publicConfig(),
    cohort: {
      appName: cohort.appName,
      source: cohort.source,
      roles: cohort.roles,
      routes: cohort.routes.map((route) => ({
        labels: route.labels.map((label) => label.toString()),
        fallback: route.fallback,
      })),
      keywords: cohort.keywords,
      ideaRules: cohort.ideaRules,
    },
    bots,
  }, null, 2))
  const playwright = await requirePlaywright()
  const browser = await playwright.chromium.launch({ headless: config.headless })
  const results = []
  writeBetabookState(betabookState)
  writeDestinyState(destinyState)
  const stopDestiny = startDestiny(bots, destinyState, betabookState)
  try {
    await runPool(bots, async (bot) => {
      results.push(await runBot(browser, bot, { betabookState, destinyState }))
    }, config.concurrency)
  } finally {
    await stopDestiny()
    await browser.close()
  }
  writeBetabookState(betabookState)
  writeDestinyState(destinyState)
  writeAnalysis(results, startedAt, betabookState, destinyState)
  console.log(JSON.stringify({
    runDir: config.runDir,
    bots: results.length,
    happy: results.filter((result) => result.score >= 70).length,
    unhappy: results.filter((result) => result.score < 50).length,
    errors: results.filter((result) => result.errors.length > 0).length,
    median: results.map((result) => result.score).sort((a, b) => a - b)[Math.floor(results.length * 0.5)] || 0,
    llm: {
      provider: llmStats.provider,
      model: llmStats.model,
      calls: llmStats.calls,
      failures: llmStats.failures,
      fallbacks: llmStats.fallbacks,
    },
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
