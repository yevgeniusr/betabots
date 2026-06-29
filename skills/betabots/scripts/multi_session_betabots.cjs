#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const os = require('node:os')

const config = {
  count: Number(process.env.BETABOT_COUNT || 80),
  sessions: Number(process.env.BETABOT_SESSIONS || 12),
  years: Number(process.env.BETABOT_YEARS || 3),
  concurrency: Number(process.env.BETABOT_CONCURRENCY || 16),
  backendUrl: (process.env.BETABOT_BACKEND_URL || 'http://localhost:3001/api').replace(/\/$/, ''),
  token: process.env.E2E_AUTH_TOKEN || process.env.BETABOT_AUTH_TOKEN || 'metabot-live-token-20260629',
  runDir: process.env.BETABOT_RUN_DIR || `.betabots/runs/${new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)}-social-lifecycle`,
  seed: Number(process.env.BETABOT_SEED || 20260629),
  phaseDelayMs: Number(process.env.BETABOT_PHASE_DELAY_MS || 0),
  minChatRounds: Number(process.env.BETABOT_MIN_CHAT_ROUNDS || 4),
  llmProvider: (process.env.BETABOT_LLM_PROVIDER || 'codex').toLowerCase(),
  llmModel: process.env.BETABOT_LLM_MODEL || '',
  llmMaxCalls: Number(process.env.BETABOT_LLM_MAX_CALLS || 500),
  llmTimeoutMs: Number(process.env.BETABOT_LLM_TIMEOUT_MS || 90000),
  llmBatchSize: Number(process.env.BETABOT_LLM_BATCH_SIZE || 25),
  codexCommand: process.env.BETABOT_CODEX_COMMAND || 'codex',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || process.env.BETABOT_OPENROUTER_API_KEY || '',
  openrouterBaseUrl: (process.env.BETABOT_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  openrouterSiteUrl: process.env.BETABOT_OPENROUTER_SITE_URL || '',
  openrouterAppName: process.env.BETABOT_OPENROUTER_APP_NAME || 'Betabots',
}

const races = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Tiefling', 'Dragonborn', 'Half-Elf', 'Gnome']
const classes = ['Bard', 'Rogue', 'Wizard', 'Fighter', 'Cleric', 'Ranger', 'Warlock', 'Paladin']
const alignments = ['Chaotic Good', 'Neutral Good', 'True Neutral', 'Lawful Neutral', 'Chaotic Neutral']
const vibes = ['Cozy', 'Epic', 'Gritty', 'Whimsical', 'Dark', 'Heroic']
const cities = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Online']
const roles = [
  'lonely player seeking party chemistry',
  'privacy-sensitive lurker',
  'GM looking for reliable players',
  'new D&D player who needs beginner safety',
  'power user comparing alternatives',
  'mobile-first impatient user',
  'returning user checking notifications',
  'friendship-first table seeker',
  'romance-curious roleplayer',
  'venue organizer evaluating demand',
  'board game cafe owner filling weeknights',
  'professional DM selling paid one-shots',
  'community meetup organizer coordinating strangers',
  'accessibility-conscious event host',
]
const names = [
  'Mira', 'Sol', 'Niko', 'Tara', 'Ren', 'Ari', 'Vale', 'Kestrel', 'Moss', 'June',
  'Pip', 'Rook', 'Iris', 'Omar', 'Lena', 'Theo', 'Nyx', 'Sam', 'Cora', 'Dain',
]

const lifecycle = [
  { index: 0, label: 'signup and character creation', virtualTime: 'year 0, day 0' },
  { index: 1, label: 'profile browsing and directed likes', virtualTime: 'year 0, week 1' },
  { index: 2, label: 'incoming likes, matching, and first return', virtualTime: 'year 0, week 2' },
  { index: 3, label: 'first chat and flirting', virtualTime: 'year 0, week 3' },
  { index: 4, label: 'roleplay chat and date invitation', virtualTime: 'year 0, month 2' },
  { index: 5, label: 'table discovery, reservation, or organizer request', virtualTime: 'year 0, month 3' },
  { index: 6, label: 'first table date: show, ghost, or reschedule', virtualTime: 'year 0, month 4' },
  { index: 7, label: 'second date or closure', virtualTime: 'year 0, month 6' },
  { index: 8, label: 'party group formation', virtualTime: 'year 1' },
  { index: 9, label: 'campaign continuity and churn', virtualTime: 'year 1, season 2' },
  { index: 10, label: 'annual return and relationship drift', virtualTime: 'year 2' },
  { index: 11, label: 'multi-year retention outcome', virtualTime: 'year 3' },
]

const openers = [
  'Your hook made me laugh. What kind of table do you usually enjoy?',
  'I am looking for low-drama campaign energy. Does that fit your vibe?',
  'Your character sounds like trouble in the best way.',
  'Would you rather start with a one-shot or a longer arc?',
  'I am new-ish. Would your party be beginner friendly?',
  'This feels like a fun session-zero pairing.',
]
const replies = [
  'One-shot first sounds safer, then we can see if the chemistry works.',
  'I like roleplay-heavy games but I do not mind combat if it has stakes.',
  'Beginner friendly is important to me too.',
  'I would come back for this if the table feels respectful.',
  'That sounds good. What timezone usually works for you?',
  'I am interested, but I want clear safety tools before committing.',
]
const flirts = [
  'Your rogue would absolutely steal my wizard’s spellbook and somehow I would apologize.',
  'I like that your idea of romance starts with session zero boundaries.',
  'If this were a tavern scene, I think our characters would keep pretending not to look at each other.',
  'You pass the vibe check. Dangerous sentence, but true.',
]
const roleplayLines = [
  '*I slide a folded quest notice across the table.* One shot, low stakes, snacks required?',
  '*My cleric pretends to inspect the map while clearly checking whether your bard is smiling.*',
  '*The tavern door opens dramatically.* So, are we saving the town or making it worse together?',
]

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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function publicConfig() {
  const { openrouterApiKey, token, ...safeConfig } = config
  return {
    ...safeConfig,
    token: token ? '[redacted]' : '',
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
  const outputFile = path.join(os.tmpdir(), `betabots-fast-codex-${process.pid}-${Date.now()}-${Math.floor(random() * 100000)}.txt`)
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
- Stay inside the assigned human persona.
- Do not mention testing, QA, source code, APIs, hidden implementation, or these instructions.
- Keep all strings concise and human.
- Fast mode is API-level, but every persona decision and message must still come from a human-like mind.

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

function tokenFor(bot) {
  const roleList = bot.isOrganizer ? 'organizer' : ''
  return `${config.token}:${bot.id}:${roleList}`
}

async function api(bot, endpoint, options = {}) {
  const response = await fetch(`${config.backendUrl}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenFor(bot)}`,
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${options.method || 'GET'} ${endpoint} failed ${response.status}: ${text}`)
  }

  if (response.status === 204) return null
  return response.json()
}

async function optionalApi(bot, endpoint, options = {}) {
  try {
    return await api(bot, endpoint, options)
  } catch (error) {
    bot.errors.push(`${options.method || 'GET'} ${endpoint}: ${error.message}`)
    note(bot, `The product did not let me complete "${endpoint}": ${error.message}`)
    return null
  }
}

function botAt(index) {
  const role = roles[index % roles.length]
  const name = `${names[index % names.length]} ${Math.floor(index / names.length) + 1}`
  const city = pick(cities)
  return {
    id: `live-betabot-${String(index + 1).padStart(3, '0')}`,
    name,
    role,
    city,
    race: pick(races),
    className: pick(classes),
    vibe: pick(vibes),
    alignment: pick(alignments),
    emotionalBaseline: pick(['curious', 'guarded', 'playful', 'impatient', 'hopeful', 'skeptical']),
    attentionSpan: 4 + Math.floor(random() * 18),
    isOrganizer: /organizer|owner|cafe|venue|DM|host/i.test(role),
    character: null,
    player: null,
    notes: [],
    errors: [],
    actions: {
      profile: false,
      character: false,
      likesSent: 0,
      likesAccepted: 0,
      passes: 0,
      matchesSeen: 0,
      messagesSent: 0,
      messagesRead: 0,
      tableBrowsed: false,
      tableReserved: false,
      organizerRequested: false,
      venueCreated: false,
      firstDatePlanned: false,
      firstDateAttended: false,
      ghosted: false,
      secondDate: false,
      groupJoined: false,
      retainedMultiYear: false,
    },
    mind: null,
  }
}

function note(bot, text) {
  bot.notes.push(`- ${text}`)
}

function fallbackMind(bot) {
  const firstName = bot.name.split(' ')[0]
  return {
    characterName: `${firstName} the ${bot.className}`,
    characterHook: `${bot.name} is a ${bot.emotionalBaseline} ${bot.role} who wants table chemistry before commitment.`,
    backstory: `I discovered DnDate because I wanted a table that feels socially safe before it feels optimized.`,
    promptAnswers: [
      'Clear expectations, safety tools, and enough jokes to know people are human.',
      'Asking one sincere question at exactly the wrong time.',
      'People answer messages and make plans without pressure.',
    ],
    opener: pick(openers),
    replies: [pick(replies), pick(replies), pick(replies)],
    flirts: [pick(flirts), pick(flirts)],
    roleplayLines: [pick(roleplayLines), pick(roleplayLines)],
    invite: `Want to turn this into a low-pressure table date in ${bot.city === 'Online' ? 'an online VTT' : bot.city}?`,
    ghostReason: 'I panic, get busy, and ghost the table date. It is not a technical failure; it is human flakiness.',
    attendanceReaction: 'That was genuinely less awkward than a coffee date. Same party next time?',
    secondDateIdea: 'Second date idea: same characters, new disaster?',
    organizerMotivation: 'A DnDate match could not find a suitable table, so I want to help create local inventory.',
    acceptanceProbability: 0.92,
    ghostProbability: 0.18,
    secondDateProbability: 0.78,
    retentionReason: 'DnDate now contains relationships, not just profiles.',
    churnReason: 'the app never gave me enough social gravity.',
  }
}

function normalizeMind(bot, mind = {}) {
  const fallback = fallbackMind(bot)
  return {
    ...fallback,
    ...mind,
    characterName: String(mind.characterName || fallback.characterName).slice(0, 80),
    characterHook: String(mind.characterHook || fallback.characterHook).slice(0, 240),
    backstory: String(mind.backstory || fallback.backstory).slice(0, 500),
    promptAnswers: Array.isArray(mind.promptAnswers) && mind.promptAnswers.length >= 3 ? mind.promptAnswers.slice(0, 3) : fallback.promptAnswers,
    replies: Array.isArray(mind.replies) && mind.replies.length ? mind.replies.slice(0, 6) : fallback.replies,
    flirts: Array.isArray(mind.flirts) && mind.flirts.length ? mind.flirts.slice(0, 4) : fallback.flirts,
    roleplayLines: Array.isArray(mind.roleplayLines) && mind.roleplayLines.length ? mind.roleplayLines.slice(0, 4) : fallback.roleplayLines,
    acceptanceProbability: Math.max(0, Math.min(1, Number(mind.acceptanceProbability ?? fallback.acceptanceProbability))),
    ghostProbability: Math.max(0, Math.min(1, Number(mind.ghostProbability ?? fallback.ghostProbability))),
    secondDateProbability: Math.max(0, Math.min(1, Number(mind.secondDateProbability ?? fallback.secondDateProbability))),
  }
}

async function initializeFastMinds(bots) {
  for (const bot of bots) bot.mind = fallbackMind(bot)
  const chunkSize = Math.max(1, config.llmBatchSize)
  for (let index = 0; index < bots.length; index += chunkSize) {
    const chunk = bots.slice(index, index + chunkSize)
    const fallback = {
      bots: chunk.map((bot) => ({ id: bot.id, mind: fallbackMind(bot) })),
    }
    const result = await llmJson('fast_betabot_mind_batch', {
      appName: 'DnDate',
      virtualLifecycle: lifecycle.slice(0, config.sessions).map((phase) => phase.label),
      bots: chunk.map((bot) => ({
        id: bot.id,
        name: bot.name,
        role: bot.role,
        city: bot.city,
        race: bot.race,
        className: bot.className,
        vibe: bot.vibe,
        alignment: bot.alignment,
        emotionalBaseline: bot.emotionalBaseline,
        attentionSpan: bot.attentionSpan,
        isOrganizer: bot.isOrganizer,
      })),
      requestedShape: {
        bots: [{
          id: 'bot id',
          mind: {
            characterName: 'DnD character name',
            characterHook: 'human dating/table hook',
            backstory: 'short first-person past',
            promptAnswers: ['session-zero answer', 'trouble answer', 'return answer'],
            opener: 'first like/comment opener',
            replies: ['chat reply 1', 'chat reply 2'],
            flirts: ['light flirting line'],
            roleplayLines: ['short in-character roleplay line'],
            invite: 'table-date invitation',
            ghostReason: 'why this person might ghost',
            attendanceReaction: 'reaction after successful first table date',
            secondDateIdea: 'second date proposal',
            organizerMotivation: 'why this person would host/request inventory',
            acceptanceProbability: 0.0,
            ghostProbability: 0.0,
            secondDateProbability: 0.0,
            retentionReason: 'why they return over years',
            churnReason: 'why they drift away',
          },
        }],
      },
    }, fallback)
    const mindById = new Map((result.bots || []).map((entry) => [entry.id, entry.mind]))
    for (const bot of chunk) {
      bot.mind = normalizeMind(bot, mindById.get(bot.id))
      note(bot, `Before opening the app, my starting motivation is: ${bot.mind.backstory}`)
    }
  }
}

function characterPayload(bot) {
  const mind = bot.mind || fallbackMind(bot)
  return {
    characterName: mind.characterName,
    race: bot.race,
    className: bot.className,
    alignment: bot.alignment,
    avatarUrl: '',
    characterHook: mind.characterHook,
    vibe: bot.vibe,
    levelRange: { min: 1, max: 12 },
    editions: ['5e'],
    archetypeTags: [bot.role.split(' ')[0], bot.vibe.toLowerCase()],
    personalityTraits: [bot.emotionalBaseline],
    backstory: mind.backstory,
    prompts: [
      {
        question: 'My ideal session zero includes...',
        answer: mind.promptAnswers[0],
      },
      {
        question: 'My character causes trouble by...',
        answer: mind.promptAnswers[1],
      },
      {
        question: 'I come back to a table when...',
        answer: mind.promptAnswers[2],
      },
    ],
    imageUrls: [],
    isActive: true,
    playstyle: {
      combatToRoleplay: 25 + Math.floor(random() * 60),
      strategyToNarrative: 25 + Math.floor(random() * 60),
      sandboxToLinear: 25 + Math.floor(random() * 60),
      rawToRof: 25 + Math.floor(random() * 60),
      lightheartedToSerious: 25 + Math.floor(random() * 60),
      highFantasyToGritty: 25 + Math.floor(random() * 60),
      lowRiskToHighRisk: 20 + Math.floor(random() * 55),
      episodicToLongArc: 25 + Math.floor(random() * 60),
    },
  }
}

function createRelationships(bots) {
  const relationships = []
  for (let index = 0; index + 1 < bots.length; index += 2) {
    relationships.push({
      id: `relationship-${String(relationships.length + 1).padStart(3, '0')}`,
      botAId: bots[index].id,
      botBId: bots[index + 1].id,
      status: 'planned',
      matchId: null,
      messages: 0,
      dateInvites: [],
      dates: [],
      groupId: null,
      events: [],
    })
  }
  return relationships
}

function createGroups(bots, relationships) {
  void bots
  void relationships
  return []
}

function findBot(bots, id) {
  return bots.find((bot) => bot.id === id)
}

function otherCharacterId(match, bot) {
  if (!match || !bot.character) return ''
  return match.characterAId === bot.character.id ? match.characterBId : match.characterAId
}

async function runPool(items, worker, concurrency = config.concurrency) {
  let cursor = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index], index)
    }
  })
  await Promise.all(workers)
}

async function sessionSignup(bot) {
  note(bot, `Session 0: I arrive as ${bot.role}, ${bot.emotionalBaseline}, with ${bot.attentionSpan} minutes of patience.`)
  bot.player = await api(bot, '/players/me', {
    method: 'PUT',
    body: {
      displayName: bot.name,
      city: bot.city,
      pronouns: pick(['they/them', 'she/her', 'he/him', '']),
      languages: pick(['English', 'English, Arabic', 'English, Russian']),
      interestedIn: pick(['Dating', 'Friendship', 'Campaigns', 'Dating, Friendship']),
      preferredLocation: pick(['Online', 'Offline', 'Hybrid']),
    },
  })
  bot.actions.profile = true

  const existingCharacters = await api(bot, '/characters')
  if (existingCharacters.length > 0) {
    bot.character = existingCharacters[0]
    note(bot, `I return and find my existing character, ${bot.character.characterName}.`)
  } else {
    bot.character = await api(bot, '/characters', { method: 'POST', body: characterPayload(bot) })
    note(bot, `I create ${bot.character.characterName}; now I can be seen by other people.`)
  }
  bot.actions.character = true
}

async function sessionDirectedLikes(relationship, bots) {
  const botA = findBot(bots, relationship.botAId)
  const botB = findBot(bots, relationship.botBId)
  if (!botA?.character || !botB?.character) return
  relationship.status = 'liked'
  await api(botA, '/reactions', {
    method: 'POST',
    body: {
      fromCharacterId: botA.character.id,
      toCharacterId: botB.character.id,
      target: { type: 'card', field: pick(['hook', 'vibe', 'prompt']) },
      comment: botA.mind?.opener || pick(openers),
    },
  })
  botA.actions.likesSent += 1
  note(botA, `Session 1: I like ${botB.character.characterName} intentionally because this feels like a real possible person.`)
  note(botB, `Session 1: I am away from the app while someone compatible notices me.`)
  relationship.events.push({ phase: 'like_sent', from: botA.id, to: botB.id })
}

async function sessionAcceptAndMatch(relationship, bots) {
  const botA = findBot(bots, relationship.botAId)
  const botB = findBot(bots, relationship.botBId)
  if (!botA?.character || !botB?.character) return
  note(botB, `Session 2: I return later and check incoming likes instead of starting from scratch.`)
  const incoming = await api(botB, `/reactions/incoming?characterId=${encodeURIComponent(botB.character.id)}`)
  const reaction = incoming.find((item) => item.fromCharacter?.id === botA.character.id || item.fromCharacterId === botA.character.id) || incoming[0]
  if (reaction && random() < (botB.mind?.acceptanceProbability ?? 0.92)) {
    await api(botB, `/reactions/${reaction.id}/accept`, { method: 'POST' })
    botB.actions.likesAccepted += 1
    relationship.status = 'matched'
    relationship.events.push({ phase: 'match_created', acceptedBy: botB.id, reactionId: reaction.id })
    note(botB, `I accept ${botA.character.characterName}; this now feels like a two-person story, not just browsing.`)
  } else if (reaction) {
    await optionalApi(botB, `/reactions/${reaction.id}/dismiss`, { method: 'PUT' })
    relationship.status = 'dismissed'
    relationship.events.push({ phase: 'like_dismissed', by: botB.id })
    note(botB, `I dismiss the like because the chemistry is not right.`)
    return
  }

  const matches = await api(botA, `/matches?characterId=${encodeURIComponent(botA.character.id)}`)
  const match = matches.find((item) => {
    const ids = [item.characterAId, item.characterBId]
    return ids.includes(botA.character.id) && ids.includes(botB.character.id)
  }) || matches[0]

  if (match) {
    relationship.matchId = match.id
    botA.actions.matchesSeen += 1
    botB.actions.matchesSeen += 1
    note(botA, `I come back and see that ${botB.character.characterName} matched with me.`)
  } else {
    relationship.events.push({ phase: 'match_missing_after_accept' })
    note(botA, `I expected a match after the accepted like, but I cannot find it yet.`)
  }
}

async function sendMatchMessage(relationship, fromBot, body) {
  if (!relationship.matchId || !fromBot.character) return null
  const message = await api(fromBot, `/matches/${relationship.matchId}/messages`, {
    method: 'POST',
    body: {
      fromCharacterId: fromBot.character.id,
      body,
    },
  })
  fromBot.actions.messagesSent += 1
  relationship.messages += 1
  relationship.events.push({ phase: 'message_sent', from: fromBot.id, body })
  note(fromBot, `I send: "${body}"`)
  return message
}

async function sessionChat(relationship, bots) {
  const botA = findBot(bots, relationship.botAId)
  const botB = findBot(bots, relationship.botBId)
  if (!relationship.matchId || !botA || !botB) return
  note(botA, `Session 3: I open chat to see if this match has actual energy.`)
  note(botB, `Session 3: I answer because a match without conversation feels fake.`)
  for (let round = 0; round < config.minChatRounds; round += 1) {
    const speaker = round % 2 === 0 ? botA : botB
    const mindLines = round < 2 ? speaker.mind?.replies : speaker.mind?.flirts
    await sendMatchMessage(relationship, speaker, pick(mindLines?.length ? mindLines : round < 2 ? replies : flirts))
  }
  const messages = await api(botA, `/matches/${relationship.matchId}/messages`)
  botA.actions.messagesRead += messages.length
  botB.actions.messagesRead += messages.length
}

async function sessionRoleplayAndInvite(relationship, bots) {
  const botA = findBot(bots, relationship.botAId)
  const botB = findBot(bots, relationship.botBId)
  if (!relationship.matchId || !botA || !botB) return
  note(botA, `Session 4: The chat has enough warmth that I try a little roleplay instead of small talk.`)
  await sendMatchMessage(relationship, botA, pick(botA.mind?.roleplayLines?.length ? botA.mind.roleplayLines : roleplayLines))
  await sendMatchMessage(relationship, botB, pick(botB.mind?.roleplayLines?.length ? botB.mind.roleplayLines : roleplayLines))
  const invite = botA.mind?.invite || `Want to turn this into a low-pressure table date in ${botA.city === 'Online' ? 'an online VTT' : botA.city}?`
  await sendMatchMessage(relationship, botA, invite)
  botA.actions.firstDatePlanned = true
  botB.actions.firstDatePlanned = true
  relationship.dateInvites.push({ from: botA.id, to: botB.id, city: botA.city, status: 'proposed' })
  relationship.status = 'date_invited'
}

async function sessionTablesOrOrganizer(relationship, bots) {
  const botA = findBot(bots, relationship.botAId)
  const botB = findBot(bots, relationship.botBId)
  if (!botA || !botB) return
  const marketplace = await optionalApi(botA, `/tabletop/marketplace?city=${encodeURIComponent(botA.city)}&maxPriceCents=15000`)
  botA.actions.tableBrowsed = Boolean(marketplace)
  const sessions = marketplace?.sessions || []
  if (sessions.length > 0 && random() < 0.7) {
    const session = pick(sessions)
    const booking = await optionalApi(botA, `/tabletop/sessions/${session.id}/reserve`, { method: 'POST' })
    if (booking) {
      botA.actions.tableReserved = true
      relationship.dateInvites.push({ from: botA.id, to: botB.id, sessionId: session.id, title: session.title, status: 'reserved' })
      relationship.events.push({ phase: 'table_reserved', by: botA.id, sessionId: session.id })
      note(botA, `Session 5: I reserve or waitlist "${session.title}" because the relationship needs an actual table.`)
      note(botB, `Session 5: I see a concrete table plan instead of endless chat.`)
      await sendMatchMessage(relationship, botA, `I found "${session.title}". I reserved/waitlisted; want to make this our first table date?`)
      return
    }
  }

  const organizer = botA.isOrganizer ? botA : botB.isOrganizer ? botB : botA
  const request = await optionalApi(organizer, '/tabletop/organizer/request', {
    method: 'POST',
    body: {
      city: organizer.city,
      experience: `${organizer.name} can host beginner-friendly one-shots and campaign session zero nights.`,
      motivation: organizer.mind?.organizerMotivation || `A DnDate match could not find a suitable table, so I want to help create local inventory.`,
      contact: `${organizer.id}@example.test`,
    },
  })
  organizer.actions.organizerRequested = Boolean(request)
  relationship.events.push({ phase: 'organizer_request', by: organizer.id, status: request?.status || 'failed' })
  note(organizer, `Session 5: There is no good table, so I contact/register as an organizer instead of letting the match die.`)

  if (organizer.isOrganizer) {
    const venue = await optionalApi(organizer, '/tabletop/organizer/venues', {
      method: 'POST',
      body: {
        name: `${organizer.name.split(' ')[0]}'s Table Lab`,
        city: organizer.city === 'Online' ? 'Dubai' : organizer.city,
        locationType: 'offline',
        neighborhood: 'Synthetic Quarter',
        amenities: ['quiet room', 'snacks', 'session zero cards'],
        accessibility: ['step-free route requested', 'low-noise table'],
        houseRules: ['respect consent tools', 'no harassment', 'arrive on time'],
      },
    })
    organizer.actions.venueCreated = Boolean(venue)
    if (venue) relationship.events.push({ phase: 'venue_created_unverified', by: organizer.id, venueId: venue.id })
  }
}

