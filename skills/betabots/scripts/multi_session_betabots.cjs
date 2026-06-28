#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

// Default adapter targets DnDate-style APIs: players, characters, reactions, matches, and tabletop.
// Override BETABOT_BACKEND_URL, BETABOT_AUTH_TOKEN/E2E_AUTH_TOKEN, and run settings via env.
const config = {
  count: Number(process.env.BETABOT_COUNT || 200),
  sessions: Number(process.env.BETABOT_SESSIONS || 4),
  concurrency: Number(process.env.BETABOT_CONCURRENCY || 16),
  backendUrl: (process.env.BETABOT_BACKEND_URL || 'http://localhost:3001/api').replace(/\/$/, ''),
  token: process.env.E2E_AUTH_TOKEN || process.env.BETABOT_AUTH_TOKEN || 'metabot-live-token-20260629',
  runDir: process.env.BETABOT_RUN_DIR || `.betabots/runs/${new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)}-live`,
  seed: Number(process.env.BETABOT_SEED || 20260629),
}

const races = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Tiefling', 'Dragonborn', 'Half-Elf', 'Gnome']
const classes = ['Bard', 'Rogue', 'Wizard', 'Fighter', 'Cleric', 'Ranger', 'Warlock', 'Paladin']
const alignments = ['Chaotic Good', 'Neutral Good', 'True Neutral', 'Lawful Neutral', 'Chaotic Neutral']
const vibes = ['Cozy', 'Epic', 'Gritty', 'Whimsical', 'Dark', 'Heroic']
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
]
const names = [
  'Mira', 'Sol', 'Niko', 'Tara', 'Ren', 'Ari', 'Vale', 'Kestrel', 'Moss', 'June',
  'Pip', 'Rook', 'Iris', 'Omar', 'Lena', 'Theo', 'Nyx', 'Sam', 'Cora', 'Dain',
]
const messageOpeners = [
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

function tokenFor(bot) {
  const roleList = bot.role.includes('organizer') ? 'organizer' : ''
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

  if (response.status === 204) {
    return null
  }
  return response.json()
}

function botAt(index) {
  const role = roles[index % roles.length]
  const name = `${names[index % names.length]} ${Math.floor(index / names.length) + 1}`
  const race = pick(races)
  const className = pick(classes)
  const vibe = pick(vibes)
  return {
    id: `live-betabot-${String(index + 1).padStart(3, '0')}`,
    name,
    role,
    race,
    className,
    vibe,
    alignment: pick(alignments),
    emotionalBaseline: pick(['curious', 'guarded', 'playful', 'impatient', 'hopeful', 'skeptical']),
    attentionSpan: 4 + Math.floor(random() * 18),
    partnerIndexes: [
      (index + 1 + Math.floor(random() * 17)) % config.count,
      (index + 7 + Math.floor(random() * 29)) % config.count,
    ],
    character: null,
    matches: [],
    notes: [],
    errors: [],
    actions: {
      profile: false,
      character: false,
      likesSent: 0,
      passes: 0,
      matchesSeen: 0,
      messagesSent: 0,
      messagesRead: 0,
      tableBrowsed: false,
      tableReserved: false,
    },
  }
}

function note(bot, text) {
  bot.notes.push(`- ${text}`)
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

function characterPayload(bot) {
  return {
    characterName: `${bot.name.split(' ')[0]} the ${bot.className}`,
    race: bot.race,
    className: bot.className,
    alignment: bot.alignment,
    avatarUrl: '',
    characterHook: `${bot.name} is a ${bot.emotionalBaseline} ${bot.role} who wants table chemistry before commitment.`,
    vibe: bot.vibe,
    levelRange: { min: 1, max: 12 },
    editions: ['5e'],
    archetypeTags: [bot.role.split(' ')[0], bot.vibe.toLowerCase()],
    personalityTraits: [bot.emotionalBaseline],
    backstory: `I discovered DnDate during a simulated live beta run and want to see if real-feeling people respond.`,
    prompts: [
      {
        question: 'My ideal session zero includes...',
        answer: 'Clear expectations, safety tools, and enough jokes to know people are human.',
      },
      {
        question: 'My character causes trouble by...',
        answer: 'Asking one sincere question at exactly the wrong time.',
      },
      {
        question: 'I come back to a table when...',
        answer: 'People answer messages and make plans without pressure.',
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

async function sessionOnboard(bot) {
  note(bot, `Session 1: I arrive as ${bot.role}, ${bot.emotionalBaseline}, with ${bot.attentionSpan} minutes of patience.`)
  await api(bot, '/players/me', {
    method: 'PUT',
    body: {
      displayName: bot.name,
      city: pick(['Dubai', 'Abu Dhabi', 'Sharjah', 'Online']),
      pronouns: pick(['they/them', 'she/her', 'he/him', '']),
      languages: pick(['English', 'English, Arabic', 'English, Russian']),
      interestedIn: pick(['Dating', 'Friendship', 'Campaigns', 'Dating, Friendship']),
      preferredLocation: pick(['Online', 'Offline', 'Hybrid']),
    },
  })
  bot.actions.profile = true

  const existing = await api(bot, '/characters')
  if (existing.length > 0) {
    bot.character = existing[0]
    note(bot, `I return and find my existing character, ${bot.character.characterName}.`)
  } else {
    bot.character = await api(bot, '/characters', {
      method: 'POST',
      body: characterPayload(bot),
    })
    note(bot, `I create ${bot.character.characterName}; now I can be seen by other people.`)
  }
  bot.actions.character = true
}

async function sessionBrowseAndReact(bot, bots) {
  note(bot, 'Session 2: I browse after waiting for other people to make characters.')
  await wait(10 + Math.floor(random() * 50))
  const partners = bot.partnerIndexes
    .map((index) => bots[index])
    .filter((partner) => partner && partner.character && partner.id !== bot.id)

  for (const partner of partners) {
    if (random() < 0.82) {
      await api(bot, '/reactions', {
        method: 'POST',
        body: {
          fromCharacterId: bot.character.id,
          toCharacterId: partner.character.id,
          target: { type: 'card', field: pick(['hook', 'vibe', 'prompt']) },
          comment: pick(messageOpeners),
        },
      })
      bot.actions.likesSent += 1
      note(bot, `I like ${partner.character.characterName} and leave a small human note.`)
    } else {
      await api(bot, '/reactions/pass', {
        method: 'POST',
        body: {
          fromCharacterId: bot.character.id,
          toCharacterId: partner.character.id,
        },
      })
      bot.actions.passes += 1
      note(bot, `I pass on ${partner.character.characterName}; not every person is my table.`)
    }
  }
}

async function sessionReplyAndMessage(bot) {
  note(bot, 'Session 3: I come back later to see whether anyone reacted or matched.')
  await wait(10 + Math.floor(random() * 50))

  const incoming = await api(bot, '/reactions/incoming?characterId=')
  for (const reaction of incoming.slice(0, 2)) {
    if (random() < 0.75) {
      await api(bot, `/reactions/${reaction.id}/accept`, { method: 'POST' })
      note(bot, `I accept an incoming reaction from ${reaction.fromCharacter?.characterName || 'someone'}.`)
    } else {
      await api(bot, `/reactions/${reaction.id}/dismiss`, { method: 'PUT' })
      note(bot, 'I dismiss an incoming reaction because the vibe is not right.')
    }
  }

  const matches = await api(bot, '/matches?characterId=')
  bot.matches = matches
  bot.actions.matchesSeen = matches.length
  note(bot, `I see ${matches.length} match${matches.length === 1 ? '' : 'es'}.`)

  for (const match of matches.slice(0, 3)) {
    const fromCharacterId = match.characterAId === bot.character.id ? match.characterAId : match.characterBId === bot.character.id ? match.characterBId : bot.character.id
    const messages = await api(bot, `/matches/${match.id}/messages`)
    bot.actions.messagesRead += messages.length
    if (random() < 0.86) {
      await api(bot, `/matches/${match.id}/messages`, {
        method: 'POST',
        body: {
          fromCharacterId,
          body: messages.length === 0 ? pick(messageOpeners) : pick(replies),
        },
      })
      bot.actions.messagesSent += 1
      note(bot, `I send a message in a match because it feels alive enough to continue.`)
    }
  }
}

async function sessionTablesAndReturn(bot) {
  note(bot, 'Session 4: I check whether the product has something concrete beyond matching.')
  const marketplace = await api(bot, '/tabletop/marketplace?maxPriceCents=15000')
  bot.actions.tableBrowsed = true
  if (marketplace.sessions.length > 0 && random() < 0.32) {
    const session = pick(marketplace.sessions)
    await api(bot, `/tabletop/sessions/${session.id}/reserve`, { method: 'POST' })
    bot.actions.tableReserved = true
    note(bot, `I reserve or waitlist for "${session.title}" because it gives the product a real-world payoff.`)
  } else if (marketplace.sessions.length === 0) {
    note(bot, 'I find no live tables, but the empty state tells me what is missing.')
  } else {
    note(bot, 'I browse tables but decide not to reserve today.')
  }
}

function happiness(bot) {
  let score = 0
  if (bot.actions.profile) score += 15
  if (bot.actions.character) score += 20
  score += Math.min(bot.actions.likesSent, 2) * 8
  if (bot.actions.matchesSeen > 0) score += 22
  if (bot.actions.messagesSent > 0) score += 18
  if (bot.actions.messagesRead > 0) score += 8
  if (bot.actions.tableBrowsed) score += 6
  if (bot.actions.tableReserved) score += 5
  score -= bot.errors.length * 18
  return Math.max(0, Math.min(100, score))
}

function endReason(bot, score) {
  if (bot.errors.length > 0) return 'hit a bug or dead end'
  if (score >= 80) return 'completed multiple sessions and will come back later'
  if (score >= 60) return 'understood value but needs more live people'
  if (score >= 40) return 'partly interested but not convinced'
  return 'got bored or lost and left'
}

function writeRaw(bot) {
  const score = happiness(bot)
  const text = `# ${bot.id} — Multi-Session Raw Storyline

## Persona
- Name: ${bot.name}
- Role: ${bot.role}
- Emotional baseline: ${bot.emotionalBaseline}
- Attention span: ${bot.attentionSpan} minutes
- Character: ${bot.character?.characterName || 'not created'}

## Raw Journey
${bot.notes.join('\n')}

## Session End
- End reason: ${endReason(bot, score)}
- Happiness score: ${score}
- Return likelihood: ${score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low'}
- Trust level: ${bot.errors.length ? 'low' : 'medium-high'}
- Value understood: ${score >= 60 ? 'yes' : 'partial'}

## Action Evidence
- Likes sent: ${bot.actions.likesSent}
- Passes: ${bot.actions.passes}
- Matches seen: ${bot.actions.matchesSeen}
- Messages sent: ${bot.actions.messagesSent}
- Messages read: ${bot.actions.messagesRead}
- Table browsed: ${bot.actions.tableBrowsed}
- Table reserved/waitlisted: ${bot.actions.tableReserved}

## Errors
${bot.errors.length ? bot.errors.map((error) => `- ${error}`).join('\n') : '- None'}
`
  fs.writeFileSync(path.join(config.runDir, 'raw', `${bot.id}.md`), text)
}

function writeAnalysis(bots, startedAt) {
  const scores = bots.map(happiness)
  const happy = scores.filter((score) => score >= 70).length
  const unhappy = scores.filter((score) => score < 50).length
  const actions = bots.reduce((acc, bot) => {
    for (const [key, value] of Object.entries(bot.actions)) {
      acc[key] = (acc[key] || 0) + (typeof value === 'boolean' ? (value ? 1 : 0) : value)
    }
    return acc
  }, {})
  const errorBots = bots.filter((bot) => bot.errors.length > 0)
  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
  const sortedScores = [...scores].sort((a, b) => a - b)
  const p50 = sortedScores[Math.floor(sortedScores.length * 0.5)] || 0
  const p90 = sortedScores[Math.floor(sortedScores.length * 0.9)] || 0

  const analysis = `# Large Multi-Session Betabot Analysis

## Run Configuration
- Bots: ${bots.length}
- Sessions per bot: ${config.sessions}
- Backend: ${config.backendUrl}
- Concurrency: ${config.concurrency}
- Elapsed: ${elapsedSeconds}s
- Started with seed: ${config.seed}

## Happiness
- Happy bots (score >= 70): ${happy}/${bots.length} (${Math.round((happy / bots.length) * 100)}%)
- Unhappy bots (score < 50): ${unhappy}/${bots.length} (${Math.round((unhappy / bots.length) * 100)}%)
- Median score: ${p50}
- P90 score: ${p90}

## Live-App Activity
- Profiles touched: ${actions.profile}
- Characters available: ${actions.character}
- Likes sent: ${actions.likesSent}
- Passes recorded: ${actions.passes}
- Match observations: ${actions.matchesSeen}
- Messages sent: ${actions.messagesSent}
- Messages read: ${actions.messagesRead}
- Table browses: ${actions.tableBrowsed}
- Table reservations/waitlists: ${actions.tableReserved}

## Interpretation
- The app can be populated with a synthetic social graph: users, characters, likes, matches, and message threads.
- Multi-session behavior works: bots wait for the cohort, return, accept/dismiss incoming reactions, and continue conversations.
- Table activity is conditional on marketplace inventory. When no tables exist, bots can still understand the empty inventory state after the previous UI fix.

## Error Bots
${errorBots.length ? errorBots.slice(0, 30).map((bot) => `- ${bot.id}: ${bot.errors.join('; ')}`).join('\n') : '- None'}
`
  fs.writeFileSync(path.join(config.runDir, 'analysis.md'), analysis)
  fs.writeFileSync(path.join(config.runDir, 'summary.json'), JSON.stringify({
    config,
    elapsedSeconds,
    happy,
    unhappy,
    median: p50,
    p90,
    actions,
    errorBots: errorBots.map((bot) => ({ id: bot.id, errors: bot.errors })),
  }, null, 2))
}

async function safely(bot, label, fn) {
  try {
    await fn()
  } catch (error) {
    bot.errors.push(`${label}: ${error.message}`)
    note(bot, `I hit a problem during ${label}: ${error.message}`)
  }
}

async function main() {
  const startedAt = Date.now()
  fs.mkdirSync(path.join(config.runDir, 'raw'), { recursive: true })
  const bots = Array.from({ length: config.count }, (_, index) => botAt(index))
  fs.writeFileSync(path.join(config.runDir, 'cohort.json'), JSON.stringify({ config, bots: bots.map(({ notes, errors, character, matches, ...bot }) => bot) }, null, 2))

  await runPool(bots, (bot) => safely(bot, 'onboarding', () => sessionOnboard(bot)))

  if (config.sessions >= 2) {
    await runPool(bots, (bot) => safely(bot, 'browse and react', () => sessionBrowseAndReact(bot, bots)))
  }
  if (config.sessions >= 3) {
    await runPool(bots, (bot) => safely(bot, 'reply and message', () => sessionReplyAndMessage(bot)))
  }
  if (config.sessions >= 4) {
    await runPool(bots, (bot) => safely(bot, 'tables and return', () => sessionTablesAndReturn(bot)))
  }

  for (const bot of bots) {
    writeRaw(bot)
  }
  writeAnalysis(bots, startedAt)

  const summary = JSON.parse(fs.readFileSync(path.join(config.runDir, 'summary.json'), 'utf8'))
  console.log(JSON.stringify({
    runDir: config.runDir,
    bots: config.count,
    happy: summary.happy,
    unhappy: summary.unhappy,
    median: summary.median,
    p90: summary.p90,
    errors: summary.errorBots.length,
    actions: summary.actions,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
