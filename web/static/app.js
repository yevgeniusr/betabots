const state = {
  runs: [],
  currentRun: null,
  currentBot: null,
  tab: 'analysis',
}

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

function fmt(value, fallback = 'n/a') {
  return value === null || value === undefined || value === '' ? fallback : String(value)
}

function plural(count, word) {
  if (count === 1) return `${count} ${word}`
  if (/[^aeiou]y$/i.test(word)) return `${count} ${word.slice(0, -1)}ies`
  return `${count} ${word}s`
}

function waitLabel(seconds) {
  if (seconds === null || seconds === undefined || seconds < 1) return ''
  return `+${seconds}s wait`
}

function eventText(event) {
  if (event.type === 'screenshot') return `Captured ${event.label || 'screenshot'}${event.title ? ` · ${event.title}` : ''}`
  if (event.type === 'screenshot-error') return `Screenshot failed${event.label ? ` · ${event.label}` : ''}`
  return event.text || event.label || event.type
}

function kindClass(kind) {
  if (kind === 'loading-risk') return 'warn'
  if (kind === 'action') return 'good'
  if (kind === 'betabook' || kind === 'destiny') return 'blue'
  return ''
}

function objectSummary(value) {
  if (!value || typeof value !== 'object') return escapeHtml(fmt(value, ''))
  return escapeHtml(JSON.stringify(value, null, 2))
}