async function sessionFirstDate(relationship, bots) {
  const botA = findBot(bots, relationship.botAId)
  const botB = findBot(bots, relationship.botBId)
  if (!botA || !botB || relationship.status === 'dismissed') return
  const ghostProbability = Math.max(botA.mind?.ghostProbability ?? 0.18, botB.mind?.ghostProbability ?? 0.18)
  const ghosted = random() < ghostProbability
  const ghost = random() < 0.5 ? botA : botB
  const attendee = ghost.id === botA.id ? botB : botA
  if (ghosted) {
    ghost.actions.ghosted = true
    relationship.status = 'ghosted_first_date'
    relationship.dates.push({ number: 1, status: 'ghosted', ghostedBy: ghost.id })
    relationship.events.push({ phase: 'first_date_ghosted', ghostedBy: ghost.id })
    note(ghost, `Session 6: ${ghost.mind?.ghostReason || 'I panic, get busy, and ghost the table date. It is not a technical failure; it is human flakiness.'}`)
    note(attendee, `Session 6: I show up emotionally ready, but ${ghost.name} disappears. I need the app to help me recover.`)
    await sendMatchMessage(relationship, attendee, `I waited a bit. If life happened, okay, but I need clearer confirmation next time.`)
  } else {
    botA.actions.firstDateAttended = true
    botB.actions.firstDateAttended = true
    relationship.status = 'first_date_attended'
    relationship.dates.push({ number: 1, status: 'attended' })
    relationship.events.push({ phase: 'first_date_attended' })
    note(botA, `Session 6: I attend the first table date and the shared game makes the interaction less awkward.`)
    note(botB, `Session 6: I attend too; this feels different from a dating app because we had something to do together.`)
    await sendMatchMessage(relationship, botB, botB.mind?.attendanceReaction || `That was genuinely less awkward than a coffee date. Same party next time?`)
  }
}

