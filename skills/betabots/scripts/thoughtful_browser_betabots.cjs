#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const config = {
  appUrl: (process.env.BETABOT_APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  count: Number(process.env.BETABOT_THOUGHTFUL_COUNT || process.env.BETABOT_COUNT || 3),
  minutes: Number(process.env.BETABOT_THOUGHTFUL_MINUTES || 8),
  concurrency: Number(process.env.BETABOT_THOUGHTFUL_CONCURRENCY || 1),
  headless: String(process.env.BETABOT_HEADLESS || 'false') === 'true',
  timeScale: Number(process.env.BETABOT_TIME_SCALE || 1),
  seed: Number(process.env.BETABOT_SEED || 20260630),
  runDir: process.env.BETABOT_RUN_DIR || `.betabots/runs/${new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)}-thoughtful`,
}

const roles = [
  'lonely player seeking party chemistry',
  'privacy-sensitive lurker',
  'new D&D player who needs beginner safety',
  'mobile-first impatient user',
  'GM looking for reliable players',
  'romance-curious roleplayer',
  'friendship-first table seeker',
  'venue organizer evaluating demand',
]
const names = ['Mira', 'Sol', 'Niko', 'Tara', 'Ren', 'Ari', 'Vale', 'June', 'Rook', 'Iris']
const baselines = ['curious', 'guarded', 'skeptical', 'hopeful', 'impatient', 'playful']
const endings = [
  'completed session and will come back later',
  'understood value but needs more live people',
  'got lost, did not know what to do, and left',
  'felt cautious and left for now',
  'found enough value for one session',
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
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms * config.timeScale)))

function personaAt(index) {
  const role = roles[index % roles.length]
  return {
    id: `thoughtful-betabot-${String(index + 1).padStart(3, '0')}`,
    name: `${names[index % names.length]} ${Math.floor(index / names.length) + 1}`,
    role,
    past: pastFor(role),
    discovery: pick([
      'A friend mentioned this after a campaign dissolved.',
      'I found it while searching for D&D dating alternatives.',
      'I saw a local tabletop post and wanted to see if it was real.',
      'I am bored at night and wondering if I can find people who get my hobby.',
    ]),
    goal: goalFor(role),
    emotionalBaseline: pick(baselines),
    technicalComfort: pick(['low', 'medium', 'high']),
    attentionSpanMinutes: clamp(config.minutes + Math.round((random() - 0.5) * 4), 3, 30),
  }
}

function pastFor(role) {
  if (role.includes('privacy')) return 'I have had weird experiences in online communities, so I look for safety cues before engaging.'
  if (role.includes('new D&D')) return 'I have only played a few sessions and worry about joining a table that expects too much.'
  if (role.includes('GM')) return 'I have run campaigns before, but unreliable players burned me out.'
  if (role.includes('organizer')) return 'I help organize small game nights and need to know whether people will actually show up.'
  if (role.includes('romance')) return 'Dating apps feel shallow, but I like the idea of meeting through shared imagination.'
  return 'My last group faded out, and I miss the feeling of table chemistry.'
}

function goalFor(role) {
  if (role.includes('privacy')) return 'Understand whether I can browse without oversharing.'
  if (role.includes('new D&D')) return 'Find signs that beginners are welcome and safe.'
  if (role.includes('GM')) return 'See whether profiles reveal useful table compatibility.'
  if (role.includes('organizer')) return 'Check whether the product can drive real tabletop attendance.'
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
  if (text.includes('create') && text.includes('character')) return `I understand this wants me to express myself through a character, which fits my reason for being here.`
  if (text.includes('match') || text.includes('likes')) return `I am looking for signs that real people are here, not just static profiles.`
  if (text.includes('table') || text.includes('session') || text.includes('reserve')) return `This feels more concrete because it connects online browsing to an actual table.`
  if (text.includes('sign in') || text.includes('auth')) return `I pause because account walls make me wonder how much information I must give before seeing value.`
  if (phase === 'arrival') return `I am trying to figure out, in plain language, whether this is for dating, friendship, campaigns, or all of them.`
  return `I scan for the next obvious action and whether the page gives me enough confidence to keep going.`
}

function ideaFrom(bot, observation) {
  const text = observation.text.toLowerCase()
  if (text.includes('beginner')) return 'Idea: make beginner-friendly safety cues visible before asking me to commit.'
  if (text.includes('empty') || text.includes('no ')) return 'Idea: when nothing is available, show a concrete next step instead of only saying it is empty.'
  if (text.includes('match')) return 'Idea: explain why a match is compatible, not only that it happened.'
  if (bot.role.includes('privacy')) return 'Idea: show privacy controls early, before I create too much.'
  return 'Idea: keep the next best action visually obvious after every page transition.'
}

