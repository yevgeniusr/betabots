function normalizeVolatile(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}

function routeIdentity(url) {
  try {
    const parsed = new URL(url)
    return normalizeVolatile(`${parsed.pathname}${parsed.search}${parsed.hash}`)
  } catch {
    return normalizeVolatile(url)
  }
}

function screenFingerprint(observation) {
  const text = normalizeVolatile(observation?.text)
  const contentSample = text.length <= 800
    ? text
    : `${text.slice(0, 400)}|${text.slice(-400)}`

  return [
    routeIdentity(observation?.url),
    normalizeVolatile(observation?.title),
    contentSample,
  ].join('|')
}

module.exports = { screenFingerprint }
