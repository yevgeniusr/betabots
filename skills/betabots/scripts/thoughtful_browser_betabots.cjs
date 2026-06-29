#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

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

async function runBot(browser, bot) {
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

  try {
    log(`I arrive as ${bot.role}. My past: ${bot.past}`)
    log(`Today I want to: ${bot.goal}`)
    if (authToken) log(`I have my own isolated test account for this session.`)
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

## Action Evidence
${actions.length ? actions.map((action) => `- ${action}`).join('\n') : '- None'}

## Errors
${errors.length ? errors.map((error) => `- ${error}`).join('\n') : '- None'}
`
  fs.writeFileSync(path.join(config.runDir, 'raw', `${bot.id}.md`), raw)
  return { id: bot.id, score, endReason, errors, actions: actions.length, screenshots: step - 1, ideas, thoughts: thoughts.length, opinions: opinions.length, attentionSpanMinutes: bot.attentionSpanMinutes }
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
- Error bots: ${errorBots.length}

## Top Bot Ideas
${topIdeas.length ? topIdeas.slice(0, 10).map(([idea, count]) => `- ${count} bots: ${idea}`).join('\n') : '- None'}

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
