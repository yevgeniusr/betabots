const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createPolicyEventCollector,
  enforceActionPolicy,
  evaluateNetworkRequestPolicy,
  installNetworkMutationBackstop,
  normalizeInteractionPolicy,
} = require('../skills/betabots/scripts/interaction_policy.cjs')

const communityPolicy = normalizeInteractionPolicy({
  actionDenyRules: [
    { id: 'community-page-actions', actionTypes: ['click', 'fill', 'select'], urlPatterns: ['/community'] },
    { id: 'community-write-controls', controlNamePatterns: ['comment', 'reply', 'post', 'reaction', 'like', 'follow', 'message', 'share', 'publish'] },
  ],
  requestDenyRules: [
    { id: 'community-write-mutations', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], urlPatterns: ['community', 'comment', 'reply', 'post', 'reaction', 'like', 'follow', 'message', 'share', 'publish'] },
  ],
})

test('denies community write controls and permits safe read-only navigation', () => {
  const collector = createPolicyEventCollector()
  const blocked = enforceActionPolicy(communityPolicy, {
    action: { type: 'click', value: '' },
    control: { name: 'Post comment', kind: 'button', href: '' },
    currentUrl: 'https://app.test/community/thread-1',
    collector,
  })
  const allowed = enforceActionPolicy(communityPolicy, {
    action: { type: 'click', value: '' },
    control: { name: 'Open community', kind: 'link', href: 'https://app.test/community' },
    currentUrl: 'https://app.test/dashboard',
    collector,
  })

  assert.equal(blocked.ok, false)
  assert.match(blocked.reason, /interaction policy/i)
  assert.equal(allowed.ok, true)
  assert.deepEqual(collector.events, [{
    type: 'policy-block',
    surface: 'action',
    ruleId: 'community-page-actions',
    actionType: 'click',
  }])
})

test('network backstop blocks prohibited mutations but allows community reads and safe requests', async () => {
  const collector = createPolicyEventCollector()
  const requests = [
    { method: () => 'POST', url: () => 'https://app.test/community/comments', postData: () => 'comment=private-text' },
    { method: () => 'GET', url: () => 'https://app.test/community/thread-1', postData: () => null },
    { method: () => 'POST', url: () => 'https://app.test/preferences', postData: () => 'theme=dark' },
  ]
  const decisions = requests.map((request) => evaluateNetworkRequestPolicy(communityPolicy, {
    method: request.method(),
    requestUrl: request.url(),
    currentUrl: 'https://app.test/dashboard',
    requestBody: request.postData(),
    collector,
  }))
  assert.deepEqual(decisions.map((decision) => decision.ok), [false, true, true])
  assert.equal(collector.events.length, 1)
  assert.equal(JSON.stringify(collector.events).includes('private-text'), false)

  let handler
  const context = { route: async (_pattern, callback) => { handler = callback } }
  await installNetworkMutationBackstop(context, communityPolicy, () => 'https://app.test/dashboard', collector)
  const calls = []
  await handler({
    request: () => requests[0],
    abort: async () => calls.push('abort'),
    continue: async () => calls.push('continue'),
  })
  await handler({
    request: () => requests[1],
    abort: async () => calls.push('abort'),
    continue: async () => calls.push('continue'),
  })
  assert.deepEqual(calls, ['abort', 'continue'])
})

test('request-scoped patterns do not block analytics or harmless bodies from protected pages', () => {
  const policy = normalizeInteractionPolicy({
    requestDenyRules: [{
      id: 'community-endpoint-mutations',
      methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
      requestUrlPatterns: ['/community/', '/comments'],
    }],
  })
  const collector = createPolicyEventCollector()
  const evaluate = (requestUrl, currentUrl, requestBody) => evaluateNetworkRequestPolicy(policy, {
    method: 'POST',
    requestUrl,
    currentUrl,
    requestBody,
    collector,
  })

  assert.equal(evaluate('https://app.test/community/comments', 'https://app.test/community', 'comment=hello').ok, false)
  assert.equal(evaluate('https://analytics.test/collect', 'https://app.test/community', 'event=page-view').ok, true)
  assert.equal(evaluate('https://app.test/research/search', 'https://app.test/research', 'query=post-quantum').ok, true)
  assert.equal(collector.blocked, 1)
})
