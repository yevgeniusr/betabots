const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('Cryptonary authenticated cohort has ten research-labeled roles and a no-community-write policy', () => {
  const file = path.join(__dirname, '..', 'demo-cohorts', 'cryptonary-authenticated-platform.json')
  const cohort = JSON.parse(fs.readFileSync(file, 'utf8'))

  assert.equal(cohort.appName, 'Cryptonary')
  assert.equal(cohort.requiresSocialAction, false)
  assert.equal(cohort.socialActionsAllowed, false)
  assert.equal(cohort.roles.length, 10)
  for (const role of cohort.roles) {
    assert.ok(role.role)
    assert.ok(role.goal)
    assert.ok(role.provenance?.assumptions?.length || role.provenance?.researchLabels?.length)
  }
  const serializedPolicy = JSON.stringify(cohort.interactionPolicy).toLowerCase()
  for (const forbidden of ['comment', 'reply', 'post', 'reaction', 'like', 'follow', 'message', 'share', 'publish']) {
    assert.match(serializedPolicy, new RegExp(forbidden))
  }
  assert.match(serializedPolicy, /community/)
  assert.match(serializedPolicy, /post/)
})
