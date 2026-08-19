#!/usr/bin/env node
/**
 * Seed authenticated Playwright storage states for a betabots cohort.
 *
 * For each persona we:
 *   1. Sign up via the live /auth/signup endpoint.
 *   2. Log in via /auth/login to capture a fresh accessToken + refreshToken.
 *   3. Write a Playwright storage_state.json whose localStorage contains
 *      `self-degree.consumer-session` populated with the token pair.
 *
 * Output paths are shaped to match `BETABOT_STORAGE_STATE_TEMPLATE`.
 *
 * Usage:
 *   node tools/seed-personas.mjs \
 *     --cohort <path-to-generated-personas.json> \
 *     --base-url https://learn.self-degree.com \
 *     --api-url https://api.self-degree.com \
 *     --out-dir /tmp/betabot-storage \
 *     --prefix self-degree-tourism
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const args = process.argv.slice(2);
function argFlag(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const cohortPath = argFlag('--cohort');
const baseUrl = argFlag('--base-url', 'https://learn.self-degree.com');
const apiUrl = argFlag('--api-url', 'https://api.self-degree.com');
const outDir = argFlag('--out-dir', '/tmp/betabot-storage');
const filePrefix = argFlag('--prefix', 'self-degree-tourism');
const password = argFlag('--password', 'BetabotPass2026');

if (!cohortPath) {
  console.error('Missing --cohort <path>');
  process.exit(64);
}

const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
// The cohort file may have `bots`, `personas`, or both. Prefer `bots` which
// is what the runner consumes (it's the merged, enriched form).
const personas = cohort.bots || cohort.personas || [];
fs.mkdirSync(outDir, { recursive: true });

function safeSlug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}

function safePlaceholder(name) {
  // Mirrors `safePlaceholder` in the betabots runner: leaves case alone and
  // collapses runs of separator characters.
  return String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function emailFor(bot) {
  const slug = safeSlug(`${bot.id}-${bot.name}`).slice(0, 40);
  return `betabot.${slug}.${Date.now()}@nanachi.test`;
}

async function signup(email) {
  const res = await fetch(`${apiUrl}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: email.split('@')[0],
      email,
      password,
      timezone: 'UTC',
      language: 'English',
      profileType: 'buyer',
    }),
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`signup failed: ${res.status} ${text.slice(0, 200)}`);
  }
}

async function login(email) {
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const body = await res.json();
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    profileId: body?.user?.profiles?.[0]?.id,
    userId: body?.user?.id,
  };
}

async function seedOne(bot) {
  const email = emailFor(bot);
  await signup(email);
  const session = await login(email);
  const webOrigin = new URL(baseUrl).origin;
  const storage = {
    cookies: [],
    origins: [
      {
        origin: webOrigin,
        localStorage: [
          {
            name: 'self-degree.consumer-session',
            value: JSON.stringify({
              accessToken: session.accessToken,
              refreshToken: session.refreshToken,
              profileId: session.profileId,
              email,
            }),
          },
        ],
      },
    ],
  };
  // Betabots uses safe-placeholder substitution on the storage-state
  // template path which capitalises the first letter of every space-
  // separated token (e.g. "Marcus Ellington" -> "Marcus-Ellington").
  // Match that here so the lookup actually resolves.
  const titleCasedName = String(bot.name || '')
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const fileName = `${filePrefix}-${safePlaceholder(bot.id)}-${safePlaceholder(titleCasedName)}.json`;
  const fullPath = path.join(outDir, fileName);
  fs.writeFileSync(fullPath, JSON.stringify(storage, null, 2));
  return { email, filePath: fullPath, userId: session.userId };
}

(async () => {
  const records = [];
  for (const bot of personas) {
    try {
      const r = await seedOne(bot);
      console.log(`seeded ${bot.id} ${bot.name} -> ${r.filePath} (${r.email})`);
      records.push(r);
    } catch (e) {
      console.error(`failed ${bot.id} ${bot.name}: ${e.message}`);
    }
  }
  fs.writeFileSync(
    path.join(outDir, 'seeded.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), records }, null, 2),
  );
  console.log(`\nDone. ${records.length}/${personas.length} seeded to ${outDir}`);
})();
