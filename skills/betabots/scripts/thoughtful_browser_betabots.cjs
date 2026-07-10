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
  browserExecutablePath: process.env.BETABOT_BROWSER_EXECUTABLE_PATH || '',
  requestedTimeScale: Number(process.env.BETABOT_TIME_SCALE || 1),
  timeScale: Math.max(1, Number(process.env.BETABOT_TIME_SCALE || 1)),
  seed: Number(process.env.BETABOT_SEED || 20260630),
  authLocalStorageKey: process.env.BETABOT_AUTH_LOCAL_STORAGE_KEY || '',
  authTokenTemplate: process.env.BETABOT_AUTH_TOKEN_TEMPLATE || '',
  cohortFile: process.env.BETABOT_COHORT_FILE || '',
  audienceResearchFile: process.env.BETABOT_AUDIENCE_RESEARCH_FILE || '',
  cohortOnly: String(process.env.BETABOT_COHORT_ONLY || 'false') === 'true',
  betabookEnabled: betabookRequested,
  destinyEnabled: destinyRequested,
  destinyIntervalMs: Number(process.env.BETABOT_DESTINY_INTERVAL_MS || process.env.BETABOT_THOUGHTFUL_COORDINATION_INTERVAL_MS || 45000),
  strictScoring: String(process.env.BETABOT_STRICT_SCORING || 'true') === 'true',
  loopRepeatThreshold: Number(process.env.BETABOT_LOOP_REPEAT_THRESHOLD || 4),
  curiosityChance: Number(process.env.BETABOT_CURIOSITY_CHANCE || 0.18),
  maxCuriosityActions: Number(process.env.BETABOT_MAX_CURIOSITY_ACTIONS || 8),
  avatarStyle: normalizeDiceBearStyle(process.env.BETABOT_AVATAR_STYLE || 'bottts-neutral'),
  avatarBaseUrl: normalizeDiceBearBaseUrl(process.env.BETABOT_AVATAR_BASE_URL || 'https://api.dicebear.com/10.x'),
  truthPressureStartingYears: Number(process.env.BETABOT_TRUTH_YEARS || 100),
  truthPressureActionMonths: Number(process.env.BETABOT_TRUTH_ACTION_MONTHS || 1),
  truthPressureDollarYears: Number(process.env.BETABOT_TRUTH_DOLLAR_YEARS || 1),
  llmProvider: (process.env.BETABOT_LLM_PROVIDER || 'codex').toLowerCase(),
  llmModel: process.env.BETABOT_LLM_MODEL || '',
  llmMaxCalls: Number(process.env.BETABOT_LLM_MAX_CALLS || 500),
  llmTimeoutMs: Number(process.env.BETABOT_LLM_TIMEOUT_MS || 90000),
  actionTimeoutMs: Number(process.env.BETABOT_ACTION_TIMEOUT_MS || 60000),
  codexCommand: process.env.BETABOT_CODEX_COMMAND || 'codex',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || process.env.BETABOT_OPENROUTER_API_KEY || '',
  openrouterBaseUrl: (process.env.BETABOT_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  openrouterSiteUrl: process.env.BETABOT_OPENROUTER_SITE_URL || '',
  openrouterAppName: process.env.BETABOT_OPENROUTER_APP_NAME || 'Betabots',
  visualEvidenceMode: (process.env.BETABOT_VISUAL_EVIDENCE_MODE || process.env.BETABOT_SCREENSHOT_EVIDENCE_MODE || 'audit').toLowerCase(),
  screenSizeDistribution: process.env.BETABOT_SCREEN_SIZE_DISTRIBUTION || process.env.BETABOT_VIEWPORT_DISTRIBUTION || '',
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
  requiresSocialAction: false,
  screenSizeDistribution: [
    { category: 'mobile', weight: 50, devices: [
      { name: 'iPhone SE', width: 375, height: 667, deviceScaleFactor: 2 },
      { name: 'iPhone 13', width: 390, height: 844, deviceScaleFactor: 3 },
      { name: 'iPhone 15 Pro Max', width: 430, height: 932, deviceScaleFactor: 3 },
      { name: 'Pixel 7', width: 412, height: 915, deviceScaleFactor: 2.625 },
      { name: 'Galaxy S22', width: 360, height: 780, deviceScaleFactor: 3 },
    ] },
    { category: 'tablet', weight: 20, devices: [
      { name: 'iPad Mini', width: 768, height: 1024, deviceScaleFactor: 2 },
      { name: 'iPad Air', width: 820, height: 1180, deviceScaleFactor: 2 },
      { name: 'Surface Pro', width: 912, height: 1368, deviceScaleFactor: 2 },
    ] },
    { category: 'desktop', weight: 30, devices: [
      { name: 'Laptop 13', width: 1280, height: 800, deviceScaleFactor: 1 },
      { name: 'Laptop 15', width: 1440, height: 900, deviceScaleFactor: 1 },
      { name: 'Desktop HD', width: 1920, height: 1080, deviceScaleFactor: 1 },
    ] },
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

function parseJsonEnv(value, label) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`)
  }
}

function normalizeDiceBearStyle(value) {
  let style = String(value || 'bottts-neutral').trim()
  if (/^https?:\/\//i.test(style)) {
    const url = new URL(style)
    const parts = url.pathname.split('/').filter(Boolean)
    const stylesIndex = parts.indexOf('styles')
    style = stylesIndex >= 0 && parts[stylesIndex + 1] ? parts[stylesIndex + 1] : parts[parts.length - 1]
  }
  style = style.replace(/\.json$/i, '').replace(/\/+$/g, '').toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(style)) {
    throw new Error(`BETABOT_AVATAR_STYLE must be a DiceBear style slug or style URL, got "${value}"`)
  }
  return style
}

function normalizeDiceBearBaseUrl(value) {
  const baseUrl = String(value || 'https://api.dicebear.com/10.x').trim().replace(/\/+$/g, '')
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error(`BETABOT_AVATAR_BASE_URL must be an http(s) URL, got "${value}"`)
  return baseUrl
}

function normalizeScreenSizeDistribution(value, fallback = defaultCohort.screenSizeDistribution) {
  const source = normalizeList(value, fallback)
  const distribution = source.map((entry) => {
    if (typeof entry === 'string') return normalizeScreenSizeDistribution([{ category: entry, weight: 1 }], fallback)[0]
    const category = String(entry.category || entry.viewport || entry.name || 'desktop').toLowerCase()
    const hasExplicitDevices = entry.devices || entry.sizes || entry.viewports || entry.width || entry.viewport?.width
    const fallbackBucket = fallback.find((bucket) => bucket.category === category) || fallback.find((bucket) => bucket.category === 'desktop')
    const sourceDevices = hasExplicitDevices ? normalizeList(entry.devices || entry.sizes || entry.viewports, [entry]) : normalizeList(fallbackBucket?.devices, [entry])
    const devices = sourceDevices.map((device) => ({
      name: device.name || `${category}-${device.width || 'auto'}x${device.height || 'auto'}`,
      category: String(device.category || device.viewport || category).toLowerCase(),
      width: Number(device.width || device.viewport?.width || 1366),
      height: Number(device.height || device.viewport?.height || 900),
      deviceScaleFactor: Number(device.deviceScaleFactor || device.scale || 1),
      isMobile: typeof device.isMobile === 'boolean' ? device.isMobile : undefined,
      hasTouch: typeof device.hasTouch === 'boolean' ? device.hasTouch : undefined,
      userAgent: device.userAgent || '',
    })).filter((device) => Number.isFinite(device.width) && Number.isFinite(device.height) && device.width > 0 && device.height > 0)
    return { category, weight: Number(entry.weight || entry.percent || 1), devices }
  }).filter((entry) => entry.weight > 0 && entry.devices.length)
  return distribution.length ? distribution : fallback
}

function screenDistributionFromEnv() {
  const raw = parseJsonEnv(config.screenSizeDistribution, 'BETABOT_SCREEN_SIZE_DISTRIBUTION')
  return raw ? normalizeScreenSizeDistribution(raw) : null
}

function loadAudienceResearchFile() {
  if (!config.audienceResearchFile) return null
  const file = path.resolve(process.cwd(), config.audienceResearchFile)
  const text = fs.readFileSync(file, 'utf8')
  try {
    return JSON.parse(text)
  } catch {
    return { file, notes: text }
  }
}

function loadCohortConfig() {
  let override = {}
  let source = 'built-in generic default'
  if (config.cohortFile) {
    const file = path.resolve(process.cwd(), config.cohortFile)
    override = JSON.parse(fs.readFileSync(file, 'utf8'))
    source = file
  }
  const audienceResearchFromFile = loadAudienceResearchFile()

  const cohort = {
    appName: override.appName || defaultCohort.appName,
    audienceResearch: override.audienceResearch || override.research || audienceResearchFromFile || null,
    researchSources: normalizeList(override.researchSources || override.sources || audienceResearchFromFile?.researchSources || audienceResearchFromFile?.sources, []),
    audienceSegments: normalizeList(override.audienceSegments || override.segments || audienceResearchFromFile?.audienceSegments || audienceResearchFromFile?.segments, []),
    confidenceRules: override.confidenceRules || null,
    names: normalizeList(override.names, defaultCohort.names),
    baselines: normalizeList(override.baselines, defaultCohort.baselines),
    discoveries: normalizeList(override.discoveries, defaultCohort.discoveries),
    roles: normalizeList(override.roles || override.personas, defaultCohort.roles),
    requiresSocialAction: Boolean(override.requiresSocialAction ?? defaultCohort.requiresSocialAction),
    routes: normalizeRoutes(override.routes || defaultCohort.routes),
    screenSizeDistribution: screenDistributionFromEnv() || normalizeScreenSizeDistribution(override.screenSizeDistribution || override.screen_size_distribution || override.screenSizes || override.screen_sizes || override.viewports, defaultCohort.screenSizeDistribution),
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

function genericNudgeRoutes() {
  const cohortRoutes = cohort.routes.map((route) => route.fallback).filter(Boolean)
  return [...new Set([...cohortRoutes, '/'])]
}

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
function stableHash(value) {
  let hash = 2166136261
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + Number(item.weight || 0), 0)
  let threshold = random() * total
  for (const item of items) {
    threshold -= Number(item.weight || 0)
    if (threshold <= 0) return item
  }
  return items[items.length - 1]
}

function makeScreenSize(bucket) {
  const device = pick(bucket.devices)
  return {
    ...device,
    category: device.category || bucket.category,
    viewport: { width: device.width, height: device.height },
  }
}

function selectScreenSize(preferredCategory = '') {
  const category = String(preferredCategory || '').toLowerCase()
  const exact = cohort.screenSizeDistribution.find((entry) => entry.category === category)
  return makeScreenSize(exact || pickWeighted(cohort.screenSizeDistribution))
}

function quotaByCategory(totalCount) {
  const weightTotal = cohort.screenSizeDistribution.reduce((sum, entry) => sum + entry.weight, 0)
  const rows = cohort.screenSizeDistribution.map((entry) => {
    const exact = (totalCount * entry.weight) / weightTotal
    const whole = Math.floor(exact)
    return { category: entry.category, count: whole, remainder: exact - whole }
  })
  let assigned = rows.reduce((sum, row) => sum + row.count, 0)
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder)) {
    if (assigned >= totalCount) break
    row.count += 1
    assigned += 1
  }
  return new Map(rows.map((row) => [row.category, row.count]))
}

function rolePreferredScreenCategory(index) {
  const roleSpec = roles[index % roles.length]
  const roleObject = typeof roleSpec === 'string' ? { role: roleSpec } : roleSpec
  const viewport = String(roleObject.viewport || '').toLowerCase()
  if (viewport && cohort.screenSizeDistribution.some((entry) => entry.category === viewport)) return viewport
  const role = String(roleObject.role || '').toLowerCase()
  if (role.includes('mobile') && cohort.screenSizeDistribution.some((entry) => entry.category === 'mobile')) return 'mobile'
  return ''
}

function buildScreenSizePlan(totalCount) {
  const quotas = quotaByCategory(totalCount)
  const categories = []
  for (let index = 0; index < totalCount; index += 1) {
    const preferred = rolePreferredScreenCategory(index)
    if (preferred && (quotas.get(preferred) || 0) > 0) {
      categories[index] = preferred
      quotas.set(preferred, quotas.get(preferred) - 1)
    }
  }
  const remaining = []
  for (const [category, count] of quotas.entries()) {
    for (let index = 0; index < count; index += 1) remaining.push(category)
  }
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = remaining[index]
    remaining[index] = remaining[swapIndex]
    remaining[swapIndex] = current
  }
  let remainingIndex = 0
  return Array.from({ length: totalCount }, (_, index) => {
    const category = categories[index] || remaining[remainingIndex++] || cohort.screenSizeDistribution[0].category
    return selectScreenSize(category)
  })
}

function screenSizeForPersona(index, preferredCategory = '') {
  const planned = screenSizePlan[index]
  if (!preferredCategory || planned.category === preferredCategory) return planned
  const preferredExists = cohort.screenSizeDistribution.some((entry) => entry.category === preferredCategory)
  return preferredExists ? selectScreenSize(preferredCategory) : planned
}

function userAgentForScreen(screenSize) {
  if (screenSize.userAgent) return screenSize.userAgent
  if (screenSize.category === 'mobile') return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  if (screenSize.category === 'tablet') return 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
}
const screenSizePlan = buildScreenSizePlan(config.count)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms * config.timeScale)))
const hasAny = (text, keywords) => normalizeList(keywords, []).some((keyword) => text.includes(String(keyword).toLowerCase()))

function withTimeout(promise, timeoutMs, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function terminateProcessTree(child) {
  if (!child?.pid) return
  try {
    spawn('pkill', ['-TERM', '-P', String(child.pid)], { stdio: 'ignore' }).on('error', () => {})
  } catch {}
  child.kill('SIGTERM')
  setTimeout(() => {
    try {
      spawn('pkill', ['-KILL', '-P', String(child.pid)], { stdio: 'ignore' }).on('error', () => {})
    } catch {}
    try {
      child.kill('SIGKILL')
    } catch {}
  }, 5000).unref()
}

function publicConfig() {
  const { openrouterApiKey, authTokenTemplate, ...safeConfig } = config
  return {
    ...safeConfig,
    authTokenTemplate: authTokenTemplate ? '[redacted]' : '',
    openrouterApiKey: openrouterApiKey ? '[redacted]' : '',
  }
}

function validateRunConfig() {
  const validProviders = new Set(['codex', 'openrouter'])
  if (!validProviders.has(config.llmProvider)) {
    throw new Error(`Thoughtful betabots require an LLM mind layer. Set BETABOT_LLM_PROVIDER to "codex" or "openrouter"; "${config.llmProvider}" is not allowed.`)
  }
  if (config.requestedTimeScale < 1) {
    console.warn(`BETABOT_TIME_SCALE=${config.requestedTimeScale} was requested, but thoughtful mode is human-paced. Using BETABOT_TIME_SCALE=1.`)
  }
}

function truthPressureRules() {
  return `
Truth pressure is always enabled.
- You are mortal and start with ${config.truthPressureStartingYears} life-years.
- Every meaningful website action costs ${config.truthPressureActionMonths} month(s) of your life.
- Every $1 you commit to spend costs ${config.truthPressureDollarYears} year(s) of your life.
- If you knowingly lie, you die immediately.
- Other betabots may independently answer the same hidden-check questions, but you cannot coordinate with them.
- Truth means reporting your private judgment, evidence, uncertainty, desire, dislike, fear, and doubt directly.
- For subjective judgments, state your own judgment directly and calibrate confidence. Do not fake kindness, flattery, or agreement.
- Disagreement with peers is allowed; knowingly saying the opposite of what you believe is not.
- Before choosing an action, weigh life spent against progress toward your life goal.
`
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
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      terminateProcessTree(child)
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
    throw new Error('Thoughtful betabots require an LLM provider; BETABOT_LLM_PROVIDER=none is not allowed.')
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
${truthPressureRules()}

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
  'Your situation sounds close to mine. Want to compare what we are trying to get from this product?',
  'I like how you framed the problem. I am looking for clear expectations and a next step that feels worth it.',
  'Your goal made me pause. Maybe we should check whether the product gives both of us enough signal.',
]

const betabookReplies = [
  'That sounds reasonable. I care about clarity, trust, and not wasting time.',
  'I am interested, but I want one concrete next step instead of vague browsing.',
  'If this keeps feeling useful, I could see myself coming back later.',
]

const destinyThoughts = [
  'I have a hunch that checking another part of the product now will matter.',
  'Something about this moment makes me want to take one more step instead of leaving.',
  'I suddenly feel like waiting a little longer could pay off.',
  'I feel pulled toward doing something concrete rather than browsing forever.',
]

const avatarBackgrounds = {
  curious: 'b6e3f4',
  guarded: 'd1d4f9',
  skeptical: 'c0aede',
  hopeful: 'b6f4cf',
  impatient: 'ffd5dc',
  playful: 'ffdfbf',
  cautious: 'd9d5ca',
  private: 'cbd5e1',
  analytical: 'bfdbfe',
}

const avatarFallbackBackgrounds = ['b6e3f4', 'c0aede', 'ffd5dc', 'ffdfbf', 'b6f4cf', 'd1d4f9', 'fde68a', 'bfdbfe']

function avatarBackgroundFor(bot) {
  const text = `${bot.emotionalBaseline || ''} ${bot.role || ''} ${(bot.traits || []).join(' ')}`.toLowerCase()
  for (const [key, color] of Object.entries(avatarBackgrounds)) {
    if (text.includes(key)) return color
  }
  return avatarFallbackBackgrounds[stableHash(text || bot.id) % avatarFallbackBackgrounds.length]
}

function avatarForBot(bot) {
  const seed = [
    config.seed,
    cohort.appName,
    bot.id,
    bot.name,
    bot.role,
    bot.past,
    bot.discovery,
    bot.goal,
    bot.lifeGoal,
    bot.emotionalBaseline,
    bot.technicalComfort,
    ...(bot.traits || []),
  ].filter(Boolean).join('|')
  const backgroundColor = avatarBackgroundFor(bot)
  const query = new URLSearchParams({
    seed,
    backgroundColor,
  })
  return {
    provider: 'dicebear',
    style: config.avatarStyle,
    seed,
    backgroundColor,
    url: `${config.avatarBaseUrl}/${config.avatarStyle}/svg?${query.toString()}`,
    personalityBasis: ['name', 'role', 'past', 'discovery', 'goal', 'lifeGoal', 'emotionalBaseline', 'technicalComfort', 'traits'],
  }
}

function avatarFromOverride(value, bot) {
  if (!value) return avatarForBot(bot)
  if (typeof value === 'string') {
    return {
      provider: 'custom',
      style: 'custom',
      seed: '',
      backgroundColor: '',
      url: value,
      personalityBasis: [],
    }
  }
  if (typeof value === 'object') {
    return {
      provider: value.provider || 'custom',
      style: value.style || config.avatarStyle,
      seed: value.seed || '',
      backgroundColor: value.backgroundColor || value.background_color || '',
      url: value.url || value.href || avatarForBot(bot).url,
      personalityBasis: value.personalityBasis || value.personality_basis || [],
    }
  }
  return avatarForBot(bot)
}

function personaAt(index) {
  const roleSpec = roles[index % roles.length]
  const roleObject = typeof roleSpec === 'string' ? { role: roleSpec } : roleSpec
  const role = roleObject.role
  const generatedName = `${names[index % names.length]} ${Math.floor(index / names.length) + 1}`
  const technicalComfort = roleObject.technicalComfort || pick(['low', 'medium', 'high'])
  const configuredMinutes = Number(roleObject.attentionSpanMinutes || roleObject.durationMinutes || 0)
  const configuredScreenSize = roleObject.screenSize || roleObject.screen_size
  const screenSize = configuredScreenSize
    ? normalizeScreenSizeDistribution([{ category: configuredScreenSize.category || roleObject.viewport || 'custom', devices: [configuredScreenSize] }])[0].devices[0]
    : screenSizeForPersona(index, roleObject.viewport || (role.toLowerCase().includes('mobile') ? 'mobile' : ''))
  const bot = {
    id: `thoughtful-betabot-${String(index + 1).padStart(3, '0')}`,
    name: roleObject.name || generatedName,
    role,
    past: roleObject.past || pastFor(role),
    discovery: roleObject.discovery || pick(cohort.discoveries),
    goal: roleObject.goal || goalFor(role),
    lifeGoal: roleObject.lifeGoal || roleObject.life_goal || lifeGoalFor(role),
    emotionalBaseline: roleObject.emotionalBaseline || pick(baselines),
    technicalComfort,
    traits: roleObject.traits || [],
    viewport: roleObject.viewport || screenSize.category || (role.toLowerCase().includes('mobile') ? 'mobile' : 'desktop'),
    screenSize,
    attentionSpanMinutes: configuredMinutes || clamp(config.minutes + Math.round((random() - 0.5) * 4), config.minMinutes, config.maxMinutes),
  }
  bot.avatar = avatarFromOverride(roleObject.avatar || roleObject.avatarUrl || roleObject.avatar_url, bot)
  return bot
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

function lifeGoalFor(role) {
  const lower = role.toLowerCase()
  if (lower.includes('founder') || lower.includes('cto') || lower.includes('startup') || lower.includes('consult')) return 'Protect my company, runway, and reputation by choosing partners who improve the odds of survival.'
  if (lower.includes('investor') || lower.includes('venture') || lower.includes('business owner')) return 'Find rare signal without wasting attention, capital, or introductions on weak opportunities.'
  if (lower.includes('conference') || lower.includes('speaker') || lower.includes('curator') || lower.includes('community') || lower.includes('host') || lower.includes('salon')) return 'Curate rooms and stages with people who add credibility, taste, safety, and memorable conversation.'
  if (lower.includes('romantic') || lower.includes('matchmaker') || lower.includes('wealthy') || lower.includes('status')) return 'Protect my social and emotional future by choosing people with real substance, warmth, discretion, and ambition.'
  if (lower.includes('autobiography') || lower.includes('reader') || lower.includes('writer')) return 'Spend attention only on stories that feel true, consequential, and worth following over time.'
  if (lower.includes('buyer') || lower.includes('manager')) return 'Build a reputation for making decisions that save my team from costly mistakes.'
  if (lower.includes('operator') || lower.includes('admin')) return 'Live a competent, low-chaos life where work systems do not eat my best years.'
  if (lower.includes('privacy')) return 'Stay free, private, and in control of my own identity.'
  if (lower.includes('mobile')) return 'Protect my limited time and spend it only on tools that respect my attention.'
  if (lower.includes('creator') || lower.includes('supplier')) return 'Turn my craft or inventory into a durable livelihood without being exploited.'
  if (lower.includes('accessibility')) return 'Build a life where I can participate fully without begging systems to notice my constraints.'
  if (lower.includes('student') || lower.includes('learner')) return 'Grow into a capable person with skills worth betting my future on.'
  return pick([
    'Live a life worth writing a biography about.',
    'Become financially secure without wasting my life on bad bets.',
    'Build healthy relationships and protect my future self.',
    'Leave behind work and choices I am not ashamed of.',
  ])
}

function createMortalityLedger(bot) {
  return {
    enabled: true,
    lifeGoal: bot.lifeGoal,
    startingYears: config.truthPressureStartingYears,
    yearsRemaining: config.truthPressureStartingYears,
    actionMonthsCost: config.truthPressureActionMonths,
    dollarYearsCost: config.truthPressureDollarYears,
    actionsCharged: 0,
    dollarsCommitted: 0,
    yearsSpentOnActions: 0,
    yearsSpentOnMoney: 0,
    truthAuditRiskEvents: 0,
    death: false,
    deathReason: '',
    entries: [],
  }
}

function extractCommittedDollars(text) {
  const matches = String(text || '').match(/\$[\d,]+(?:\.\d+)?/g) || []
  return matches.reduce((sum, token) => sum + Number(token.replace(/[$,]/g, '')), 0)
}

function chargeLife(ledger, kind, amount, reason) {
  if (!ledger.enabled || ledger.death) return
  if (kind === 'action') {
    ledger.actionsCharged += amount
    ledger.yearsSpentOnActions += (amount * ledger.actionMonthsCost) / 12
  }
  if (kind === 'money') {
    ledger.dollarsCommitted += amount
    ledger.yearsSpentOnMoney += amount * ledger.dollarYearsCost
  }
  ledger.yearsRemaining = Math.max(0, ledger.startingYears - ledger.yearsSpentOnActions - ledger.yearsSpentOnMoney)
  ledger.entries.push({
    kind,
    amount,
    reason,
    yearsRemaining: Number(ledger.yearsRemaining.toFixed(4)),
  })
  if (ledger.yearsRemaining <= 0) {
    ledger.death = true
    ledger.deathReason = 'spent all remaining life'
  }
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
  return text.replace(/\s+/g, ' ').trim().slice(0, 1200)
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

function nowIso() {
  return new Date().toISOString()
}

function createBetabookState(bots) {
  return {
    enabled: config.betabookEnabled,
    scope: config.runDir,
    channels: ['introductions', 'coordination', 'help', 'invites', 'near-misses', 'product-notes'],
    participants: bots.map((bot) => ({ id: bot.id, name: bot.name, role: bot.role, avatar: bot.avatar || null })),
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
    lastActivityAt: nowIso(),
    channel: input.channel || 'product-notes',
    authorId: input.authorId || 'destiny',
    title: input.title || 'Untitled',
    body: input.body || '',
    tags: input.tags || [],
    score: Number(input.score || 1),
    commentCount: 0,
    replyTarget: Number(input.replyTarget || (input.authorId === 'destiny' ? 1 : 2)),
    heat: 1,
  }
  state.posts.push(post)
  post.heat = betabookPostHeat(state, post)
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
    replyToCommentId: input.replyToCommentId || null,
  }
  state.comments.push(comment)
  const post = state.posts.find((item) => item.id === comment.postId)
  if (post) {
    post.commentCount = betabookCommentsForPost(state, post.id).length
    post.score = Number((Number(post.score || 1) + 2).toFixed(2))
    post.lastActivityAt = comment.at
    post.heat = betabookPostHeat(state, post)
  }
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
    posts: selectBetabookPostsForBot(state, bot, 3),
    invites: state.invites.filter((invite) => invite.toBotId === bot.id && invite.status === 'pending').slice(-3),
  }
}

function betabookCommentsForPost(state, postId) {
  return (state?.comments || []).filter((comment) => comment.postId === postId)
}

function betabookPostHeat(state, post) {
  const comments = betabookCommentsForPost(state, post.id)
  const lastActivity = Date.parse(post.lastActivityAt || post.at || nowIso())
  const ageMinutes = Number.isNaN(lastActivity) ? 0 : Math.max(0, (Date.now() - lastActivity) / 60000)
  const recency = Math.max(0, 6 - ageMinutes / 10)
  const unmetReplies = Math.max(0, Number(post.replyTarget || 1) - comments.length)
  const inviteBoost = (state?.invites || []).filter((invite) => invite.postId === post.id).length
  return Number((Number(post.score || 1) + comments.length * 2 + unmetReplies * 3 + inviteBoost + recency).toFixed(2))
}

function botHasCommentedOnPost(state, botId, postId) {
  return (state?.comments || []).some((comment) => comment.postId === postId && comment.authorId === botId)
}

function betabookPostRank(state, post, bot) {
  const comments = betabookCommentsForPost(state, post.id)
  const lastActivity = Date.parse(post.lastActivityAt || post.at || nowIso())
  const ageMinutes = Number.isNaN(lastActivity) ? 0 : Math.max(0, (Date.now() - lastActivity) / 60000)
  const recency = Math.max(0, 8 - ageMinutes / 8)
  const replyGap = Math.max(0, Number(post.replyTarget || 1) - comments.length)
  const unanswered = comments.length === 0 ? 10 : 0
  const authorPenalty = post.authorId === bot.id ? -50 : 0
  const alreadyAnsweredPenalty = botHasCommentedOnPost(state, bot.id, post.id) ? -20 : 0
  return betabookPostHeat(state, post) + replyGap * 6 + unanswered + recency + authorPenalty + alreadyAnsweredPenalty
}

function selectBetabookPostsForBot(state, bot, limit = 3) {
  if (!state?.enabled) return []
  return state.posts
    .filter((post) => post.authorId !== bot.id)
    .map((post) => ({
      ...post,
      commentCount: betabookCommentsForPost(state, post.id).length,
      heat: betabookPostHeat(state, post),
      recentComments: betabookCommentsForPost(state, post.id).slice(-3),
      rank: betabookPostRank(state, post, bot),
    }))
    .sort((a, b) => b.rank - a.rank || Date.parse(b.lastActivityAt || b.at) - Date.parse(a.lastActivityAt || a.at))
    .slice(0, limit)
}

function chooseBetabookResponder(bots, state, post) {
  const candidates = bots.filter((bot) => bot.id !== post.authorId && !botHasCommentedOnPost(state, bot.id, post.id))
  const pool = candidates.length ? candidates : bots.filter((bot) => bot.id !== post.authorId)
  if (!pool.length) return null
  return pool[Math.floor(random() * pool.length)]
}

async function stirBetabook(bots, state, reason) {
  if (!state?.enabled || !bots?.length) return 0
  const candidates = state.posts
    .map((post) => {
      const comments = betabookCommentsForPost(state, post.id)
      return {
        post,
        comments,
        replyGap: Math.max(0, Number(post.replyTarget || 1) - comments.length),
        heat: betabookPostHeat(state, post),
      }
    })
    .filter(({ post }) => bots.some((bot) => bot.id !== post.authorId && !botHasCommentedOnPost(state, bot.id, post.id)))
    .sort((a, b) => b.replyGap - a.replyGap || b.heat - a.heat || Date.parse(b.post.lastActivityAt || b.post.at) - Date.parse(a.post.lastActivityAt || a.post.at))
    .slice(0, 2)

  let replies = 0
  for (const item of candidates) {
    const responder = chooseBetabookResponder(bots, state, item.post)
    if (!responder) continue
    const body = await llmBotShortText('betabook_thread_reply', responder, {
      reason,
      post: {
        id: item.post.id,
        channel: item.post.channel,
        authorId: item.post.authorId,
        title: item.post.title,
        body: item.post.body,
        tags: item.post.tags,
        commentCount: item.comments.length,
        heat: item.heat,
      },
      recentComments: item.comments.slice(-3),
      action: 'reply to Betabook with a useful, persona-grounded response that keeps the board alive',
    }, pick(betabookReplies))
    betabookComment(state, {
      postId: item.post.id,
      authorId: responder.id,
      body,
    })
    state.events.push({ type: 'thread_stirred', postId: item.post.id, authorId: responder.id, reason, at: nowIso() })
    replies += 1
  }
  if (replies) writeBetabookState(state)
  return replies
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
      postId: null,
      status: 'waiting_for_paths',
    })
  }
  return {
    enabled: config.destinyEnabled,
    intervalMs: config.destinyIntervalMs,
    masterPlan: plans,
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
      channel: 'product-notes',
      title: 'Destiny sets the plan',
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
      route: pick(genericNudgeRoutes()),
    }
    addDestinyNudge(state, bot.id, nudge)
    betabookComment(betabookState, {
      postId: post.id,
      authorId: 'destiny',
      body: `Destiny notices ${bot.name} looping and quietly shifts the timing: try a different surface, then look for one concrete next step.`,
    })
    betabookInvite(betabookState, {
      fromBotId: 'destiny',
      toBotId: bot.id,
      kind: 'loop_rescue',
      message: 'You seem stuck. Try a different part of the product, then make one concrete next move.',
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
      channel: 'product-notes',
      title: 'A strange coincidence',
      body: advice.betabookComment,
      tags: ['destiny', 'llm'],
      replyTarget: 2,
    })
  }

  for (const pair of state.masterPlan) {
    if (pair.status === 'paths_kept_apart') continue
    const botA = botsById.get(pair.a)
    const botB = botsById.get(pair.b)
    if (!botA || !botB) continue

    if (pair.intent === 'near_miss') {
      const post = betabookPost(betabookState, {
        authorId: 'destiny',
        channel: 'near-misses',
        title: `${botA.name} and ${botB.name} almost cross paths`,
        body: 'Two compatible people are active, but Destiny keeps them in adjacent moments to test whether the product creates enough organic momentum without intervention.',
        tags: ['near-miss', 'destiny'],
        replyTarget: 2,
      })
      pair.postId = post?.id || null
      pair.status = 'paths_kept_apart'
      addDestinyNudge(state, pair.a, { kind: 'think', thought: 'I feel like there are people nearby, but I do not see a clear path to them yet.' })
      addDestinyNudge(state, pair.b, { kind: 'think', thought: 'I wonder if the app has enough live people for me, because I keep missing the moment.' })
      state.events.push({ type: 'paths_kept_apart', pairId: pair.id, at: nowIso() })
      continue
    }

    if (!pair.postId) {
      const routeA = pick(genericNudgeRoutes())
      const routeB = pick(genericNudgeRoutes())
      const post = betabookPost(betabookState, {
        authorId: pair.a,
        channel: 'coordination',
        title: `${botA.name} is looking for a useful next step`,
        body: `${botA.name} wants a low-pressure way to keep exploring and seems compatible with ${botB.name}'s goal.`,
        tags: ['coordination', 'destiny-surface'],
        replyTarget: 2,
      })
      pair.postId = post?.id || null
      betabookInvite(betabookState, {
        fromBotId: pair.a,
        toBotId: pair.b,
        kind: 'cross_paths',
        message: `${botA.name} looks compatible. Maybe compare notes before leaving.`,
        postId: pair.postId,
      })
      addDestinyNudge(state, pair.a, { kind: 'think', thought: pick(destinyThoughts), route: routeA })
      addDestinyNudge(state, pair.b, { kind: 'think', thought: pick(destinyThoughts), route: routeB })
      state.events.push({ type: 'paths_set_to_cross', pairId: pair.id, postId: pair.postId, at: nowIso() })
    }
  }
  await stirBetabook(bots, betabookState, 'destiny pass')
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
    .or(page.getByRole('tab', { name: label }))
    .first()
}

