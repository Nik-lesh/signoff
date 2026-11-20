import { test, expect } from '@playwright/test'

/**
 * The server's two doors, tried without a key. No test account is needed.
 *
 *   /api/actions/*          the person's door: needs a session token
 *   /_deepspace/agent/*     the agent's door:  needs an agent-scoped token
 *
 * What each door does with the right and the wrong kind of token is covered
 * with real accounts in ledger.spec.ts.
 */

const ACTIONS = ['createLedger', 'addClaim', 'recordVerdict', 'setLedgerVisibility', 'deleteLedger']

/** A body each action would accept from its owner, so a refusal is about the caller, not the input. */
const PLAUSIBLE: Record<string, Record<string, unknown>> = {
  createLedger: { name: 'Should never exist' },
  addClaim: { ledgerId: 'any', statement: 'Forged claim', check: 'None' },
  recordVerdict: { claimId: 'any', status: 'verified', note: 'Forged verdict, never checked' },
  setLedgerVisibility: { ledgerId: 'any', visibility: 'public' },
  deleteLedger: { ledgerId: 'any' },
}

test.describe('API tests', () => {
  test('auth proxy forwards to auth worker', async ({ request }) => {
    const res = await request.get('/api/auth/ok')
    expect(res.ok()).toBeTruthy()
  })

  test('every server action refuses a request with no token', async ({ request }) => {
    for (const name of ACTIONS) {
      const res = await request.post(`/api/actions/${name}`, { data: PLAUSIBLE[name] })
      expect(res.status(), name).toBe(401)
    }
  })

  test('every server action refuses a token nobody issued', async ({ request }) => {
    for (const name of ACTIONS) {
      const res = await request.post(`/api/actions/${name}`, {
        headers: { Authorization: 'Bearer not.a.token' },
        data: PLAUSIBLE[name],
      })
      expect(res.status(), name).toBe(401)
    }
  })

  test('the agent tool surface refuses a request with no token', async ({ request }) => {
    const list = await request.get('/_deepspace/agent/tools')
    expect(list.status(), 'tool list').toBe(401)

    const docs = await request.get('/_deepspace/agent/tools.md')
    expect(docs.status(), 'tool docs').toBe(401)

    const call = await request.post('/_deepspace/agent/tools/file_claim', {
      data: { input: { claim: 'Forged claim', check: 'None' } },
    })
    expect(call.status(), 'file_claim').toBe(401)
  })

  test('the agent tool surface refuses a token nobody issued', async ({ request }) => {
    const call = await request.post('/_deepspace/agent/tools/file_claim', {
      headers: { Authorization: 'Bearer not.a.token' },
      data: { input: { claim: 'Forged claim', check: 'None' } },
    })
    expect(call.status()).toBe(401)
  })

  test('no integration can be called through this app', async ({ request }) => {
    // The scaffold default bills the app owner for any integration a signed-in
    // person calls. Signoff lists none, so the proxy has nothing to forward.
    for (const path of ['openai/chat-completion', 'google/calendar-list', 'composio/execute']) {
      const res = await request.post(`/api/integrations/${path}`, { data: {} })
      expect(res.status(), path).toBe(404)
    }
  })

  test('only the app record room answers under /ws/', async ({ page, request }) => {
    for (const path of [
      '/ws/yjs/any-doc',
      '/ws/canvas/any-doc',
      '/ws/presence/any-scope',
      '/ws/cron/any-room',
      '/ws/jobs/any-room',
      '/ws/some-other-room',
    ]) {
      const res = await request.get(`${path}?_deepspace_probe=readiness`)
      expect(res.status(), path).toBe(404)
    }

    // And as a real socket, from a page of this origin.
    await page.goto('/')
    const outcome = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const socket = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/ws/yjs/any-doc`)
          const timer = setTimeout(() => resolve('no answer'), 5000)
          socket.addEventListener('open', () => {
            clearTimeout(timer)
            socket.close()
            resolve('opened')
          })
          socket.addEventListener('error', () => {
            clearTimeout(timer)
            resolve('refused')
          })
        }),
    )
    expect(outcome).toBe('refused')
  })

  test('the record room accepts a signed-out visitor, read-only', async ({ page }) => {
    // /home is a dynamic page (under src/pages/(app)/), so mounting it boots
    // the providers and auto-connects the records WebSocket. Published ledgers
    // are readable signed out, so the room must accept this visitor.
    const sockets: string[] = []
    page.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname.startsWith('/ws/')) sockets.push(ws.url())
    })
    await page.goto('/home')
    await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 15000 })
    await expect.poll(() => sockets.length, { timeout: 15000 }).toBeGreaterThan(0)
  })
})
