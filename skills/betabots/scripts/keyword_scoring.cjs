function newKeywordMatches(text, keywords, seen) {
  const normalized = String(text || '').toLowerCase()
  const matches = []
  for (const keyword of Array.isArray(keywords) ? keywords : []) {
    const value = String(keyword).toLowerCase()
    if (!value || seen.has(value) || !normalized.includes(value)) continue
    seen.add(value)
    matches.push(value)
  }
  return matches
}

module.exports = { newKeywordMatches }