function renderEventFeed(events = [], run, options = {}) {
  if (!events.length) return `<p class="muted">${escapeHtml(options.empty || 'No events recorded.')}</p>`
  return `
    <div class="inspector-feed">
      ${events.map((event) => `
        <div class="feed-row ${event.loadingRisk ? 'risk' : ''}">
          <div class="feed-time">
            <code>${escapeHtml(event.elapsed || event.at || 'n/a')}</code>
            ${event.sincePreviousSeconds ? `<span>${escapeHtml(waitLabel(event.sincePreviousSeconds))}</span>` : ''}
          </div>
          <div class="feed-body">
            <div class="feed-head">
              <span class="chip ${kindClass(event.kind)}">${escapeHtml(event.kind || event.type || 'event')}</span>
              <span class="muted">${escapeHtml(event.type || '')}</span>
              ${event.label ? `<span class="muted">${escapeHtml(event.label)}</span>` : ''}
            </div>
            <p>${escapeHtml(eventText(event))}</p>
            ${event.visibleText ? `<p class="visible-text">${escapeHtml(event.visibleText)}</p>` : event.loadingRisk ? '<p class="visible-text empty-text">No visible text was captured for this screenshot.</p>' : ''}
            ${event.screenshot ? `<a class="screen-link" href="/api/file?run=${encodeURIComponent(run.id)}&path=${encodeURIComponent(event.screenshot)}" target="_blank" rel="noreferrer">Open screenshot</a>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `
}

function renderActivityItems(items = [], type) {
  if (!items.length) return '<p class="muted">None recorded.</p>'
  return `
    <div class="activity-list">
      ${items.map((item) => `
        <div class="activity-item">
          <div class="feed-head">
            <span class="chip blue">${escapeHtml(type)}</span>
            ${item.at ? `<code>${escapeHtml(item.at)}</code>` : ''}
            ${item.type ? `<span class="muted">${escapeHtml(item.type)}</span>` : ''}
          </div>
          ${item.title ? `<strong>${escapeHtml(item.title)}</strong>` : ''}
          ${item.body || item.message ? `<p>${escapeHtml(item.body || item.message)}</p>` : ''}
          ${item.channel ? `<p class="muted">channel: ${escapeHtml(item.channel)}</p>` : ''}
          ${item.kind ? `<p class="muted">kind: ${escapeHtml(item.kind)}</p>` : ''}
          ${item.route ? `<p class="muted">route: ${escapeHtml(item.route)}</p>` : ''}
          ${!item.title && !item.body && !item.message ? `<pre>${objectSummary(item)}</pre>` : ''}
        </div>
      `).join('')}
    </div>
  `
}

function initialsFor(value) {
  return String(value || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?'
}

function renderAvatar(bot, className = 'bot-avatar') {
  const url = bot?.avatar?.url || bot?.avatarUrl || ''
  const label = `${bot?.name || bot?.id || 'Betabot'} avatar`
  if (url) {
    return `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy" referrerpolicy="no-referrer">`
  }
  return `<span class="${className} avatar-fallback" aria-label="${escapeHtml(label)}">${escapeHtml(initialsFor(bot?.name || bot?.id))}</span>`
}

function participantLabel(participants = [], id = '') {
  if (id === 'destiny') return 'Destiny'
  const participant = participants.find((item) => item.id === id)
  return participant?.name || id || 'unknown'
}

function commentsForPost(raw, postId) {
  return (raw?.comments || []).filter((comment) => comment.postId === postId)
}

function renderBetabookThreads(raw) {
  const posts = [...(raw?.posts || [])].sort((a, b) => Date.parse(b.lastActivityAt || b.at || 0) - Date.parse(a.lastActivityAt || a.at || 0))
  if (!posts.length) return '<p class="muted">No Betabook threads recorded.</p>'
  return `
    <div class="betabook-threads">
      ${posts.map((post) => {
        const comments = commentsForPost(raw, post.id)
        return `
          <article class="betabook-thread">
            <div class="thread-head">
              <span class="chip blue">${escapeHtml(post.channel || 'thread')}</span>
              <span class="muted">${escapeHtml(participantLabel(raw.participants, post.authorId))}</span>
              <span class="muted">${escapeHtml(plural(comments.length, 'reply'))}</span>
              <span class="muted">heat ${escapeHtml(fmt(post.heat, '0'))}</span>
              <span class="muted">target ${escapeHtml(fmt(post.replyTarget, '1'))}</span>
              ${post.at ? `<code>${escapeHtml(post.at)}</code>` : ''}
            </div>
            <strong>${escapeHtml(post.title || post.id)}</strong>
            ${post.body ? `<p>${escapeHtml(post.body)}</p>` : ''}
            ${post.tags?.length ? `<p class="muted">${post.tags.map((tag) => `#${escapeHtml(tag)}`).join(' ')}</p>` : ''}
            <div class="thread-comments">
              ${comments.length ? comments.map((comment) => `
                <div class="thread-comment">
                  <div class="thread-head">
                    <span class="chip">reply</span>
                    <span class="muted">${escapeHtml(participantLabel(raw.participants, comment.authorId))}</span>
                    ${comment.at ? `<code>${escapeHtml(comment.at)}</code>` : ''}
                  </div>
                  <p>${escapeHtml(comment.body || '')}</p>
                </div>
              `).join('') : '<p class="muted">No replies yet.</p>'}
            </div>
          </article>
        `
      }).join('')}
    </div>
  `
}

async function getJson(path) {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

function runStatus(run) {
  if (!run.hasSummary) return ['warn', 'partial']
  if (run.fallbacks > 0) return ['warn', 'fallbacks']
  if (run.unhappy && !run.happy) return ['bad', 'unhappy']
  return ['good', 'ready']
}

function renderRuns() {
  $('#run-count').textContent = state.runs.length
  $('#run-list').innerHTML = state.runs.map((run) => {
    const [kind, label] = runStatus(run)
    return `
      <button class="run-item ${state.currentRun?.id === run.id ? 'active' : ''}" data-run="${escapeHtml(run.id)}" type="button">
        <span class="run-name">${escapeHtml(run.id)}</span>
        <span class="run-meta">
          <span class="chip ${kind}"><span class="led ${kind === 'bad' ? 'red' : kind === 'warn' ? 'yellow' : ''}"></span>${label}</span>
          <span class="muted">${run.bots} bots</span>
          <span class="muted">${new Date(run.updatedAt).toLocaleString()}</span>
        </span>
      </button>
    `
  }).join('') || '<p class="muted">No runs found.</p>'

  $$('.run-item').forEach((button) => {
    button.addEventListener('click', () => selectRun(button.dataset.run))
  })
}

function renderOverview(run) {
  $('#empty-state').classList.add('hidden')
  $('#run-view').classList.remove('hidden')
  $('#run-title').textContent = run.id
  $('#run-subtitle').textContent = run.appName
  $('#metric-bots').textContent = fmt(run.bots, '0')
  $('#metric-median').textContent = fmt(run.median)
  $('#metric-fallbacks').textContent = fmt(run.fallbacks, '0')
  $('#metric-truth').textContent = fmt(run.truthAssessments, '0')
  $('#metric-screens').textContent = fmt(Array.isArray(run.screenshots) ? run.screenshots.length : run.screenshots, '0')
  $('#metric-actions').textContent = fmt(run.actions, '0')
  $('#metric-loading').textContent = fmt(run.loadingRisks, '0')
}

function renderAnalysis(run) {
  const text = run.analysis || 'No analysis.md found for this run.'
  $('#tab-analysis').innerHTML = `<pre class="analysis-text">${escapeHtml(text)}</pre>`
}

function renderBots(run) {
  const bots = run.rawBots || []
  $('#tab-bots').innerHTML = bots.length ? `
    <table class="table">
      <thead><tr><th>Bot</th><th>Role</th><th>Score</th><th>End</th><th>Actions</th><th>Events</th><th>Loading</th><th>Truth</th></tr></thead>
      <tbody>
        ${bots.map((bot) => `
          <tr>
            <td><button class="bot-link" data-bot="${escapeHtml(bot.id)}" type="button">${renderAvatar(bot, 'bot-avatar bot-avatar-small')}<span>${escapeHtml(bot.name || bot.id)}</span></button></td>
            <td>${escapeHtml(bot.role)}</td>
            <td>${escapeHtml(fmt(bot.score))}</td>
            <td>${escapeHtml(bot.endReason || 'n/a')}</td>
            <td>${escapeHtml(fmt(bot.actionCount, '0'))}</td>
            <td>${escapeHtml(fmt(bot.eventCount, '0'))}</td>
            <td>${bot.loadingEvents?.length ? `<span class="chip warn">${bot.loadingEvents.length}</span>` : '<span class="muted">0</span>'}</td>
            <td>${bot.truthAssessments.length}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="muted">No raw bot logs found.</p>'

  $$('#tab-bots .bot-link').forEach((button) => {
    button.addEventListener('click', () => {
      const bot = bots.find((item) => item.id === button.dataset.bot)
      if (bot) selectBot(bot)
    })
  })
}

function renderActions(run) {
  const bots = run.rawBots || []
  const loadingRows = bots.flatMap((bot) => (bot.loadingEvents || []).map((event) => ({ bot, event })))
  $('#tab-actions').innerHTML = bots.length ? `
    <div class="debug-summary">
      <div class="debug-card">
        <span class="label">UI Actions</span>
        <strong>${escapeHtml(fmt(run.actions, '0'))}</strong>
        <p class="muted">From raw action evidence and structured event logs.</p>
      </div>
      <div class="debug-card ${loadingRows.length ? 'risk' : ''}">
        <span class="label">Loading Flags</span>
        <strong>${loadingRows.length}</strong>
        <p class="muted">${loadingRows.length ? 'Screenshots with empty/short visible text or loading language.' : 'No suspected loading captures in this run.'}</p>
      </div>
    </div>

    ${loadingRows.length ? `
      <section class="debug-section">
        <div class="section-title"><span class="label">Suspected Loading Captures</span></div>
        <div class="loading-list">
          ${loadingRows.map(({ bot, event }) => `
            <div class="loading-item">
              <button class="bot-link" data-bot="${escapeHtml(bot.id)}" type="button">${escapeHtml(bot.name || bot.id)}</button>
              <code>${escapeHtml(event.elapsed || 'n/a')}</code>
              <span>${escapeHtml(event.label || 'screenshot')}</span>
              ${event.screenshot ? `<a href="/api/file?run=${encodeURIComponent(run.id)}&path=${encodeURIComponent(event.screenshot)}" target="_blank" rel="noreferrer">open screen</a>` : ''}
            </div>
          `).join('')}
        </div>
      </section>
    ` : ''}

    <div class="bot-timelines">
      ${bots.map((bot, index) => {
        const events = bot.evidenceEvents || []
        const actions = bot.actionEvidence || []
        const hasLoading = Boolean(bot.loadingEvents?.length)
        return `
          <details class="timeline-group" ${index === 0 || hasLoading ? 'open' : ''}>
            <summary>
              <span>${escapeHtml(bot.name || bot.id)}</span>
              <span class="muted">${escapeHtml(bot.role || '')}</span>
              <span class="chip">${plural(actions.length || bot.timelineActions?.length || 0, 'action')}</span>
              <span class="chip">${plural(events.length, 'event')}</span>
              ${hasLoading ? `<span class="chip warn">${plural(bot.loadingEvents.length, 'loading flag')}</span>` : ''}
              ${bot.firstScreenshotDelaySeconds !== null && bot.firstScreenshotDelaySeconds !== undefined ? `<span class="chip">first screen T+${bot.firstScreenshotDelaySeconds}s</span>` : ''}
            </summary>
            ${actions.length ? `
              <div class="action-evidence">
                <span class="label">Action Evidence</span>
                <ul>${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ul>
              </div>
            ` : '<p class="muted timeline-note">No recorded UI action evidence. The bot may have only observed, reflected, or ended before the next move.</p>'}
            ${events.length ? `
              <div class="timeline">
                ${events.map((event) => `
                  <div class="timeline-row ${event.loadingRisk ? 'risk' : ''}">
                    <div class="timeline-time">
                      <code>${escapeHtml(event.elapsed || 'n/a')}</code>
                      ${event.sincePreviousSeconds ? `<span>${escapeHtml(waitLabel(event.sincePreviousSeconds))}</span>` : ''}
                    </div>
                    <div class="timeline-body">
                      <div class="timeline-head">
                        <span class="chip ${event.loadingRisk ? 'warn' : ''}">${escapeHtml(event.kind || event.type)}</span>
                        <span class="muted">${escapeHtml(event.type)}</span>
                        ${event.screenHash ? `<code>${escapeHtml(event.screenHash)}</code>` : ''}
                      </div>
                      <p>${escapeHtml(eventText(event))}</p>
                      ${event.visibleText ? `<p class="visible-text">${escapeHtml(event.visibleText)}</p>` : event.loadingRisk ? '<p class="visible-text empty-text">No visible text was captured for this screenshot.</p>' : ''}
                      ${event.screenshot ? `<a class="screen-link" href="/api/file?run=${encodeURIComponent(run.id)}&path=${encodeURIComponent(event.screenshot)}" target="_blank" rel="noreferrer">Open screenshot</a>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="muted timeline-note">No evidence JSONL found for this bot.</p>'}
          </details>
        `
      }).join('')}
    </div>
  ` : '<p class="muted">No bot timelines found.</p>'

  $$('#tab-actions .bot-link').forEach((button) => {
    button.addEventListener('click', () => {
      const bot = bots.find((item) => item.id === button.dataset.bot)
      if (bot) selectBot(bot)
    })
  })
}

function renderScreenshots(run) {
  const shots = run.screenshots || []
  const riskByShot = new Set((run.rawBots || []).flatMap((bot) => (bot.loadingEvents || []).map((event) => event.screenshot)))
  $('#tab-screenshots').innerHTML = shots.length ? `
    <div class="gallery">
      ${shots.map((shot) => `
        <a class="shot ${riskByShot.has(`screenshots/${shot}`) ? 'risk' : ''}" href="/api/file?run=${encodeURIComponent(run.id)}&path=${encodeURIComponent(`screenshots/${shot}`)}" target="_blank" rel="noreferrer">
          <img src="/api/file?run=${encodeURIComponent(run.id)}&path=${encodeURIComponent(`screenshots/${shot}`)}" alt="${escapeHtml(shot)}">
          <code>${escapeHtml(shot)}</code>
          ${riskByShot.has(`screenshots/${shot}`) ? '<span class="shot-flag">loading flag</span>' : ''}
        </a>
      `).join('')}
    </div>
  ` : '<p class="muted">No screenshots found.</p>'
}

function renderTruth(run) {
  const rows = []
  for (const bot of run.rawBots || []) {
    for (const text of bot.truthAssessments || []) {
      rows.push({ bot, text })
    }
  }
  $('#tab-truth').innerHTML = rows.length ? `
    <div class="truth-list">
      ${rows.map(({ bot, text }) => `
        <div class="truth-item">
          <span class="label">${escapeHtml(bot.name || bot.id)}</span>
          <p>${escapeHtml(text)}</p>
        </div>
      `).join('')}
    </div>
  ` : '<p class="muted">No explicit truth assessments recorded. This run may be incomplete or from an older runner.</p>'
}

function renderBetabook(run) {
  const summary = run.betabook || {}
  const raw = run.betabookRaw || null
  $('#tab-betabook').innerHTML = `
    <div class="debug-summary">
      <div class="debug-card ${summary.enabled ? '' : 'muted-card'}">
        <span class="label">Betabook</span>
        <strong>${summary.enabled ? 'enabled' : 'disabled'}</strong>
        <p class="muted">${escapeHtml(fmt(summary.events, '0'))} event(s)</p>
      </div>
      <div class="debug-card">
        <span class="label">Board Activity</span>
        <strong>${escapeHtml(fmt(summary.posts, '0'))}/${escapeHtml(fmt(summary.comments, '0'))}/${escapeHtml(fmt(summary.invites, '0'))}</strong>
        <p class="muted">posts / comments / invites</p>
      </div>
    </div>
    ${raw ? `
      <section class="debug-section">
        <div class="section-title"><span class="label">Threads</span></div>
        ${renderBetabookThreads(raw)}
      </section>
      <section class="debug-section">
        <div class="section-title"><span class="label">Invites</span></div>
        ${renderActivityItems(raw.invites || [], 'invite')}
      </section>
      <section class="debug-section">
        <div class="section-title"><span class="label">Events</span></div>
        ${renderActivityItems(raw.events || [], 'event')}
      </section>
    ` : '<p class="muted">No betabook.json artifact found for this run.</p>'}
  `
}

function renderDestiny(run) {
  const summary = run.destiny || {}
  const raw = run.destinyRaw || null
  $('#tab-destiny').innerHTML = `
    <div class="debug-summary">
      <div class="debug-card ${summary.enabled ? '' : 'muted-card'}">
        <span class="label">Destiny</span>
        <strong>${summary.enabled ? 'enabled' : 'disabled'}</strong>
        <p class="muted">browser-visible nudges and Betabook coordination</p>
      </div>
      <div class="debug-card">
        <span class="label">Orchestration</span>
        <strong>${escapeHtml(fmt(summary.masterPlan, '0'))}/${escapeHtml(fmt(summary.events, '0'))}</strong>
        <p class="muted">plan thread(s) / event(s)</p>
      </div>
    </div>
    ${raw ? `
      <section class="debug-section">
        <div class="section-title"><span class="label">Master Plan</span></div>
        ${renderActivityItems(raw.masterPlan || [], 'plan')}
      </section>
      <section class="debug-section">
        <div class="section-title"><span class="label">Nudges</span></div>
        ${renderActivityItems(raw.nudges || [], 'nudge')}
      </section>
      <section class="debug-section">
        <div class="section-title"><span class="label">Events</span></div>
        ${renderActivityItems(raw.events || [], 'event')}
      </section>
      ${raw.errors?.length ? `
        <section class="debug-section">
          <div class="section-title"><span class="label">Errors</span></div>
          ${renderActivityItems(raw.errors.map((error) => ({ body: error })), 'error')}
        </section>
      ` : ''}
    ` : '<p class="muted">No destiny.json artifact found for this run.</p>'}
  `
}

function renderFiles(run) {
  const files = run.files || []
  $('#tab-files').innerHTML = files.length ? `
    <div class="file-list">
      ${files.map((file) => `<a href="/api/file?run=${encodeURIComponent(run.id)}&path=${encodeURIComponent(file)}" target="_blank" rel="noreferrer">${escapeHtml(file)}</a>`).join('')}
    </div>
  ` : '<p class="muted">No files found.</p>'
}

function renderInspector(run, bot = null) {
  $('#inspector-status').textContent = bot ? 'bot' : run ? 'run' : 'idle'
  if (!run) {
    $('#inspector-body').innerHTML = '<p class="muted">Select a run, then select a bot.</p>'
    return
  }
  if (!bot) {
    const llmTasks = Object.entries(run.llm?.tasks || {}).map(([task, count]) => `${task}=${count}`).join(', ') || 'none'
    $('#inspector-body').innerHTML = `
      <div class="field"><span class="label">Run</span><strong>${escapeHtml(run.id)}</strong></div>
      <div class="field"><span class="label">App</span><p>${escapeHtml(run.appName)}</p></div>
      <div class="field"><span class="label">Truth Pressure</span><p>always on</p></div>
      <div class="field"><span class="label">LLM Calls</span><p>${escapeHtml(run.llmProvider || 'unknown')} · ${escapeHtml(fmt(run.llm?.calls, '0'))} call(s), ${escapeHtml(fmt(run.fallbacks, '0'))} fallback(s)</p><p class="muted">${escapeHtml(llmTasks)}</p></div>
      <div class="field"><span class="label">Debug Evidence</span><p>${escapeHtml(fmt(run.actions, '0'))} action(s), ${escapeHtml(fmt(run.loadingRisks, '0'))} loading flag(s)</p></div>
      <div class="field"><span class="label">Betabook</span><p>${run.betabook?.enabled ? 'enabled' : 'disabled'} · ${escapeHtml(fmt(run.betabook?.posts, '0'))} post(s), ${escapeHtml(fmt(run.betabook?.comments, '0'))} comment(s), ${escapeHtml(fmt(run.betabook?.invites, '0'))} invite(s)</p></div>
      <div class="field"><span class="label">Destiny</span><p>${run.destiny?.enabled ? 'enabled' : 'disabled'} · ${escapeHtml(fmt(run.destiny?.masterPlan, '0'))} plan thread(s), ${escapeHtml(fmt(run.destiny?.events, '0'))} event(s)</p></div>
      <div class="field"><span class="label">Files</span><p>${run.files?.length || 0} artifacts</p></div>
    `
    return
  }
  const explicitActions = bot.actionEvidence || []
  const eventActions = bot.evidenceEvents?.filter((event) => ['action', 'betabook', 'destiny'].includes(event.kind)) || []
  const mindEvents = bot.evidenceEvents?.filter((event) => event.kind === 'mind') || []
  const botBetabookCount = (bot.betabook?.posts?.length || 0) + (bot.betabook?.comments?.length || 0) + (bot.betabook?.invites?.length || 0) + (bot.betabook?.events?.length || 0)
  const botDestinyCount = (bot.destiny?.plans?.length || 0) + (bot.destiny?.nudges?.length || 0) + (bot.destiny?.events?.length || 0)
  $('#inspector-body').innerHTML = `
    <div class="persona-head">
      ${renderAvatar(bot, 'bot-avatar bot-avatar-large')}
      <div class="field"><span class="label">Persona</span><strong>${escapeHtml(bot.name || bot.id)}</strong><p>${escapeHtml(bot.role)}</p></div>
    </div>
    <div class="field"><span class="label">Avatar</span><p>${escapeHtml(bot.avatar?.style || 'none')} ${bot.avatar?.provider ? `via ${escapeHtml(bot.avatar.provider)}` : ''}</p>${bot.avatar?.url ? `<a class="screen-link" href="${escapeHtml(bot.avatar.url)}" target="_blank" rel="noreferrer">Open avatar</a>` : ''}</div>
    <div class="field"><span class="label">Life Goal</span><p>${escapeHtml(bot.lifeGoal || 'n/a')}</p></div>
    <div class="inspector-kpis">
      <div><span class="label">Score</span><strong>${escapeHtml(fmt(bot.score))}</strong></div>
      <div><span class="label">Events</span><strong>${escapeHtml(fmt(bot.eventCount, '0'))}</strong></div>
      <div><span class="label">UI Actions</span><strong>${escapeHtml(fmt(explicitActions.length || eventActions.length, '0'))}</strong></div>
      <div><span class="label">Mind</span><strong>${escapeHtml(fmt(mindEvents.length, '0'))}</strong></div>
    </div>
    <div class="field"><span class="label">End Reason</span><p>${escapeHtml(bot.endReason || 'n/a')}</p></div>
    <div class="field"><span class="label">Explicit UI Actions</span>${explicitActions.length ? `<ul class="compact-list">${explicitActions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ul>` : '<p class="muted">No click/navigation/message action was recorded for this bot.</p>'}</div>
    <div class="field"><span class="label">Evidence Timeline</span><p>${escapeHtml(fmt(bot.eventCount, '0'))} event(s), first screenshot ${bot.firstScreenshotDelaySeconds === null || bot.firstScreenshotDelaySeconds === undefined ? 'n/a' : `T+${bot.firstScreenshotDelaySeconds}s`}, ${bot.loadingEvents?.length || 0} loading flag(s)</p></div>
    <div class="field"><span class="label">What This Bot Did</span>${renderEventFeed(bot.evidenceEvents || [], run, { empty: 'No evidence JSONL found for this bot.' })}</div>
    <div class="field"><span class="label">Betabook Activity</span><p class="muted">${botBetabookCount} related item(s)</p>${renderActivityItems([...(bot.betabook?.posts || []), ...(bot.betabook?.comments || []), ...(bot.betabook?.invites || []), ...(bot.betabook?.events || [])], 'betabook')}</div>
    <div class="field"><span class="label">Destiny Impact</span><p class="muted">${botDestinyCount} related item(s)</p>${renderActivityItems([...(bot.destiny?.plans || []), ...(bot.destiny?.nudges || []), ...(bot.destiny?.events || [])], 'destiny')}</div>
    <div class="field"><span class="label">LLM / Mind Calls</span><p>${escapeHtml(mindEvents.length)} recorded mind event(s) for this bot. Run-level LLM calls: ${escapeHtml(fmt(run.llm?.calls, '0'))}.</p></div>
    <div class="field"><span class="label">Truth Assessments</span><p>${escapeHtml(bot.truthAssessments.join(' ') || 'none recorded')}</p></div>
    <div class="field"><span class="label">Life-cost Decisions</span><p>${escapeHtml(bot.lifeDecisions.join(' ') || 'none recorded')}</p></div>
    <div class="field"><span class="label">Ideas</span><p>${escapeHtml(bot.ideas.join(' ') || 'none recorded')}</p></div>
  `
}

function renderTabs(run) {
  renderAnalysis(run)
  renderBots(run)
  renderActions(run)
  renderScreenshots(run)
  renderTruth(run)
  renderBetabook(run)
  renderDestiny(run)
  renderFiles(run)
  switchTab(state.tab)
}

function switchTab(tab) {
  state.tab = tab
  $$('.tab').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab))
  $$('.tab-panel').forEach((panel) => panel.classList.add('hidden'))
  $(`#tab-${tab}`)?.classList.remove('hidden')
}

function selectBot(bot) {
  state.currentBot = bot
  renderInspector(state.currentRun, bot)
}

async function selectRun(runId) {
  const run = await getJson(`/api/runs/${encodeURIComponent(runId)}`)
  state.currentRun = run
  state.currentBot = null
  renderRuns()
  renderOverview(run)
  renderTabs(run)
  renderInspector(run)
}

async function refresh() {
  const payload = await getJson('/api/runs')
  $('#runs-root').textContent = payload.runsRoot
  state.runs = payload.runs || []
  renderRuns()
  if (state.runs.length && !state.currentRun) await selectRun(state.runs[0].id)
}

$$('.tab').forEach((button) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab))
})

$('#refresh-button').addEventListener('click', () => refresh().catch(showError))

function showError(error) {
  $('#empty-state').classList.remove('hidden')
  $('#run-view').classList.add('hidden')
  $('#empty-state').innerHTML = `<span class="led red"></span><h2>Dashboard error</h2><p>${escapeHtml(error.message)}</p>`
}

refresh().catch(showError)
