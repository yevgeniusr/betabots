/**
 * LLM provider for BETABOT_LLM_PROVIDER=minimax.
 *
 * Routes prompts to a MiniMax-family model using the same multimodal content
 * shape that the rest of the bundle speaks (text + base64 image_url blocks).
 * The endpoint is OpenAI-compatible, so multimodal payloads that already work
 * for `openrouter` reuse here without translation.
 *
 * Environment:
 *   BETABOT_MINIMAX_API_KEY   – required. Falls back to OPENAI_COMPAT_API_KEY
 *                                when set so existing OpenAI-compatible keys
 *                                do not have to be renamed.
 *   BETABOT_MINIMAX_BASE_URL  – defaults to https://api.minimax.io/v1.
 *   BETABOT_MINIMAX_MODEL     – defaults to `minimax/minimax-m3`.
 *   BETABOT_MINIMAX_TIMEOUT_MS – per-request timeout (default 90s).
 *
 * The provider is intentionally OpenAI-compatible so it can also be pointed
 * at any provider that exposes `/chat/completions` with the same shape. This
 * keeps the runner honest: no invisible protocol divergence.
 */
const fs = require('node:fs')
const path = require('node:path')

const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io/v1'
const MINIMAX_DEFAULT_MODEL = 'minimax/minimax-m3'

function existingImages(imagePaths = []) {
  return (Array.isArray(imagePaths) ? imagePaths : []).filter(
    (file) => file && fs.existsSync(file),
  )
}

function imageDataUrl(file) {
  const extension = path.extname(file).toLowerCase()
  const mime =
    extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
}

function minimaxUserContent(prompt, imagePaths = []) {
  const images = existingImages(imagePaths)
  if (!images.length) return prompt
  return [
    { type: 'text', text: prompt },
    ...images.map((file) => ({
      type: 'image_url',
      image_url: { url: imageDataUrl(file) },
    })),
  ]
}

function resolveConfig() {
  const apiKey =
    process.env.BETABOT_MINIMAX_API_KEY ||
    process.env.OPENAI_COMPAT_API_KEY ||
    ''
  const baseUrl = (
    process.env.BETABOT_MINIMAX_BASE_URL || MINIMAX_DEFAULT_BASE_URL
  ).replace(/\/$/, '')
  const model = process.env.BETABOT_MINIMAX_MODEL || MINIMAX_DEFAULT_MODEL
  const timeoutMs = Number(
    process.env.BETABOT_MINIMAX_TIMEOUT_MS ||
      process.env.BETABOT_LLM_TIMEOUT_MS ||
      90_000,
  )
  const siteUrl = process.env.BETABOT_MINIMAX_SITE_URL || ''
  const appName = process.env.BETABOT_MINIMAX_APP_NAME || 'Betabots'
  return { apiKey, baseUrl, model, timeoutMs, siteUrl, appName }
}

async function callMiniMax(prompt, imagePaths = [], options = {}) {
  const cfg = resolveConfig()
  if (!cfg.apiKey) {
    throw new Error(
      'BETABOT_LLM_PROVIDER=minimax requires BETABOT_MINIMAX_API_KEY (or OPENAI_COMPAT_API_KEY) to be set.',
    )
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  try {
    const headers = {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (cfg.siteUrl) headers['HTTP-Referer'] = cfg.siteUrl
    if (cfg.appName) headers['X-Title'] = cfg.appName
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a synthetic human/user simulation component. Return only valid JSON. Do not include markdown.',
          },
          {
            role: 'user',
            content: minimaxUserContent(prompt, imagePaths),
          },
        ],
        temperature: options.temperature ?? 0.8,
      }),
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(
        `minimax ${response.status}: ${text.slice(0, 1024)}`,
      )
    }
    const body = JSON.parse(text)
    const content = body.choices?.[0]?.message?.content || ''
    if (!content) {
      throw new Error('minimax returned empty content')
    }
    return content
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  callMiniMax,
  minimaxUserContent,
  resolveConfig,
  MINIMAX_DEFAULT_BASE_URL,
  MINIMAX_DEFAULT_MODEL,
}