async function runBot(browser, bot) {
  const startedAt = Date.now()
  const context = await browser.newContext({
    viewport: bot.role.includes('mobile') ? { width: 390, height: 844 } : { width: 1366, height: 900 },
    userAgent: bot.role.includes('mobile')
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
      : undefined,
  })
  const page = await context.newPage()
  const notes = []
  const actions = []
  const errors = []
  let step = 1
  let value = 0
  let trust = 45
  let emptyCharacterViews = 0
  let createdCharacter = false

  const log = (text) => notes.push(`- T+${elapsed(startedAt)} ${text}`)

  try {
    log(`I arrive as ${bot.role}. My past: ${bot.past}`)
    log(`Today I want to: ${bot.goal}`)
    await page.goto(config.appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await wait(2500 + random() * 5000)
    let observation = await observe(page)
    await screenshot(page, bot, step++)
    log(`I see "${observation.title || 'the app'}". ${observation.text}`)
    log(`I think: ${think(bot, observation, 'arrival')}`)
    log(ideaFrom(bot, observation))

    const sessionMs = bot.attentionSpanMinutes * 60 * 1000
    const maxMoves = clamp(Math.round(bot.attentionSpanMinutes * 3), 8, 45)
    const routes = [
      { labels: [/get started/i, /start/i, /try/i, /demo/i, /discover/i], fallback: '/discover' },
      { labels: [/create/i, /profile/i, /character/i], fallback: '/profile' },
      { labels: [/discover/i, /browse/i, /find/i], fallback: '/discover' },
      { labels: [/likes/i, /matches/i], fallback: '/likes-you' },
      { labels: [/matches/i, /chat/i], fallback: '/matches' },
      { labels: [/table/i, /marketplace/i, /sessions/i, /reserve/i], fallback: '/tabletop' },
    ]

    for (let move = 0; move < maxMoves && Date.now() - startedAt < sessionMs; move += 1) {
      const remainingMs = sessionMs - (Date.now() - startedAt)
      await wait(Math.min(remainingMs, 7000 + random() * 16000))
      if (Date.now() - startedAt >= sessionMs) break
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
      log(`I think: ${thought}`)
      log(ideaFrom(bot, observation))

      const lower = observation.text.toLowerCase()
      if (lower.includes('match') || lower.includes('character') || lower.includes('reserve') || lower.includes('session')) value += 12
      if (lower.includes('safety') || lower.includes('privacy') || lower.includes('beginner')) trust += 8
      if (lower.includes('error') || lower.includes('something went wrong')) trust -= 20
      if (lower.includes('start with a character') || lower.includes('character required')) emptyCharacterViews += 1

      if (!createdCharacter && emptyCharacterViews > 0) {
        createdCharacter = await tryCreateCharacter(page, bot, log, actions)
        if (createdCharacter) {
          value += 18
          trust += 8
          observation = await observe(page)
          await screenshot(page, bot, step++)
          log(`After creating a character, I see: ${observation.text}`)
        } else if (emptyCharacterViews >= 2) {
          trust -= 8
          log(`I am looping on the character requirement and starting to lose patience.`)
        }
      }

      const reserveClicked = await clickFirst(page, [/^like$/i, /^pass$/i, /^reserve$/i, /^save$/i, /^message$/i])
      if (reserveClicked) {
        actions.push(`clicked ${reserveClicked}`)
        log(`I try "${reserveClicked}" and watch whether the app reacts clearly.`)
        await wait(3000 + random() * 7000)
      }
    }

    while (Date.now() - startedAt < sessionMs) {
      const remainingMs = sessionMs - (Date.now() - startedAt)
      await wait(Math.min(remainingMs, 12000 + random() * 18000))
      if (Date.now() - startedAt >= sessionMs) break
      observation = await observe(page)
      log(`I linger instead of rushing. I think: ${think(bot, observation, 'linger')}`)
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

## Action Evidence
${actions.length ? actions.map((action) => `- ${action}`).join('\n') : '- None'}

## Errors
${errors.length ? errors.map((error) => `- ${error}`).join('\n') : '- None'}
`
  fs.writeFileSync(path.join(config.runDir, 'raw', `${bot.id}.md`), raw)
  return { id: bot.id, score, endReason, errors, actions: actions.length, screenshots: step - 1 }
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

function writeAnalysis(results, startedAt) {
  const scores = results.map((result) => result.score).sort((a, b) => a - b)
  const happy = scores.filter((score) => score >= 70).length
  const unhappy = scores.filter((score) => score < 50).length
  const errorBots = results.filter((result) => result.errors.length > 0)
  const median = scores[Math.floor(scores.length * 0.5)] || 0
  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
  const summary = {
    config,
    elapsedSeconds,
    happy,
    unhappy,
    median,
    errorBots,
    results,
  }
  fs.writeFileSync(path.join(config.runDir, 'summary.json'), JSON.stringify(summary, null, 2))
  fs.writeFileSync(path.join(config.runDir, 'analysis.md'), `# Thoughtful Browser Betabot Analysis

## Run Configuration
- Bots: ${results.length}
- App URL: ${config.appUrl}
- Estimated minutes per bot: ${config.minutes}
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
- Error bots: ${errorBots.length}

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
  fs.writeFileSync(path.join(config.runDir, 'cohort.json'), JSON.stringify({ config, bots }, null, 2))
  const playwright = await requirePlaywright()
  const browser = await playwright.chromium.launch({ headless: config.headless })
  const results = []
  await runPool(bots, async (bot) => {
    results.push(await runBot(browser, bot))
  }, config.concurrency)
  await browser.close()
  writeAnalysis(results, startedAt)
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