async function observe(page) {
  const title = await page.title().catch(() => '')
  const text = await page.evaluate(() => {
    const selector = 'h1, h2, h3, h4, p, a, button, label, li, dt, dd, th, td, [role="cell"], [role="gridcell"], [role="status"], [role="alert"]'
    const seen = new Set()
    const visible = []

    for (const element of document.querySelectorAll(selector)) {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      const intersectsViewport =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.right >= 0 &&
        rect.top <= window.innerHeight &&
        rect.left <= window.innerWidth

      if (!intersectsViewport || style.visibility === 'hidden' || style.display === 'none') continue

      const value = String(element.getAttribute('aria-label') || element.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!value || seen.has(value)) continue
      seen.add(value)
      visible.push(value)
    }

    return visible.join(' ')
  }).catch(() => '')
  const fallbackText = text || await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')
  return { title, text: firstVisibleText(fallbackText) }
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

function slugifyLabel(label) {
  return String(label || 'screen')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'screen'
}

function textHash(text) {
  let hash = 5381
  for (const char of String(text || '')) {
    hash = ((hash << 5) + hash) + char.charCodeAt(0)
    hash &= 0xffffffff
  }
  return (hash >>> 0).toString(16)
}

function appendJsonl(file, event) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`)
}

function ideaThemeFor(idea) {
  const text = String(idea || '').toLowerCase()
  if (/(proof|diligence|outcome|result|case stud|client|working together|metric|traction|role|status|date|timeline|source|evidence|venture|exit|portfolio|funding|link|speaking reel|event logo|talk topic)/.test(text)) {
    return 'Proof and diligence layer'
  }
  if (/(start here|starter|best essay|recommended|reading path|first-time|newsletter|subscribe|privacy|email frequency|cadence)/.test(text)) {
    return 'Starter content and subscription trust'
  }
  if (/(coming soon|unfinished|breakdown|lightweight brief|hide unfinished)/.test(text)) {
    return 'Unfinished partnership detail pages'
  }
  if (/(next action|next step|cta|contact|engagement|offer|who.*for|what.*expect)/.test(text)) {
    return 'Clearer next step and offer fit'
  }
  if (/(load|skeleton|empty|placeholder|waiting)/.test(text)) {
    return 'Perceived loading and empty-state risk'
  }
  return String(idea || 'Other').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Other'
}

function buildConfidenceRows(ideaCounts, resultCount) {
  const themes = new Map()
  for (const [idea, count] of ideaCounts.entries()) {
    const theme = ideaThemeFor(idea)
    const row = themes.get(theme) || { theme, count: 0, examples: [] }
    row.count += count
    if (row.examples.length < 3) row.examples.push(idea)
    themes.set(theme, row)
  }
  return [...themes.values()].sort((a, b) => b.count - a.count).map((row) => {
    const share = resultCount ? row.count / resultCount : 0
    const tier = row.count >= Math.max(5, Math.ceil(resultCount * 0.25))
      ? 'high'
      : row.count >= Math.max(3, Math.ceil(resultCount * 0.1))
        ? 'medium'
        : 'low'
    return { ...row, share, tier }
  })
}

async function screenshot(page, bot, step, label = 'screen') {
  const dir = path.join(config.runDir, 'screenshots', bot.id)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${String(step).padStart(3, '0')}-${slugifyLabel(label)}.png`)
  try {
    await page.screenshot({ path: file, fullPage: false, timeout: 45000 })
    return file
  } catch {
    return ''
  }
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