async function sessionSecondDate(relationship, bots) {
  const botA = findBot(bots, relationship.botAId)
  const botB = findBot(bots, relationship.botBId)
  if (!botA || !botB) return
  const secondDateProbability = Math.max(botA.mind?.secondDateProbability ?? 0.78, botB.mind?.secondDateProbability ?? 0.78)
  if (relationship.status === 'first_date_attended' && random() < secondDateProbability) {
    botA.actions.secondDate = true
    botB.actions.secondDate = true
    relationship.status = 'second_date'
    relationship.dates.push({ number: 2, status: 'attended' })
    relationship.events.push({ phase: 'second_date_attended' })
    note(botA, `Session 7: I come back months later for a second date because the first one had a real activity loop.`)
    note(botB, `Session 7: I agree to a second date and start thinking about a recurring group, not only romance.`)
    await sendMatchMessage(relationship, botA, botA.mind?.secondDateIdea || `Second date idea: same characters, new disaster?`)
  } else if (relationship.status === 'ghosted_first_date') {
    relationship.status = 'closed_after_ghost'
    relationship.events.push({ phase: 'closed_after_ghost' })
    note(botA, `Session 7: The ghosting changed the vibe, so this connection fades out.`)
    note(botB, `Session 7: I stop investing here and look for more reliable people.`)
  }
}

