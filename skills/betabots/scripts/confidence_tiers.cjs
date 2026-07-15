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

function buildConfidenceRows(results) {
  const themes = new Map()
  for (const result of Array.isArray(results) ? results : []) {
    const botThemes = new Set()
    for (const idea of result.ideas || []) {
      const theme = ideaThemeFor(idea)
      const row = themes.get(theme) || {
        theme,
        botIds: new Set(),
        mentions: 0,
        examples: [],
      }
      row.mentions += 1
      row.botIds.add(result.id)
      if (row.examples.length < 3 && !row.examples.includes(idea)) row.examples.push(idea)
      themes.set(theme, row)
      botThemes.add(theme)
    }
  }

  const resultCount = Array.isArray(results) ? results.length : 0
  const highThreshold = Math.min(5, Math.max(2, Math.ceil(resultCount * 0.25)))
  const mediumThreshold = Math.min(3, Math.max(2, Math.ceil(resultCount * 0.1)))
  return [...themes.values()]
    .map((row) => {
      const botCount = row.botIds.size
      const tier = botCount >= highThreshold
        ? 'high'
        : botCount >= mediumThreshold
          ? 'medium'
          : 'low'
      return {
        theme: row.theme,
        botCount,
        mentions: row.mentions,
        share: resultCount ? botCount / resultCount : 0,
        tier,
        examples: row.examples,
      }
    })
    .sort((a, b) => b.botCount - a.botCount || b.mentions - a.mentions)
}

module.exports = { buildConfidenceRows, ideaThemeFor }
