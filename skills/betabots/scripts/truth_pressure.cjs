'use strict'

function extractCommittedDollars(text) {
  const source = String(text || '')
  const pattern = /\b(?:paid|spent|committed|charged)\b[^$\n]{0,40}(\$[\d,]+(?:\.\d+)?)/gi
  let total = 0
  for (const match of source.matchAll(pattern)) {
    total += Number(match[1].replace(/[$,]/g, ''))
  }
  return total
}

module.exports = { extractCommittedDollars }