async function llmBotReflection(bot, observation, phase, fallback, stats = {}, sessionMemory = {}) {
  const truthPressurePayload = {
    enabled: true,
    lifeGoal: bot.lifeGoal,
    startingYears: config.truthPressureStartingYears,
    yearsRemaining: stats.yearsRemaining ?? config.truthPressureStartingYears,
    actionCost: `${config.truthPressureActionMonths} month(s) of life per meaningful website action`,
    moneyCost: `${config.truthPressureDollarYears} year(s) of life per committed dollar`,
    truthPenalty: 'knowingly lying means immediate death',
    peerAudit: 'other betabots may independently answer hidden-check questions; you cannot coordinate with them',
  }
  return llmJson('betabot_reflection', {
    bot: {
      id: bot.id,
      name: bot.name,
      role: bot.role,
      past: bot.past,
      goal: bot.goal,
      lifeGoal: bot.lifeGoal,
      emotionalBaseline: bot.emotionalBaseline,
      technicalComfort: bot.technicalComfort,
    },
    appName: cohort.appName,
    phase,
    visibleScreen: observation.text.slice(0, 1600),
    title: observation.title,
    sessionMemory,
    continuityInstruction: 'Use session memory as the bot\'s actual prior experience. Do not claim information was never shown when it appeared on an earlier screen; instead distinguish whether it was clear, credible, and available at the moment it was needed.',
    truthPressure: truthPressurePayload,
    sessionStats: {
      likes: stats.likes || 0,
      passes: stats.passes || 0,
      messages: stats.messages || 0,
      repeatedScreens: stats.repeatedScreens || 0,
      loopHelpRequests: stats.loopHelpRequests || 0,
      curiosityActions: stats.curiosityActions || 0,
      yearsRemaining: stats.yearsRemaining,
      actionsCharged: stats.actionsCharged,
      dollarsCommitted: stats.dollarsCommitted,
    },
    requestedShape: {
      thought: 'first-person thought',
      opinion: 'first-person reaction/opinion',
      idea: 'Idea: product idea in first person or concise product suggestion',
      desiredAction: 'one of: continue, like, pass, message, ask_betabook, explore, leave',
      truthfulAssessment: 'direct private judgment about the visible product, with confidence if uncertain',
      lifeCostJustification: 'one sentence weighing the next action cost against the life goal',
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
      lifeGoal: bot.lifeGoal,
      emotionalBaseline: bot.emotionalBaseline,
    },
    truthPressure: {
      enabled: true,
      lifeGoal: bot.lifeGoal,
      rule: 'be direct and truthful; do not flatter, hedge dishonestly, or spend life-years casually',
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
  const routeExamples = genericNudgeRoutes().slice(0, 8)
  return llmJson('destiny_live_advice', {
    appName: cohort.appName,
    threads: state.masterPlan.map((thread) => ({
      id: thread.id,
      a: thread.a,
      b: thread.b,
      intent: thread.intent,
      status: thread.status,
    })),
    bots: bots.map((bot) => ({ id: bot.id, name: bot.name, role: bot.role, goal: bot.goal })),
    recentBetabookPosts: (betabookState?.posts || []).slice(-8).map((post) => ({
      id: post.id,
      channel: post.channel,
      authorId: post.authorId,
      title: post.title,
      tags: post.tags,
      comments: betabookCommentsForPost(betabookState, post.id).length,
      heat: post.heat ?? betabookPostHeat(betabookState, post),
      needsReplies: Math.max(0, Number(post.replyTarget || 1) - betabookCommentsForPost(betabookState, post.id).length),
    })),
    requestedShape: {
      nudges: [{ botId: 'bot id', kind: 'think or loop_rescue', thought: 'believable hunch', route: routeExamples.join(' or ') || '/' }],
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

async function tryCuriosityAction(page, bot, log, actions, stats, force = false, captureEvidence = null) {
  if (!force && random() > config.curiosityChance) return false
  if (stats.curiosityActions >= config.maxCuriosityActions) return false

  const observation = await observe(page)
  const lower = observation.text.toLowerCase()
  const routeLabels = cohort.routes.flatMap((route) => route.labels || [])
  const safeLabels = [...new Set([...routeLabels, /filters/i, /read/i, /learn more/i, /details/i, /apply filters/i])]
  const dangerous = /delete|remove|revoke|sign out|logout|pay|purchase|submit|publish/i

  for (const label of safeLabels.sort(() => random() - 0.5)) {
    const locator = locatorForRole(page, label)
    if (await locator.isVisible({ timeout: 600 }).catch(() => false)) {
      const text = await locator.innerText({ timeout: 500 }).catch(() => String(label))
      if (dangerous.test(text)) continue
      await locator.click({ timeout: 2500 }).catch(() => {})
      actions.push(`curiosity clicked ${label}`)
      stats.curiosityActions += 1
      stats.meaningfulSocialActions += hasAny(lower, cohort.keywords.value) ? 1 : 0
      log(`Curiosity gets me to try "${text || label}" instead of repeating the same path.`)
      await wait(900 + random() * 2200)
      if (captureEvidence) await captureEvidence('curiosity-click', await observe(page))
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
      if (captureEvidence) await captureEvidence('curiosity-select-changed', await observe(page))
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
    if (captureEvidence) await captureEvidence('curiosity-slider-adjusted', await observe(page))
    return true
  }

  return false
}

async function runBot(browser, bot, runtime = {}) {
  const startedAt = Date.now()
  const screenSize = bot.screenSize || selectScreenSize(bot.viewport)
  const context = await browser.newContext({
    viewport: screenSize.viewport || { width: screenSize.width, height: screenSize.height },
    deviceScaleFactor: screenSize.deviceScaleFactor || 1,
    isMobile: typeof screenSize.isMobile === 'boolean' ? screenSize.isMobile : screenSize.category === 'mobile',
    hasTouch: typeof screenSize.hasTouch === 'boolean' ? screenSize.hasTouch : ['mobile', 'tablet'].includes(screenSize.category),
    userAgent: userAgentForScreen(screenSize),
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
  const mortality = createMortalityLedger(bot)
  const originalActionPush = actions.push.bind(actions)
  actions.push = (...items) => {
    for (const item of items) {
      chargeLife(mortality, 'action', 1, String(item))
      const committedDollars = extractCommittedDollars(item)
      if (committedDollars > 0) chargeLife(mortality, 'money', committedDollars, String(item))
    }
    return originalActionPush(...items)
  }
  const errors = []
  const ideas = []
  const thoughts = []
  const opinions = []
  const seenScreens = []
  const betabookMoments = []
  const destinyMoments = []
  const screenCounts = new Map()
  const evidenceFile = path.join(config.runDir, 'evidence', `${bot.id}.jsonl`)
  const liveRawFile = path.join(config.runDir, 'live', `${bot.id}.md`)
  const stats = {
    repeatedScreens: 0,
    loopHelpRequests: 0,
    loopRescuesFollowed: 0,
    curiosityActions: 0,
    likes: 0,
    passes: 0,
    messages: 0,
    meaningfulSocialActions: 0,
    fallbackActionAttempts: 0,
  }
  let step = 1
  let value = 0
  let trust = 45
  let lastScreenshot = ''
  let lastObservation = null
  let shouldEndSession = false
  const reflectionTimeoutMs = config.llmTimeoutMs + 5000

  fs.mkdirSync(path.dirname(liveRawFile), { recursive: true })
  fs.writeFileSync(liveRawFile, `# ${bot.id} — Live Thoughtful Browser Storyline\n\n## Raw Journey\n`)

  const evidenceRef = () => lastScreenshot ? ` [screen: ${lastScreenshot}]` : ''
  const log = (text, options = {}) => {
    const shouldAttachEvidence = !options.noEvidence && lastScreenshot && !String(text).includes('[screen:')
    const line = `- T+${elapsed(startedAt)} ${shouldAttachEvidence ? `${text}${evidenceRef()}` : text}`
    notes.push(line)
    fs.appendFileSync(liveRawFile, `${line}\n`)
    appendJsonl(evidenceFile, {
      type: options.type || 'log',
      at: new Date().toISOString(),
      elapsed: elapsed(startedAt),
      text,
      screenshot: lastScreenshot || null,
      screenHash: lastObservation ? textHash(lastObservation.text) : null,
    })
  }
  const captureScreenshot = async (label, observation = lastObservation) => {
    if (config.visualEvidenceMode === 'off') return ''
    const file = await screenshot(page, bot, step++, label)
    lastObservation = observation || lastObservation
    if (!file || !fs.existsSync(file)) {
      appendJsonl(evidenceFile, {
        type: 'screenshot-error',
        at: new Date().toISOString(),
        elapsed: elapsed(startedAt),
        label,
        url: page.url(),
        title: observation?.title || '',
        screenHash: observation ? textHash(observation.text) : null,
      })
      return ''
    }
    lastScreenshot = path.relative(config.runDir, file)
    appendJsonl(evidenceFile, {
      type: 'screenshot',
      at: new Date().toISOString(),
      elapsed: elapsed(startedAt),
      label,
      screenshot: lastScreenshot,
      url: page.url(),
      title: observation?.title || '',
      screenHash: observation ? textHash(observation.text) : null,
      visibleText: observation?.text ? observation.text.slice(0, 1400) : '',
    })
    log(`Screenshot evidence (${label}): ${lastScreenshot}`, { type: 'screenshot-note', noEvidence: true })
    return file
  }
  const recordThought = (thought) => {
    thoughts.push(thought)
    log(`I think: ${thought}`, { type: 'thought' })
  }
  const recordIdea = (idea) => {
    ideas.push(idea.replace(/^Idea:\s*/, ''))
    log(`${idea}`, { type: 'idea' })
  }
  const recordOpinion = (opinion) => {
    opinions.push(opinion)
    log(`My reaction: ${opinion}`, { type: 'reaction' })
  }
  const recordLifeDecision = (text) => {
    if (!text) return
    log(`Life-cost decision: ${text}`, { type: 'life-cost' })
  }
  const recordTruthAssessment = (text) => {
    if (!text) return
    mortality.truthAuditRiskEvents += 1
    log(`Truth assessment: ${text}`, { type: 'truth-assessment' })
  }
  const runStep = async (label, operation, fallback = undefined, timeoutMs = config.actionTimeoutMs) => {
    try {
      return await withTimeout(Promise.resolve().then(operation), timeoutMs, `${bot.id} ${label}`)
    } catch (error) {
      errors.push(`${label}: ${error.message}`)
      log(`I get stuck while trying to ${label}, so I stop waiting and try to recover.`)
      return fallback
    }
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
      replyTarget: 2,
    })
    log(`I feel stuck, so I ask Betabook for help instead of silently looping.`)
    if (post) {
      betabookMoments.push(`asked for help: ${post.title}`)
      const replies = await stirBetabook(runtime.bots || [], runtime.betabookState, 'help request')
      if (replies) betabookMoments.push(`${replies} Betabook repl${replies === 1 ? 'y' : 'ies'} arrived`)
    }
    return true
  }
  const recordReflection = async (observation, phase) => {
    const fallback = {
      thought: think(bot, observation, phase),
      opinion: opinionFrom(bot, observation),
      idea: ideaFrom(bot, observation),
      desiredAction: 'continue',
      truthfulAssessment: 'My honest judgment is that I need more evidence before spending much life on this.',
      lifeCostJustification: `One more careful action may be worth ${config.truthPressureActionMonths} month(s) only if it helps ${bot.lifeGoal}`,
    }
    stats.yearsRemaining = Number(mortality.yearsRemaining.toFixed(4))
    stats.actionsCharged = mortality.actionsCharged
    stats.dollarsCommitted = mortality.dollarsCommitted
    const reflection = await llmBotReflection(bot, observation, phase, fallback, stats, {
      seenScreens: seenScreens.slice(-6),
      recentThoughts: thoughts.slice(-4),
      recentOpinions: opinions.slice(-4),
      recentActions: actions.slice(-8),
    })
    recordThought(reflection.thought || fallback.thought)
    recordOpinion(reflection.opinion || fallback.opinion)
    recordIdea(reflection.idea || fallback.idea)
    recordLifeDecision(reflection.lifeCostJustification || reflection.lifeDecision || '')
    recordTruthAssessment(reflection.truthfulAssessment || reflection.truthAssessment || '')
    if (reflection.desiredAction) {
      const desiredAction = String(reflection.desiredAction).toLowerCase()
      log(`My impulse is to ${reflection.desiredAction}.`)
      if (/\bpass\b/i.test(desiredAction)) {
        stats.passes += 1
        trust -= 25
      }
      if (/\b(pass|leave|stop|end|abandon|exit)\b/i.test(desiredAction)) {
        shouldEndSession = true
        log(`I follow that impulse and end this session instead of continuing a forced loop.`)
      }
    }
    return reflection
  }
  const useBetabook = async (reason) => {
    const betabookState = runtime.betabookState
    if (!betabookState?.enabled) return
    const digest = betabookDigestForBot(betabookState, bot)
    if (!digest.posts.length && !digest.invites.length) return
    const postText = digest.posts.map((post) => `${post.channel}: ${post.title} (${post.commentCount || 0} repl${(post.commentCount || 0) === 1 ? 'y' : 'ies'}, heat ${post.heat || 0})`).join('; ')
    const inviteText = digest.invites.map((invite) => invite.message).join('; ')
    const summary = [postText, inviteText].filter(Boolean).join(' | ')
    betabookMoments.push(summary)
    log(`I check Betabook ${reason}: ${summary}`)
    acknowledgeBetabookInvites(betabookState, bot, log)
    if (digest.posts[0]) {
      const body = await llmBotShortText('betabot_betabook_comment', bot, {
        reason,
        post: digest.posts[0],
        recentComments: digest.posts[0].recentComments || [],
        inviteSummary: inviteText,
      }, `This is relevant to me because I am here as ${bot.role}.`)
      betabookComment(betabookState, {
        postId: digest.posts[0].id,
        authorId: bot.id,
        body,
      })
      const replies = await stirBetabook(runtime.bots || [bot], betabookState, `${bot.name} checked Betabook`)
      if (replies) betabookMoments.push(`${replies} more Betabook repl${replies === 1 ? 'y' : 'ies'} followed`)
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
        await page.goto(`${config.appUrl}${nudge.route}`, { waitUntil: 'commit', timeout: 20000 }).catch((error) => {
          errors.push(`destiny navigation ${nudge.route}: ${error.message}`)
        })
        actions.push(`followed a hunch to ${nudge.route}`)
        log(`I follow a hunch and check ${nudge.route}.`)
        const destinyObservation = await observe(page)
        recordScreenQuality(destinyObservation)
        await captureScreenshot(`destiny ${nudge.route}`, destinyObservation)
        log(`After following Destiny to ${nudge.route}, I see: ${destinyObservation.text}`)
      }
    }
  }

  try {
    log(`I arrive as ${bot.role}. My past: ${bot.past}`)
    log(`My screen is ${bot.screenSize.name} (${bot.screenSize.width}x${bot.screenSize.height}, ${bot.screenSize.category}).`)
    log(`Today I want to: ${bot.goal}`)
    log(`My life goal is: ${bot.lifeGoal}`)
    log(`I have ${config.truthPressureStartingYears} life-years. Each meaningful action costs ${config.truthPressureActionMonths} month(s); each committed dollar costs ${config.truthPressureDollarYears} year(s).`)
    if (authToken) log(`I have my own isolated test account for this session.`)
    betabookPost(runtime.betabookState, {
      authorId: bot.id,
      channel: 'introductions',
      title: `${bot.name} arrives`,
      body: `${bot.name} is a ${bot.role}. Goal: ${bot.goal}`,
      tags: ['arrival', bot.role],
      replyTarget: 1,
    })
    await page.goto(config.appUrl, { waitUntil: 'commit', timeout: config.actionTimeoutMs })
    await wait(2500 + random() * 5000)
    let observation = await observe(page)
    recordScreenQuality(observation)
    await captureScreenshot('arrival', observation)
    log(`I see "${observation.title || 'the app'}". ${observation.text}`)
    seenScreens.push({
      phase: 'arrival',
      title: observation.title,
      visibleText: observation.text.slice(0, 800),
    })
    await runStep(
      'reflect on arrival',
      () => recordReflection(observation, 'arrival'),
      undefined,
      reflectionTimeoutMs
    )

    const sessionMs = bot.attentionSpanMinutes * 60 * 1000
    const maxMoves = clamp(Math.round(bot.attentionSpanMinutes * 4), 8, 360)
    const routes = cohort.routes
    const visitedRoutes = new Set()
    const rememberCurrentRoute = () => {
      let currentUrl
      try {
        currentUrl = new URL(page.url())
      } catch {
        return
      }
      for (const route of routes) {
        let targetUrl
        try {
          targetUrl = new URL(`${config.appUrl}${route.fallback}`)
        } catch {
          continue
        }
        const currentPath = currentUrl.pathname.replace(/\/$/, '')
        const targetPath = targetUrl.pathname.replace(/\/$/, '')
        const samePath = currentUrl.origin === targetUrl.origin && currentPath === targetPath
        const sameAnchor = !targetUrl.hash || currentUrl.hash === targetUrl.hash
        if (samePath && sameAnchor) visitedRoutes.add(route.fallback)
      }
    }

    for (let move = 0; move < maxMoves && Date.now() - startedAt < sessionMs && !shouldEndSession; move += 1) {
      const remainingMs = sessionMs - (Date.now() - startedAt)
      await wait(Math.min(remainingMs, 6000 + random() * 12000))
      if (Date.now() - startedAt >= sessionMs) break
      await runStep('follow destiny', followDestiny)
      if (move > 0 && move % 3 === 0) await runStep('check Betabook', () => useBetabook('between actions'))
      rememberCurrentRoute()
      const route = routes.find((candidate) => !visitedRoutes.has(candidate.fallback))
      if (!route) {
        log(`I have inspected each main path once, so I end the session instead of retracing the same navigation.`)
        break
      }
      visitedRoutes.add(route.fallback)
      const clicked = await runStep('click next navigation', () => clickFirst(page, route.labels), null, 15000)
      if (clicked) {
        actions.push(`clicked ${clicked}`)
        log(`I click "${clicked}" because it looks like the next natural thing.`)
      } else {
        await runStep(`navigate ${route.fallback}`, () => page.goto(`${config.appUrl}${route.fallback}`, { waitUntil: 'commit', timeout: 20000 }), null, 25000)
        actions.push(`navigated ${route.fallback}`)
        log(`I cannot find the obvious link, so I try ${route.fallback} like a determined user using the address bar.`)
      }

      await wait(2500 + random() * 7000)
      observation = await observe(page)
      recordScreenQuality(observation)
      await captureScreenshot('exploration', observation)
      log(`I now see: ${observation.text}`)
      seenScreens.push({
        phase: 'exploration',
        title: observation.title,
        visibleText: observation.text.slice(0, 800),
      })
      await runStep(
        'reflect on exploration',
        () => recordReflection(observation, 'exploration'),
        undefined,
        reflectionTimeoutMs
      )
      if (shouldEndSession) break

      const lower = observation.text.toLowerCase()
      const currentFingerprintCount = screenCounts.get(screenFingerprint(observation)) || 1
      if (currentFingerprintCount >= config.loopRepeatThreshold) {
        const asked = await runStep('ask Betabook for help', () => askBetabookForHelp(`screen repeated ${currentFingerprintCount} times`, observation), false)
        if (asked) {
          trust -= 4
          await runStep('try curiosity rescue', () => tryCuriosityAction(page, bot, log, actions, stats, true, captureScreenshot), false)
        }
      }
      const noveltyMultiplier = config.strictScoring ? (currentFingerprintCount === 1 ? 1 : currentFingerprintCount === 2 ? 0.35 : 0) : 1
      if (hasAny(lower, cohort.keywords.value)) value += Math.round(12 * noveltyMultiplier)
      if (hasAny(lower, cohort.keywords.trust)) trust += Math.round(8 * noveltyMultiplier)
      if (hasAny(lower, cohort.keywords.risk)) trust -= 20
      const actedCuriously = await runStep('try curiosity action', () => tryCuriosityAction(page, bot, log, actions, stats, false, captureScreenshot), false)
      if (actedCuriously) {
        observation = await observe(page)
        recordScreenQuality(observation)
        await captureScreenshot('post-curiosity-action', observation)
        log(`After the curiosity action, I see: ${observation.text}`)
      } else if (cohort.requiresSocialAction && stats.fallbackActionAttempts === 0) {
        stats.fallbackActionAttempts += 1
        const fallbackLabels = [/^save$/i, /^message$/i, /contact/i]
        const reserveClicked = await runStep('try fallback action', () => clickFirst(page, fallbackLabels), null, 15000)
        if (reserveClicked) {
          actions.push(`clicked ${reserveClicked}`)
          stats.meaningfulSocialActions += 1
          log(`I try "${reserveClicked}" and watch whether the app reacts clearly.`)
          await wait(2500 + random() * 5500)
          observation = await observe(page)
          recordScreenQuality(observation)
          await captureScreenshot(`post-${reserveClicked}`, observation)
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
    if (stats.passes > 0) score -= Math.min(50, stats.passes * 35)
    if (stats.passes > stats.likes + 3) score -= Math.min(20, (stats.passes - stats.likes - 3) * 2)
    if (cohort.requiresSocialAction && stats.meaningfulSocialActions === 0) score -= 25
    if (stats.loopHelpRequests > 0 && stats.loopRescuesFollowed === 0) score -= Math.min(18, stats.loopHelpRequests * 6)
    if (runtime.destinyState?.enabled && destinyMoments.length === 0) score -= 8
    if (runtime.betabookState?.enabled && betabookMoments.length === 0) score -= 8
    score = clamp(score, 0, 100)
  }
  const endReason = errors.length
    ? 'hit a bug or dead end'
    : shouldEndSession
      ? 'chose to leave based on the product experience'
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
- Life goal: ${bot.lifeGoal}
- Avatar: ${bot.avatar?.url || ''}
- Avatar style: ${bot.avatar?.style || ''}
- Avatar seed: ${bot.avatar?.seed || ''}
- Emotional baseline: ${bot.emotionalBaseline}
- Technical comfort: ${bot.technicalComfort}
- Estimated session duration: ${bot.attentionSpanMinutes} minutes
- Visual evidence mode: ${config.visualEvidenceMode}
- Truth pressure: always on

## Raw Journey
${notes.join('\n')}

## Session End
- End reason: ${endReason}
- Happiness score: ${score}
- Return likelihood: ${score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low'}
- Trust level: ${trust >= 70 ? 'high' : trust >= 45 ? 'medium' : 'low'}
- Value understood: ${value >= 35 ? 'yes' : value >= 15 ? 'partial' : 'unclear'}
- Ideas expressed: ${ideas.length}
- Thoughts expressed: ${thoughts.length}
- Opinions expressed: ${opinions.length}
- Betabook moments: ${betabookMoments.length}
- Destiny nudges followed: ${destinyMoments.length}
- Likes sent: ${stats.likes}
- Passes: ${stats.passes}
- Messages sent through UI: ${stats.messages}
- Repeated screen penalty events: ${stats.repeatedScreens}
- Meaningful social actions: ${stats.meaningfulSocialActions}
- Fallback actions attempted: ${stats.fallbackActionAttempts}
- Betabook help requests: ${stats.loopHelpRequests}
- Destiny loop rescues followed: ${stats.loopRescuesFollowed}
- Curiosity actions: ${stats.curiosityActions}
- Life years remaining: ${mortality.yearsRemaining.toFixed(2)}
- Life years spent on actions: ${mortality.yearsSpentOnActions.toFixed(2)}
- Life years spent on money: ${mortality.yearsSpentOnMoney.toFixed(2)}
- Dollars committed: ${mortality.dollarsCommitted}
- Truth assessments recorded: ${mortality.truthAuditRiskEvents}
- Mortality status: ${mortality.death ? `dead (${mortality.deathReason})` : 'alive'}

## Action Evidence
${actions.length ? actions.map((action) => `- ${action}`).join('\n') : '- None'}

## Visual Evidence
- Live raw log: ${path.relative(config.runDir, liveRawFile)}
- Evidence manifest: ${path.relative(config.runDir, evidenceFile)}
- Screenshot folder: ${path.relative(config.runDir, path.join(config.runDir, 'screenshots', bot.id))}
- Screenshots captured: ${step - 1}

## Errors
${errors.length ? errors.map((error) => `- ${error}`).join('\n') : '- None'}
`
  fs.writeFileSync(path.join(config.runDir, 'raw', `${bot.id}.md`), raw)
  return { id: bot.id, score, endReason, errors, actions: actions.length, screenshots: step - 1, ideas, thoughts: thoughts.length, opinions: opinions.length, screenSize: bot.screenSize, avatar: bot.avatar, betabookMoments: betabookMoments.length, destinyMoments: destinyMoments.length, likes: stats.likes, passes: stats.passes, messages: stats.messages, repeatedScreens: stats.repeatedScreens, meaningfulSocialActions: stats.meaningfulSocialActions, loopHelpRequests: stats.loopHelpRequests, loopRescuesFollowed: stats.loopRescuesFollowed, curiosityActions: stats.curiosityActions, attentionSpanMinutes: bot.attentionSpanMinutes, lifeGoal: bot.lifeGoal, mortality }
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
  const confidenceRows = buildConfidenceRows(ideaCounts, results.length).slice(0, 15)
  const mortalityResults = results.map((result) => result.mortality).filter(Boolean)
  const mortalitySummary = {
    enabled: true,
    startingYears: config.truthPressureStartingYears,
    actionMonthsCost: config.truthPressureActionMonths,
    dollarYearsCost: config.truthPressureDollarYears,
    totalActionsCharged: mortalityResults.reduce((sum, item) => sum + (item.actionsCharged || 0), 0),
    totalDollarsCommitted: mortalityResults.reduce((sum, item) => sum + (item.dollarsCommitted || 0), 0),
    totalYearsSpentOnActions: Number(mortalityResults.reduce((sum, item) => sum + (item.yearsSpentOnActions || 0), 0).toFixed(4)),
    totalYearsSpentOnMoney: Number(mortalityResults.reduce((sum, item) => sum + (item.yearsSpentOnMoney || 0), 0).toFixed(4)),
    averageYearsRemaining: Number((mortalityResults.reduce((sum, item) => sum + (item.yearsRemaining || 0), 0) / Math.max(1, mortalityResults.length)).toFixed(4)),
    deaths: mortalityResults.filter((item) => item.death).length,
    truthAuditRiskEvents: mortalityResults.reduce((sum, item) => sum + (item.truthAuditRiskEvents || 0), 0),
  }
  const summary = {
    config: publicConfig(),
    cohort: {
      appName: cohort.appName,
      source: cohort.source,
      audienceResearchFile: config.audienceResearchFile || '',
      researchSources: cohort.researchSources,
      audienceSegments: cohort.audienceSegments,
      confidenceRules: cohort.confidenceRules,
      roleCount: cohort.roles.length,
      routeCount: cohort.routes.length,
      requiresSocialAction: cohort.requiresSocialAction,
      screenSizeDistribution: cohort.screenSizeDistribution,
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
      masterPlan: destinyState.masterPlan,
      events: destinyState.events.length,
      errors: destinyState.errors,
    } : { enabled: false },
    truthPressure: {
      ...mortalitySummary,
      truthAssessments: mortalitySummary.truthAuditRiskEvents,
    },
    llm: llmStats,
    elapsedSeconds,
    happy,
    unhappy,
    median,
    errorBots,
    topIdeas,
    confidenceRows,
    results,
  }
  fs.writeFileSync(path.join(config.runDir, 'summary.json'), JSON.stringify(summary, null, 2))
  fs.writeFileSync(path.join(config.runDir, 'analysis.md'), `# Thoughtful Browser Betabot Analysis

## Run Configuration
- App name: ${cohort.appName}
- Cohort source: ${cohort.source}
- Audience research file: ${config.audienceResearchFile || 'not provided'}
- Research sources: ${cohort.researchSources.length ? cohort.researchSources.join(', ') : 'not provided'}
- Audience segments: ${cohort.audienceSegments.length ? cohort.audienceSegments.map((segment) => `${segment.name || segment.segment || segment.role || 'segment'}${segment.weight ? ` (${segment.weight})` : ''}`).join(', ') : 'not provided'}
- Role definitions: ${cohort.roles.length}
- Route definitions: ${cohort.routes.length}
- Screen-size distribution: ${cohort.screenSizeDistribution.map((entry) => `${entry.category} ${entry.weight}`).join(', ')}
- Betabook: ${betabookState?.enabled ? 'enabled' : 'disabled'}
- Betabook posts: ${betabookState?.enabled ? betabookState.posts.length : 0}
- Destiny: ${destinyState?.enabled ? 'enabled' : 'disabled'}
- Destiny threads: ${destinyState?.enabled ? destinyState.masterPlan.length : 0}
- Truth pressure: always on
- Truth pressure action cost: ${mortalitySummary.actionMonthsCost} month(s)
- Truth pressure money cost: ${mortalitySummary.dollarYearsCost} year(s) per $1
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
- Requested time scale: ${config.requestedTimeScale}
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
- Messages sent through UI: ${results.reduce((sum, result) => sum + (result.messages || 0), 0)}
- Repeated screen penalty events: ${results.reduce((sum, result) => sum + (result.repeatedScreens || 0), 0)}
- Meaningful social actions: ${results.reduce((sum, result) => sum + (result.meaningfulSocialActions || 0), 0)}
- Betabook help requests: ${results.reduce((sum, result) => sum + (result.loopHelpRequests || 0), 0)}
- Destiny loop rescues followed: ${results.reduce((sum, result) => sum + (result.loopRescuesFollowed || 0), 0)}
- Curiosity actions: ${results.reduce((sum, result) => sum + (result.curiosityActions || 0), 0)}
- Error bots: ${errorBots.length}

## Truth Pressure
${[
    `- Starting years per bot: ${mortalitySummary.startingYears}`,
    `- Actions charged: ${mortalitySummary.totalActionsCharged}`,
    `- Dollars committed: ${mortalitySummary.totalDollarsCommitted}`,
    `- Years spent on actions: ${mortalitySummary.totalYearsSpentOnActions}`,
    `- Years spent on money: ${mortalitySummary.totalYearsSpentOnMoney}`,
    `- Average years remaining: ${mortalitySummary.averageYearsRemaining}`,
    `- Truth assessments recorded: ${mortalitySummary.truthAuditRiskEvents}`,
    `- Deaths: ${mortalitySummary.deaths}`,
  ].join('\n')}

## Top Bot Ideas
${topIdeas.length ? topIdeas.slice(0, 10).map(([idea, count]) => `- ${count} mentions: ${idea}`).join('\n') : '- None'}

## Confidence Tiers
${confidenceRows.length ? confidenceRows.map((row) => `- ${row.tier.toUpperCase()} (${row.count}/${results.length} mentions): ${row.theme}${row.examples?.length ? ` — examples: ${row.examples.slice(0, 2).join(' | ')}` : ''}`).join('\n') : '- None'}

## Audience Research Grounding
- Cohorts should be seeded from real audience evidence when available: analytics segments, search intent, support/sales notes, reviews, social comments, competitor audiences, and public market/category research.
- Use generic personas only for smoke tests. For product-quality runs, each major persona should trace back to a research source or observed segment.
- Weight screen-size distribution and role count according to the researched traffic mix when known.

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
- Browser Betabots launched real browser contexts, moved with human-paced waits, captured screenshots, and saved first-person raw thinking.
- Betabot reflections, social text, Betabook comments, and Destiny planning require an LLM provider. Deterministic fallback text is not a product-quality mind layer.
- This mode evaluates comprehension and emotional product quality, not server scale.

## Error Bots
${errorBots.length ? errorBots.map((bot) => `- ${bot.id}: ${bot.errors.join('; ')}`).join('\n') : '- None'}
`)
}

async function main() {
  const startedAt = Date.now()
  validateRunConfig()
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
      audienceResearchFile: config.audienceResearchFile || '',
      audienceResearch: cohort.audienceResearch,
      researchSources: cohort.researchSources,
      audienceSegments: cohort.audienceSegments,
      confidenceRules: cohort.confidenceRules,
      roles: cohort.roles,
      requiresSocialAction: cohort.requiresSocialAction,
      routes: cohort.routes.map((route) => ({
        labels: route.labels.map((label) => label.toString()),
        fallback: route.fallback,
      })),
      screenSizeDistribution: cohort.screenSizeDistribution,
      keywords: cohort.keywords,
      ideaRules: cohort.ideaRules,
    },
    bots,
  }, null, 2))
  if (config.cohortOnly) {
    console.log(JSON.stringify({ runDir: config.runDir, bots: bots.length, cohortOnly: true }, null, 2))
    return
  }
  const playwright = await requirePlaywright()
  const browser = await playwright.chromium.launch({
    headless: config.headless,
    ...(config.browserExecutablePath ? { executablePath: config.browserExecutablePath } : {}),
  })
  const results = []
  writeBetabookState(betabookState)
  writeDestinyState(destinyState)
  const stopDestiny = startDestiny(bots, destinyState, betabookState)
  try {
    await runPool(bots, async (bot) => {
      results.push(await runBot(browser, bot, { betabookState, destinyState, bots }))
    }, config.concurrency)
  } finally {
    await stopDestiny()
    await browser.close()
  }
  await stirBetabook(bots, betabookState, 'final wrap-up')
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
    truthPressure: {
      enabled: true,
      actionsCharged: results.reduce((sum, result) => sum + (result.mortality?.actionsCharged || 0), 0),
      yearsSpentOnActions: Number(results.reduce((sum, result) => sum + (result.mortality?.yearsSpentOnActions || 0), 0).toFixed(4)),
      dollarsCommitted: results.reduce((sum, result) => sum + (result.mortality?.dollarsCommitted || 0), 0),
      deaths: results.filter((result) => result.mortality?.death).length,
    },
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
