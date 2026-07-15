const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

const {
  persistContextStorageState,
} = require('../skills/betabots/scripts/session_scheduler.cjs')

async function withServer(work) {
  const server = http.createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end('<!doctype html><title>Session state</title><p>Ready</p>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    await work(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('browser storage checkpoint restores cookies, localStorage, and IndexedDB', async (t) => {
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'betabots-browser-state-'))
  const storagePath = path.join(directory, 'bot.json')

  await withServer(async (url) => {
    const firstContext = await browser.newContext()
    const firstPage = await firstContext.newPage()
    await firstPage.goto(url)
    await firstPage.evaluate(async () => {
      document.cookie = 'returning=yes; path=/'
      localStorage.setItem('journey', 'session-one')
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('betabots-session', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('memory')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const transaction = request.result.transaction('memory', 'readwrite')
          transaction.objectStore('memory').put('completed', 'activity')
          transaction.oncomplete = resolve
          transaction.onerror = () => reject(transaction.error)
        }
      })
    })
    await persistContextStorageState(firstContext, storagePath)
    await firstContext.close()

    const secondContext = await browser.newContext({ storageState: storagePath })
    const secondPage = await secondContext.newPage()
    await secondPage.goto(url)
    const restored = await secondPage.evaluate(async () => {
      const indexedDbValue = await new Promise((resolve, reject) => {
        const request = indexedDB.open('betabots-session', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const transaction = request.result.transaction('memory', 'readonly')
          const valueRequest = transaction.objectStore('memory').get('activity')
          valueRequest.onsuccess = () => resolve(valueRequest.result)
          valueRequest.onerror = () => reject(valueRequest.error)
        }
      })
      return {
        cookie: document.cookie,
        localStorage: localStorage.getItem('journey'),
        indexedDbValue,
      }
    })
    await secondContext.close()

    assert.match(restored.cookie, /returning=yes/)
    assert.equal(restored.localStorage, 'session-one')
    assert.equal(restored.indexedDbValue, 'completed')
  })
})