async function sessionGroups(groups, relationships, bots) {
  const stableRelationships = relationships.filter((relationship) => relationship.status === 'second_date')
  for (let index = 0; index + 1 < stableRelationships.length; index += 2) {
    const group = groups.find((candidate) => candidate.status === 'forming') || {
      id: `party-${String(groups.length + 1).padStart(3, '0')}`,
      name: `${pick(['Moonlit', 'Critical', 'Goblin', 'Silver'])} ${pick(['Party', 'Table', 'Guild', 'Coven'])}`,
      memberIds: [],
      status: 'forming',
      sessionsPlayed: 0,
      churnedMemberIds: [],
      events: [],
    }
    if (!groups.includes(group)) groups.push(group)

    const groupRelationships = stableRelationships.slice(index, index + 2)
    group.memberIds = [...new Set(groupRelationships.flatMap((relationship) => [relationship.botAId, relationship.botBId]))]
    group.status = 'active'
    group.sessionsPlayed += 1
    group.events.push({ phase: 'group_formed', stableRelationships: groupRelationships.map((relationship) => relationship.id) })
    for (const memberId of group.memberIds) {
      const bot = findBot(bots, memberId)
      if (!bot) continue
      bot.actions.groupJoined = true
      note(bot, `Session 8: I join ${group.name}; now the product is not just matching pairs, it is creating a party.`)
    }
    for (const relationship of groupRelationships) {
      relationship.groupId = group.id
    }
  }
}

