#!/usr/bin/env node
/**
 * Provider smoke test for minimax + opencode.
 *
 * Verifies the module loads, exposes the expected call functions, and the
 * input payload shape is what the rest of the bundle expects. Does not make
 * any network calls or spawn real CLIs — that's the runner's job.
 *
 * Run: node tests/llm_providers_smoke.test.cjs
 */
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const minimax = require(path.join(ROOT, 'skills/betabots/scripts/minimax_provider.cjs'));
const opencode = require(path.join(ROOT, 'skills/betabots/scripts/opencode_provider.cjs'));

(async function main() {
  assert.equal(typeof minimax.callMiniMax, 'function');
  assert.equal(typeof minimax.minimaxUserContent, 'function');
  assert.equal(minimax.MINIMAX_DEFAULT_BASE_URL, 'https://api.minimax.io/v1');
  assert.equal(minimax.MINIMAX_DEFAULT_MODEL, 'MiniMax-M3');

  assert.equal(typeof opencode.callOpencode, 'function');
  assert.equal(typeof opencode.resolveConfig, 'function');

  // Text-only payload: a plain string round-trips.
  const textPayload = minimax.minimaxUserContent('hello', []);
  assert.equal(textPayload, 'hello');

  // Multimodal payload: text + a fake PNG file. The provider must read it
  // and emit a base64 image_url entry.
  const fakeImage = path.join(os.tmpdir(), 'betabots-smoke.png');
  require('node:fs').writeFileSync(fakeImage, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const mixed = minimax.minimaxUserContent('describe', [fakeImage]);
  assert.equal(Array.isArray(mixed), true);
  assert.equal(mixed.length, 2);
  assert.equal(mixed[0].text, 'describe');
  assert.equal(mixed[1].type, 'image_url');
  assert.match(mixed[1].image_url.url, /^data:image\/png;base64,/);
  require('node:fs').unlinkSync(fakeImage);

  // Missing image paths are dropped, not crashed on.
  const dropped = minimax.minimaxUserContent('describe', ['/does/not/exist.png']);
  assert.equal(dropped, 'describe');

  // Tooling wiring: statically verify the runner accepts the new provider.
  // We avoid `require` here because the bundled runner eagerly launches
  // a Playwright browser when imported. Instead, read the file source.
  const runnerSrc = require('node:fs').readFileSync(
    path.join(ROOT, 'skills/betabots/scripts/thoughtful_browser_betabots.cjs'),
    'utf8',
  );
  assert.match(
    runnerSrc,
    /validProviders\s*=\s*new Set\(\['codex',\s*'openrouter',\s*'minimax',\s*'opencode'\]\)/u,
  );
  assert.match(runnerSrc, /require\('\.\/minimax_provider\.cjs'\)/u);
  assert.match(runnerSrc, /require\('\.\/opencode_provider\.cjs'\)/u);
  assert.match(runnerSrc, /case 'minimax'/u);
  assert.match(runnerSrc, /case 'opencode'/u);

  const postRunSrc = require('node:fs').readFileSync(
    path.join(ROOT, 'skills/betabots/scripts/post_run_questions.cjs'),
    'utf8',
  );
  assert.match(postRunSrc, /'minimax'/u);
  assert.match(postRunSrc, /'opencode'/u);

  console.log('llm_providers_smoke: ok');
})().catch((error) => {
  console.error('llm_providers_smoke: FAIL', error.message);
  process.exit(1);
});
