const state = { runs: [], currentRun: null, currentBot: null, tab: 'overview' }
const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}

function fmt(value, fallback = 'n/a') { return value === null || value === undefined || value === '' ? fallback : String(value) }
function plural(count, word) { return `${count} ${count === 1 ? word : `${word}s`}` }
function initialsFor(value) { return String(value || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '?' }
function fileUrl(run, file) { return `/api/file?run=${encodeURIComponent(run.id)}&path=${encodeURIComponent(file)}` }
function eventText(event) { return event.type === 'screenshot' ? `Captured ${event.label || 'screenshot'}${event.title ? ` · ${event.title}` : ''}` : event.type === 'screenshot-error' ? `Screenshot failed${event.label ? ` · ${event.label}` : ''}` : event.text || event.label || event.type }

function renderAvatar(bot, className = 'bot-avatar') {
  const url = bot?.avatar?.url || bot?.avatarUrl || ''
  const label = `${bot?.name || bot?.id || 'Betabot'} avatar`
  if (!url) return `<span class="${className} avatar-fallback" aria-label="${escapeHtml(label)}">${escapeHtml(initialsFor(bot?.name || bot?.id))}</span>`
  return `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(label)}" data-avatar-name="${escapeHtml(bot?.name || bot?.id || 'Betabot')}" loading="lazy" referrerpolicy="no-referrer">`
}

function bindAvatarFallbacks(root = document) {
  root.querySelectorAll('img[data-avatar-name]').forEach((image) => {
    image.addEventListener('error', () => {
      const fallback = document.createElement('span')
      fallback.className = `${image.className} avatar-fallback`
      fallback.setAttribute('aria-label', image.alt || 'Betabot avatar')
      fallback.textContent = initialsFor(image.dataset.avatarName)
      image.replaceWith(fallback)
    }, { once: true })
  })
}

async function getJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

function runStatus(run) {
  if (!run.hasSummary) return ['warn', 'partial']
  if (run.fallbacks > 0) return ['warn', 'fallbacks']
  if (run.unhappy && !run.happy) return ['coral', 'unhappy']
  return ['teal', 'recorded']
}

function renderRuns() {
  $('#run-count').textContent = state.runs.length
  $('#run-list').innerHTML = state.runs.map((run) => {
    const [kind, label] = runStatus(run)
    return `<button class="run-item ${state.currentRun?.id === run.id ? 'active' : ''}" data-run="${escapeHtml(run.id)}" type="button" aria-pressed="${state.currentRun?.id === run.id}">
      <span class="run-name">${escapeHtml(run.id)}</span><span class="run-meta"><span class="chip ${kind}">${escapeHtml(label)}</span><span>${escapeHtml(plural(run.bots, 'bot'))}</span></span>
    </button>`
  }).join('') || '<p class="muted">No visible runs found.</p>'
  $$('.run-item').forEach((button) => button.addEventListener('click', () => selectRun(button.dataset.run)))
}

function renderStudyNotes(text) {
  if (!text) return '<p class="muted">No analysis.md was recorded for this run.</p>'
  const lines = text.split(/\r?\n/)
  return `<div class="study-notes">${lines.map((line) => {
    if (/^# /.test(line)) return `<h3>${escapeHtml(line.slice(2))}</h3>`
    if (/^## /.test(line)) return `<h4>${escapeHtml(line.slice(3))}</h4>`
    if (/^- /.test(line)) return `<p class="note-item">${escapeHtml(line.slice(2))}</p>`
    if (!line.trim()) return '<div class="note-gap"></div>'
    return `<p>${escapeHtml(line)}</p>`
  }).join('')}</div><details class="source-disclosure"><summary>Read original analysis.md</summary><pre>${escapeHtml(text)}</pre></details>`
}

function analysisSection(text, heading) {
  const match = String(text || '').match(new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |$)`, 'm'))
  return match ? match[1].trim() : ''
}

function renderHighlights(text) {
  const sections = ['Top Bot Ideas', 'Confidence Tiers']
    .map((heading) => ({ heading, body: analysisSection(text, heading) }))
    .filter((section) => section.body)
  if (!sections.length) return '<p class="muted">No highlight sections were recorded in analysis.md.</p>'
  return `<div class="highlight-grid">${sections.map((section) => `<article><h4>${escapeHtml(section.heading)}</h4>${section.body.split(/\r?\n/).filter(Boolean).map((line) => `<p>${escapeHtml(line.replace(/^- /, ''))}</p>`).join('')}</article>`).join('')}</div>`
}

function renderOverview(run) {
  $('#tab-overview').innerHTML = `<div class="overview-grid">
    <article class="notes-card panel"><div class="section-kicker">Study notes · analysis.md</div><h3>What this run recorded</h3><section data-testid="source-highlights" class="source-highlights"><span class="section-kicker">Source-derived highlights</span>${renderHighlights(run.analysis)}</section><details class="full-notes"><summary>Read full study notes</summary>${renderStudyNotes(run.analysis)}</details></article>
    <aside class="signal-card"><span class="section-kicker">At a glance</span><div class="signal-grid">
      <div><strong>${escapeHtml(fmt(run.bots, '0'))}</strong><span>bots</span></div><div><strong>${escapeHtml(fmt(run.median))}</strong><span>median score</span></div>
      <div><strong>${escapeHtml(fmt(run.actions, '0'))}</strong><span>recorded actions</span></div><div><strong>${escapeHtml(fmt(run.screenshots?.length ?? run.screenshots, '0'))}</strong><span>screenshots</span></div>
    </div><p class="muted">Counts are run artifacts, not conclusions.</p><div class="jump-row"><button class="quiet-button" data-jump="bots" type="button">Open bot stories</button><button class="quiet-button" data-jump="evidence" type="button">Open evidence</button></div></aside>
  </div>`
  $$('#tab-overview [data-jump]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.jump, true)))
}

function botDetail(bot, run) {
  const events = bot.evidenceEvents || []
  const actions = bot.actionEvidence || []
  const mindEvents = events.filter((event) => event.kind === 'mind')
  const activity = events.map((event) => `<li><code>${escapeHtml(event.elapsed || event.at || 'n/a')}</code><span>${escapeHtml(eventText(event))}</span>${event.screenshot ? `<a href="${fileUrl(run, event.screenshot)}" target="_blank" rel="noreferrer">Screenshot</a>` : ''}</li>`).join('')
  return `<article class="bot-detail panel" tabindex="-1"><div class="detail-heading">${renderAvatar(bot, 'bot-avatar bot-avatar-large')}<div><span class="section-kicker">Selected bot story</span><h3>${escapeHtml(bot.name || bot.id)}</h3><p>${escapeHtml(bot.role || 'No role recorded')}</p></div></div>
    <div class="detail-facts"><div><span>Life goal</span><strong>${escapeHtml(bot.lifeGoal || 'Not recorded')}</strong></div><div><span>End reason</span><strong>${escapeHtml(bot.endReason || 'Not recorded')}</strong></div><div><span>Score</span><strong>${escapeHtml(fmt(bot.score))}</strong></div><div><span>Mind events</span><strong>${mindEvents.length}</strong></div><div><span>Evidence events</span><strong>${events.length}</strong></div></div>
    <section><h4>Ideas</h4>${bot.ideas?.length ? `<ul class="compact-list">${bot.ideas.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="muted">No ideas were recorded.</p>'}</section>
    <section><h4>Action evidence</h4>${actions.length ? `<ul class="compact-list">${actions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="muted">No explicit UI action evidence was recorded.</p>'}</section>
    <section><h4>Truth assessments</h4><p>${escapeHtml((bot.truthAssessments || []).join(' ') || 'None recorded.')}</p></section>
    <section><h4>Life-cost decisions</h4><p>${escapeHtml((bot.lifeDecisions || []).join(' ') || 'None recorded.')}</p></section>
    <details class="source-disclosure story-timeline-disclosure"><summary>Open full evidence timeline (${escapeHtml(plural(events.length, 'event'))})</summary>${activity ? `<ul class="story-timeline">${activity}</ul>` : '<p class="muted">No evidence JSONL was recorded for this bot.</p>'}</details>
    <details class="source-disclosure"><summary>Read raw persona story</summary><pre>${escapeHtml(bot.raw || 'No raw story file was recorded.')}</pre></details>
  </article>`
}

function renderBots(run) {
  const bots = run.rawBots || []
  $('#tab-bots').innerHTML = `<div class="panel-heading"><div><span class="section-kicker">Bot stories</span><h3>Open a bot’s account in context</h3><p>Each story stays connected to its recorded actions and screenshots.</p></div></div>
    ${bots.length ? `<div class="bot-grid">${bots.map((bot) => `<button class="bot-card ${state.currentBot?.id === bot.id ? 'active' : ''}" data-bot="${escapeHtml(bot.id)}" type="button" aria-expanded="${state.currentBot?.id === bot.id}">${renderAvatar(bot)}<span><strong>${escapeHtml(bot.name || bot.id)}</strong><small>${escapeHtml(bot.role || 'Role not recorded')}</small></span><span class="chip">${escapeHtml(plural(bot.eventCount || 0, 'event'))}</span></button>`).join('')}</div>` : '<p class="empty-copy">No raw bot stories were recorded for this run.</p>'}
    <div id="bot-story-detail">${state.currentBot ? botDetail(state.currentBot, run) : '<p class="select-prompt">Choose a bot to open its story, evidence trail, and raw source.</p>'}</div>`
  $$('#tab-bots [data-bot]').forEach((button) => button.addEventListener('click', () => {
    const bot = bots.find((item) => item.id === button.dataset.bot)
    if (bot) { state.currentBot = bot; renderBots(run); $('#bot-story-detail .bot-detail')?.focus(); bindAvatarFallbacks($('#tab-bots')) }
  }))
  bindAvatarFallbacks($('#tab-bots'))
}

function renderEventGroup(bot, run) {
  const events = bot.evidenceEvents || []
  return `<details class="evidence-group"><summary><span>${escapeHtml(bot.name || bot.id)}</span><span>${escapeHtml(bot.role || '')}</span><span class="chip">${escapeHtml(plural(events.length, 'event'))}</span>${bot.loadingEvents?.length ? `<span class="chip warn">${escapeHtml(plural(bot.loadingEvents.length, 'loading flag'))}</span>` : ''}</summary>
    ${events.length ? `<ol class="event-list">${events.map((event) => `<li class="${event.loadingRisk ? 'risk' : ''}"><code>${escapeHtml(event.elapsed || event.at || 'n/a')}</code><div><span class="chip">${escapeHtml(event.kind || event.type)}</span><p>${escapeHtml(eventText(event))}</p>${event.visibleText ? `<p class="visible-text">${escapeHtml(event.visibleText)}</p>` : ''}${event.screenshot ? `<a href="${fileUrl(run, event.screenshot)}" target="_blank" rel="noreferrer">Open screenshot</a>` : ''}</div></li>`).join('')}</ol>` : '<p class="muted">No evidence JSONL found for this bot.</p>'}
  </details>`
}

function renderEvidence(run) {
  const bots = run.rawBots || []
  const truth = bots.flatMap((bot) => (bot.truthAssessments || []).map((text) => ({ bot, text })))
  const shots = run.screenshots || []
  $('#tab-evidence').innerHTML = `<div class="panel-heading"><div><span class="section-kicker">Evidence</span><h3>Actions, screenshots, and truth checks</h3><p>These are the recorded artifacts behind the report, including explicit loading flags.</p></div></div>
    <section class="evidence-section"><h4>Bot timelines and action evidence</h4>${bots.length ? `<div class="evidence-groups">${bots.map((bot) => renderEventGroup(bot, run)).join('')}</div>` : '<p class="muted">No bot evidence was recorded.</p>'}</section>
    <section class="evidence-section"><h4>Screenshots</h4>${shots.length ? `<div class="gallery">${shots.map((shot) => `<a class="shot" href="${fileUrl(run, `screenshots/${shot}`)}" target="_blank" rel="noreferrer"><img src="${fileUrl(run, `screenshots/${shot}`)}" alt="Recorded screenshot: ${escapeHtml(shot)}"><code>${escapeHtml(shot)}</code></a>`).join('')}</div>` : '<p class="muted">No screenshots found.</p>'}</section>
    <section class="evidence-section"><h4>Truth assessments</h4>${truth.length ? `<div class="truth-list">${truth.map(({ bot, text }) => `<article><strong>${escapeHtml(bot.name || bot.id)}</strong><p>${escapeHtml(text)}</p></article>`).join('')}</div>` : '<p class="muted">No explicit truth assessments were recorded. This run may be incomplete or from an older runner.</p>'}</section>`
}

function renderActivityItems(items = [], type) {
  if (!items.length) return '<p class="muted">None recorded.</p>'
  return `<div class="activity-list">${items.map((item) => `<article><span class="chip">${escapeHtml(type)}</span>${item.at ? `<code>${escapeHtml(item.at)}</code>` : ''}<strong>${escapeHtml(item.title || item.id || item.type || 'Recorded item')}</strong>${item.body || item.message ? `<p>${escapeHtml(item.body || item.message)}</p>` : `<pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre>`}</article>`).join('')}</div>`
}

function renderBetabook(run) {
  const raw = run.betabookRaw || {}
  return `<details class="technical-block"><summary>Betabook <span>${raw.enabled ? 'enabled' : 'disabled'}</span></summary>${renderActivityItems([...(raw.posts || []), ...(raw.comments || []), ...(raw.invites || []), ...(raw.events || [])], 'betabook')}</details>`
}

function renderDestiny(run) {
  const raw = run.destinyRaw || {}
  return `<details class="technical-block"><summary>Destiny <span>${raw.enabled ? 'enabled' : 'disabled'}</span></summary>${renderActivityItems([...(raw.masterPlan || []), ...(raw.events || []), ...(raw.nudges || [])], 'destiny')}</details>`
}

function renderTechnical(run) {
  const llmTasks = Object.entries(run.llm?.tasks || {}).map(([task, count]) => `${task}=${count}`).join(', ') || 'None recorded'
  const files = run.files || []
  $('#tab-technical').innerHTML = `<div class="panel-heading"><div><span class="section-kicker">Technical details</span><h3>Provenance and raw run artifacts</h3><p>These details are kept available without leading the study report.</p></div></div>
    <section class="technical-summary panel"><div><span>Run root</span><code>${escapeHtml(run.id)}</code></div><div><span>LLM / fallbacks</span><p>${escapeHtml(run.llmProvider || 'unknown')} · ${escapeHtml(fmt(run.llm?.calls, '0'))} calls · ${escapeHtml(fmt(run.fallbacks, '0'))} fallbacks</p><p class="muted">${escapeHtml(llmTasks)}</p></div><div><span>Debug counters</span><p>${escapeHtml(fmt(run.actions, '0'))} actions · ${escapeHtml(fmt(run.loadingRisks, '0'))} loading flags · ${escapeHtml(fmt(run.truthAssessments, '0'))} truth assessments</p></div><div><span>Launch command</span><code>node web/server.cjs --runs /path/to/.betabots/runs --port 3999</code></div></section>
    ${renderBetabook(run)}${renderDestiny(run)}
    <details class="technical-block"><summary>Files &amp; artifacts <span>${files.length}</span></summary>${files.length ? `<div class="file-list">${files.map((file) => `<a href="${fileUrl(run, file)}" target="_blank" rel="noreferrer">${escapeHtml(file)}</a>`).join('')}</div>` : '<p class="muted">No files found.</p>'}</details>`
}

function renderRun(run) {
  $('#empty-state').classList.add('hidden')
  $('#run-view').classList.remove('hidden')
  $('#run-title').textContent = run.id
  $('#run-subtitle').textContent = run.appName || 'Unknown app'
  renderOverview(run); renderBots(run); renderEvidence(run); renderTechnical(run); switchTab(state.tab)
}

function switchTab(tab, focus = false) {
  state.tab = tab
  $$('.tab').forEach((button) => {
    const active = button.dataset.tab === tab
    button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1
  })
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== `tab-${tab}`))
  if (focus) $(`#tab-control-${tab}`)?.focus()
}

async function selectRun(runId) {
  const run = await getJson(`/api/runs/${encodeURIComponent(runId)}`)
  state.currentRun = run; state.currentBot = null; state.tab = 'overview'; renderRuns(); renderRun(run); bindAvatarFallbacks()
}

async function refresh() {
  const payload = await getJson('/api/runs')
  state.runs = payload.runs || []; renderRuns()
  if (state.runs.length && !state.currentRun) await selectRun(state.runs[0].id)
}

function showError(error) {
  $('#empty-state').classList.remove('hidden'); $('#run-view').classList.add('hidden')
  $('#empty-state').innerHTML = `<span class="led coral"></span><h2>Dashboard error</h2><p>${escapeHtml(error.message)}</p>`
}

$$('.tab').forEach((button) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab))
  button.addEventListener('keydown', (event) => {
    const tabs = $$('.tab'); const current = tabs.indexOf(button)
    let next = null
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length
    if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = tabs.length - 1
    if (next !== null) { event.preventDefault(); switchTab(tabs[next].dataset.tab, true) }
  })
})

$('#refresh-button').addEventListener('click', () => refresh().catch(showError))
refresh().catch(showError)