async function sessionCampaignContinuity(group, bots) {
  if (group.status !== 'active') return
  const churned = random() < 0.24
  group.sessionsPlayed += 1
  if (churned) {
    const leavingId = pick(group.memberIds)
    group.churnedMemberIds.push(leavingId)
    const bot = findBot(bots, leavingId)
    if (bot) {
      note(bot, `Session 9: I leave the group after schedule friction. The app should help the party replace me without drama.`)
    }
    group.events.push({ phase: 'member_churned', memberId: leavingId })
  } else {
    group.events.push({ phase: 'campaign_continued', sessionsPlayed: group.sessionsPlayed })
    for (const memberId of group.memberIds) {
      const bot = findBot(bots, memberId)
      if (bot) note(bot, `Session 9: The group survives another arc; this is the kind of retention a social app should create.`)
    }
  }
}

async function sessionAnnualReturn(bot) {
  const returned = bot.actions.groupJoined || bot.actions.secondDate || (bot.actions.messagesSent > 0 && random() < 0.45)
  if (returned) {
    bot.actions.retainedMultiYear = true
    note(bot, `Session 10-11: I return over the simulated years because ${bot.mind?.retentionReason || 'DnDate now contains relationships, not just profiles.'}`)
  } else {
    note(bot, `Session 10-11: I drift away over the simulated years because ${bot.mind?.churnReason || 'the app never gave me enough social gravity.'}`)
  }
}

