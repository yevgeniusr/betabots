function normalizeTarget(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function claimCuriosityTarget(seen, value) {
  const target = normalizeTarget(value)
  if (!target || seen.has(target)) return false
  seen.add(target)
  return true
}

module.exports = { claimCuriosityTarget }
