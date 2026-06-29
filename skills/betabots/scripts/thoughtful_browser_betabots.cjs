#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

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
    channels: ['introductions', 'looking-for-party', 'invites', 'missed-connections', 'venue-requests', 'table-talk'],
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
    events: [],
    errors: [],
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

async function runDestinyPass(bots, state, betabookState) {
  if (!state.enabled) return
  const botsById = new Map(bots.map((bot) => [bot.id, bot]))

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
  const useBetabook = (reason) => {
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
      betabookComment(betabookState, {
        postId: digest.posts[0].id,
        authorId: bot.id,
        body: `This is relevant to me because I am here as ${bot.role}.`,
      })
    }
  }
  const followDestiny = async () => {
    const destinyState = runtime.destinyState
    const nudges = takeDestinyNudges(destinyState, bot.id)
    for (const nudge of nudges) {
      destinyMoments.push(nudge.kind)
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
    await screenshot(page, bot, step++)
    log(`I see "${observation.title || 'the app'}". ${observation.text}`)
    recordThought(think(bot, observation, 'arrival'))
    recordOpinion(opinionFrom(bot, observation))
    recordIdea(ideaFrom(bot, observation))

    const sessionMs = bot.attentionSpanMinutes * 60 * 1000
    const maxMoves = clamp(Math.round(bot.attentionSpanMinutes * 4), 8, 360)
    const routes = cohort.routes

    for (let move = 0; move < maxMoves && Date.now() - startedAt < sessionMs; move += 1) {
      const remainingMs = sessionMs - (Date.now() - startedAt)
      await wait(Math.min(remainingMs, 6000 + random() * 12000))
      if (Date.now() - startedAt >= sessionMs) break
      await followDestiny()
      if (move > 0 && move % 3 === 0) useBetabook('between actions')
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
      await screenshot(page, bot, step++)
      log(`I now see: ${observation.text}`)
      const thought = think(bot, observation, 'exploration')
      recordThought(thought)
      recordOpinion(opinionFrom(bot, observation))
      recordIdea(ideaFrom(bot, observation))

      const lower = observation.text.toLowerCase()
      if (hasAny(lower, cohort.keywords.value)) value += 12
      if (hasAny(lower, cohort.keywords.trust)) trust += 8
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
          await screenshot(page, bot, step++)
          log(`After creating a character, I see: ${observation.text}`)
          recordThought(think(bot, observation, 'character-created'))
          recordOpinion(opinionFrom(bot, observation))
          recordIdea(ideaFrom(bot, observation))
        } else if (emptyCharacterViews >= 2) {
          trust -= 8
          log(`I am looping on the character requirement and starting to lose patience.`)
        }
      }

      const reserveClicked = await clickFirst(page, [/^like$/i, /^pass$/i, /^reserve$/i, /^save$/i, /^message$/i])
      if (reserveClicked) {
        actions.push(`clicked ${reserveClicked}`)
        log(`I try "${reserveClicked}" and watch whether the app reacts clearly.`)
        await wait(2500 + random() * 5500)
      }
    }
  } catch (error) {
    errors.push(error.message)
    log(`I hit a problem: ${error.message}`)
  } finally {
    await context.close().catch(() => {})
  }

  let score = clamp(value + trust - errors.length * 20, 0, 100)
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

## Action Evidence
${actions.length ? actions.map((action) => `- ${action}`).join('\n') : '- None'}

## Errors
${errors.length ? errors.map((error) => `- ${error}`).join('\n') : '- None'}
`
  fs.writeFileSync(path.join(config.runDir, 'raw', `${bot.id}.md`), raw)
  return { id: bot.id, score, endReason, errors, actions: actions.length, screenshots: step - 1, ideas, thoughts: thoughts.length, opinions: opinions.length, betabookMoments: betabookMoments.length, destinyMoments: destinyMoments.length, attentionSpanMinutes: bot.attentionSpanMinutes }
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
    config,
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
- Error bots: ${errorBots.length}

## Top Bot Ideas
${topIdeas.length ? topIdeas.slice(0, 10).map(([idea, count]) => `- ${count} bots: ${idea}`).join('\n') : '- None'}

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

## Interpretation
- Thoughtful mode launched real browser contexts, moved with human-paced waits, captured screenshots, and saved first-person raw thinking.
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
  fs.writeFileSync(path.join(config.runDir, 'cohort.json'), JSON.stringify({
    config,
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
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