function happiness(bot) {
  let score = 0
  if (bot.actions.profile) score += 8
  if (bot.actions.character) score += 12
  if (bot.actions.likesSent > 0 || bot.actions.likesAccepted > 0) score += 12
  if (bot.actions.matchesSeen > 0) score += 14
  if (bot.actions.messagesSent > 0) score += 14
  if (bot.actions.firstDatePlanned) score += 10
  if (bot.actions.tableBrowsed) score += 5
  if (bot.actions.tableReserved || bot.actions.organizerRequested) score += 7
  if (bot.actions.firstDateAttended) score += 10
  if (bot.actions.secondDate) score += 8
  if (bot.actions.groupJoined) score += 10
  if (bot.actions.retainedMultiYear) score += 10
  if (bot.actions.ghosted) score -= 14
  score -= bot.errors.length * 5
  return Math.max(0, Math.min(100, score))
}

function endReason(bot, score) {
  if (score >= 90) return 'multi-year retained with group or recurring relationship'
  if (score >= 75) return 'completed social journey and will come back later'
  if (score >= 60) return 'understood value but needs stronger coordination support'
  if (bot.actions.ghosted) return 'ghosted or was affected by ghosting and needs recovery tools'
  if (bot.errors.length > 0) return 'hit product/API gaps during lifecycle'
  return 'got bored or lost before social gravity formed'
}

function writeRaw(bot) {
  const score = happiness(bot)
  const text = `# ${bot.id} — Multi-Year Social Lifecycle Raw Storyline

## Persona
- Name: ${bot.name}
- Role: ${bot.role}
- City: ${bot.city}
- Emotional baseline: ${bot.emotionalBaseline}
- Attention span: ${bot.attentionSpan} minutes
- Character: ${bot.character?.characterName || 'not created'}

## Raw Journey
${bot.notes.join('\n')}

## Session End
- End reason: ${endReason(bot, score)}
- Happiness score: ${score}
- Return likelihood: ${score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low'}
- Trust level: ${bot.errors.length ? 'medium' : 'medium-high'}
- Value understood: ${score >= 60 ? 'yes' : 'partial'}

## Action Evidence
${Object.entries(bot.actions).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

## Errors
${bot.errors.length ? bot.errors.map((error) => `- ${error}`).join('\n') : '- None'}
`
  fs.writeFileSync(path.join(config.runDir, 'raw', `${bot.id}.md`), text)
}

function summarizeActions(bots) {
  return bots.reduce((accumulator, bot) => {
    for (const [key, value] of Object.entries(bot.actions)) {
      accumulator[key] = (accumulator[key] || 0) + (typeof value === 'boolean' ? (value ? 1 : 0) : value)
    }
    return accumulator
  }, {})
}

function writeAnalysis(bots, relationships, groups, events, startedAt) {
  const scores = bots.map(happiness)
  const happy = scores.filter((score) => score >= 70).length
  const unhappy = scores.filter((score) => score < 50).length
  const actions = summarizeActions(bots)
  const errorBots = bots.filter((bot) => bot.errors.length > 0)
  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
  const sortedScores = [...scores].sort((left, right) => left - right)
  const p50 = sortedScores[Math.floor(sortedScores.length * 0.5)] || 0
  const p90 = sortedScores[Math.floor(sortedScores.length * 0.9)] || 0
  const matchedRelationships = relationships.filter((relationship) => relationship.matchId)
  const secondDates = relationships.filter((relationship) => relationship.status === 'second_date')
  const activeGroups = groups.filter((group) => group.status === 'active')

  const analysis = `# Multi-Year Social Betabot Analysis

## Run Configuration
- Bots: ${bots.length}
- Lifecycle sessions requested: ${config.sessions}
- Virtual years: ${config.years}
- Backend: ${config.backendUrl}
- Concurrency: ${config.concurrency}
- Elapsed wall time: ${elapsedSeconds}s
- Seed: ${config.seed}
- LLM provider: ${llmStats.provider}
- LLM model: ${llmStats.model || 'provider default'}
- LLM calls: ${llmStats.calls}
- LLM failures: ${llmStats.failures}
- LLM fallbacks: ${llmStats.fallbacks}

## Lifecycle Coverage
- Planned relationships: ${relationships.length}
- Matched relationships: ${matchedRelationships.length}
- Relationships reaching second date: ${secondDates.length}
- Party groups formed: ${activeGroups.length}
- Group campaign sessions simulated: ${groups.reduce((sum, group) => sum + group.sessionsPlayed, 0)}
- Lifecycle events recorded: ${events.length}

## Happiness
- Happy bots (score >= 70): ${happy}/${bots.length} (${Math.round((happy / bots.length) * 100)}%)
- Unhappy bots (score < 50): ${unhappy}/${bots.length} (${Math.round((unhappy / bots.length) * 100)}%)
- Median score: ${p50}
- P90 score: ${p90}

## Social Activity
- Profiles touched: ${actions.profile}
- Characters available: ${actions.character}
- Likes sent: ${actions.likesSent}
- Likes accepted: ${actions.likesAccepted}
- Match observations: ${actions.matchesSeen}
- Messages sent: ${actions.messagesSent}
- Messages read: ${actions.messagesRead}
- First dates planned: ${actions.firstDatePlanned}
- First dates attended: ${actions.firstDateAttended}
- Ghosted users: ${actions.ghosted}
- Second dates: ${actions.secondDate}
- Group joins: ${actions.groupJoined}
- Multi-year retained users: ${actions.retainedMultiYear}
- Table browses: ${actions.tableBrowsed}
- Table reservations/waitlists: ${actions.tableReserved}
- Organizer requests: ${actions.organizerRequested}
- Venues created/requested: ${actions.venueCreated}

## Product Interpretation
- This is not a session-0 test. LLM-backed bots coordinate through directed likes, accepted matches, chat, date planning, table search, organizer fallback, attendance/ghosting, second dates, group formation, campaign continuity, and multi-year return.
- Real DnDate APIs are used for players, characters, reactions, matches, messages, tabletop marketplace, reservations, organizer requests, and organizer venue creation where allowed.
- Group/date lifecycle is recorded as synthetic product events because DnDate does not yet expose first-class date attendance or party-group APIs. Those gaps are visible in timeline.json and should become product backlog if they matter.

## LLM Mind Layer
- Provider: ${llmStats.provider}
- Model: ${llmStats.model || 'provider default'}
- Calls by task: ${Object.entries(llmStats.tasks).map(([task, count]) => `${task}=${count}`).join(', ') || 'none'}
- Recent errors: ${llmStats.errors.length ? llmStats.errors.slice(-10).join('; ') : 'none'}

## Error Bots
${errorBots.length ? errorBots.slice(0, 30).map((bot) => `- ${bot.id}: ${bot.errors.join('; ')}`).join('\n') : '- None'}
`
  fs.writeFileSync(path.join(config.runDir, 'analysis.md'), analysis)
  fs.writeFileSync(path.join(config.runDir, 'summary.json'), JSON.stringify({
    config: publicConfig(),
    llm: llmStats,
    elapsedSeconds,
    happy,
    unhappy,
    median: p50,
    p90,
    actions,
    lifecycle,
    relationships,
    groups,
    errorBots: errorBots.map((bot) => ({ id: bot.id, errors: bot.errors })),
  }, null, 2))
}

async function safely(bot, label, fn) {
  try {
    await fn()
  } catch (error) {
    if (bot) {
      bot.errors.push(`${label}: ${error.message}`)
      note(bot, `I hit a problem during ${label}: ${error.message}`)
    } else {
      throw error
    }
  }
}

async function phase(label, events, fn) {
  const phaseStartedAt = Date.now()
  await wait(config.phaseDelayMs)
  await fn()
  events.push({ label, elapsedMs: Date.now() - phaseStartedAt })
}

async function main() {
  const startedAt = Date.now()
  fs.mkdirSync(path.join(config.runDir, 'raw'), { recursive: true })
  const bots = Array.from({ length: config.count }, (_, index) => botAt(index))
  const relationships = createRelationships(bots)
  const groups = createGroups(bots, relationships)
  const events = []
  await initializeFastMinds(bots)

  fs.writeFileSync(path.join(config.runDir, 'cohort.json'), JSON.stringify({
    config: publicConfig(),
    lifecycle: lifecycle.slice(0, config.sessions),
    bots: bots.map(({ notes, errors, character, player, ...bot }) => bot),
    relationships,
    groups,
  }, null, 2))

  if (config.sessions >= 1) {
    await phase(lifecycle[0].label, events, async () => {
      await runPool(bots, (bot) => safely(bot, 'signup and character creation', () => sessionSignup(bot)))
    })
  }
  if (config.sessions >= 2) {
    await phase(lifecycle[1].label, events, async () => {
      await runPool(relationships, (relationship) => sessionDirectedLikes(relationship, bots))
    })
  }
  if (config.sessions >= 3) {
    await phase(lifecycle[2].label, events, async () => {
      await runPool(relationships, (relationship) => sessionAcceptAndMatch(relationship, bots))
    })
  }
  if (config.sessions >= 4) {
    await phase(lifecycle[3].label, events, async () => {
      await runPool(relationships.filter((relationship) => relationship.matchId), (relationship) => sessionChat(relationship, bots))
    })
  }
  if (config.sessions >= 5) {
    await phase(lifecycle[4].label, events, async () => {
      await runPool(relationships.filter((relationship) => relationship.matchId), (relationship) => sessionRoleplayAndInvite(relationship, bots))
    })
  }
  if (config.sessions >= 6) {
    await phase(lifecycle[5].label, events, async () => {
      await runPool(relationships.filter((relationship) => relationship.matchId), (relationship) => sessionTablesOrOrganizer(relationship, bots))
    })
  }
  if (config.sessions >= 7) {
    await phase(lifecycle[6].label, events, async () => {
      await runPool(relationships.filter((relationship) => relationship.matchId), (relationship) => sessionFirstDate(relationship, bots))
    })
  }
  if (config.sessions >= 8) {
    await phase(lifecycle[7].label, events, async () => {
      await runPool(relationships.filter((relationship) => relationship.matchId), (relationship) => sessionSecondDate(relationship, bots))
    })
  }
  if (config.sessions >= 9) {
    await phase(lifecycle[8].label, events, async () => {
      await sessionGroups(groups, relationships, bots)
    })
  }
  if (config.sessions >= 10) {
    await phase(lifecycle[9].label, events, async () => {
      await runPool(groups, (group) => sessionCampaignContinuity(group, bots))
    })
  }
  if (config.sessions >= 11) {
    await phase(`${lifecycle[10].label} and ${lifecycle[11].label}`, events, async () => {
      await runPool(bots, (bot) => sessionAnnualReturn(bot))
    })
  }

  for (const bot of bots) writeRaw(bot)
  fs.writeFileSync(path.join(config.runDir, 'relationships.json'), JSON.stringify(relationships, null, 2))
  fs.writeFileSync(path.join(config.runDir, 'groups.json'), JSON.stringify(groups, null, 2))
  fs.writeFileSync(path.join(config.runDir, 'timeline.json'), JSON.stringify(events, null, 2))
  writeAnalysis(bots, relationships, groups, events, startedAt)

  const summary = JSON.parse(fs.readFileSync(path.join(config.runDir, 'summary.json'), 'utf8'))
  console.log(JSON.stringify({
    runDir: config.runDir,
    bots: config.count,
    virtualYears: config.years,
    lifecycleSessions: Math.min(config.sessions, lifecycle.length),
    happy: summary.happy,
    unhappy: summary.unhappy,
    median: summary.median,
    p90: summary.p90,
    errors: summary.errorBots.length,
    matchedRelationships: summary.relationships.filter((relationship) => relationship.matchId).length,
    secondDates: summary.relationships.filter((relationship) => relationship.status === 'second_date').length,
    groups: summary.groups.filter((group) => group.status === 'active').length,
    llm: {
      provider: llmStats.provider,
      model: llmStats.model,
      calls: llmStats.calls,
      failures: llmStats.failures,
      fallbacks: llmStats.fallbacks,
    },
    actions: summary.actions,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
