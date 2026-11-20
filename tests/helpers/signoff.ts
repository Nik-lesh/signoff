import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Shared steps for the signed-in specs. Each takes a page that is already
 * signed in (the `users` fixture from deepspace/testing provides those) and
 * drives the app the way a person would, so the specs read as behaviour.
 */

export interface ActionReply {
  status: number
  body: { success?: boolean; data?: Record<string, unknown>; error?: string; code?: string }
}

/** The short-lived token the app itself sends to server actions for this page's account. */
export async function sessionToken(page: Page): Promise<string> {
  const token = await page.evaluate(async () => {
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.ok) return ''
    const body = (await response.json()) as { token?: string }
    return body.token ?? ''
  })
  expect(token, 'a signed-in page can get a session token').not.toBe('')
  return token
}

/**
 * Ask the auth service for an agent-scoped token for this app, as the signed-in
 * account. This is the exchange `npx deepspace agent invoke` makes before it
 * calls a tool. Returns the HTTP status too, so a spec can say why it skipped.
 */
export async function mintAgentToken(page: Page): Promise<{ token: string; status: number }> {
  return page.evaluate(async () => {
    try {
      const response = await fetch('/api/auth/agent-token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: window.location.origin }),
      })
      if (!response.ok) return { token: '', status: response.status }
      const body = (await response.json()) as { token?: string }
      return { token: body.token ?? '', status: response.status }
    } catch {
      return { token: '', status: 0 }
    }
  })
}

/** Call a server action directly, with whatever bearer token the test wants to try. */
export async function callAction(
  page: Page,
  name: string,
  params: Record<string, unknown>,
  token: string | null,
): Promise<ActionReply> {
  const response = await page.request.post(`/api/actions/${name}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data: params,
  })
  const body = (await response.json().catch(() => ({}))) as ActionReply['body']
  return { status: response.status(), body }
}

/** Every ledger these specs create carries this prefix, so leftovers can be found and removed. */
const TEST_PREFIX = 'Playwright: '

/** A name no earlier run has used, so slugs and assertions never collide. */
export function uniqueName(purpose: string): string {
  return `${TEST_PREFIX}${purpose} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Delete a ledger through the person's door. Never throws: it is cleanup. */
export async function removeLedger(page: Page, ledgerId: string): Promise<void> {
  try {
    const token = await sessionToken(page)
    for (let pass = 0; pass < 10; pass += 1) {
      const reply = await callAction(page, 'deleteLedger', { ledgerId }, token)
      if (reply.body.success !== true || reply.body.data?.done === true) return
    }
  } catch {
    // The page is gone or signed out. The next run's createLedger clears leftovers.
  }
}

/**
 * A run that was interrupted leaves its ledgers behind, and they count
 * against the 20-ledger limit. Clear them from the list on /home.
 */
async function removeLeftovers(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'New ledger' }).first()).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByLabel('Loading your ledgers')).toHaveCount(0, { timeout: 15_000 })
  const leftovers = await page
    .getByTestId('ledger-row')
    .filter({ hasText: TEST_PREFIX })
    .locator('a[href^="/l/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  for (const href of leftovers) {
    const ledgerId = href.split('/').pop()
    if (ledgerId) await removeLedger(page, ledgerId)
  }
}

/** Create a ledger, hand it to the test, and delete it afterwards whatever happened. */
export async function withLedger(
  page: Page,
  name: string,
  body: (ledgerId: string) => Promise<void>,
): Promise<void> {
  const ledgerId = await createLedger(page, name)
  try {
    await body(ledgerId)
  } finally {
    await removeLedger(page, ledgerId)
  }
}

/** Create a ledger through the UI and land on its page. Returns the ledger id. */
export async function createLedger(page: Page, name: string): Promise<string> {
  await page.goto('/home')
  await removeLeftovers(page)
  await page.getByRole('button', { name: 'New ledger' }).first().click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'Create ledger' }).click()
  await page.waitForURL(/\/l\/[^/?#]+$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15_000 })
  return new URL(page.url()).pathname.split('/').pop() ?? ''
}

/** Add a claim by hand through the dialog on the ledger page. Stakes stay at medium unless given. */
export async function addClaim(
  page: Page,
  claim: { statement: string; check: string; stakes?: 'Low' | 'Medium' | 'High' },
): Promise<void> {
  await page.getByRole('button', { name: 'Add claim' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('What was claimed').fill(claim.statement)
  await dialog.getByLabel('How to check it').fill(claim.check)
  if (claim.stakes) await dialog.getByRole('radio', { name: claim.stakes }).click()
  await dialog.getByRole('button', { name: 'Add claim' }).click()
  await expect(claimRow(page, claim.statement)).toBeVisible({ timeout: 15_000 })
}

/** The ledger row for a claim, found by what it says. */
export function claimRow(page: Page, statement: string): Locator {
  return page.getByTestId('claim-row').filter({ hasText: statement })
}

/** Publish or unpublish the open ledger through its confirmation dialog. */
export async function setVisibility(page: Page, target: 'public' | 'private'): Promise<void> {
  const label = target === 'public' ? 'Publish' : 'Make private'
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click()
  await expect(page.getByTestId('ledger-visibility')).toContainText(
    target === 'public' ? 'Public: anyone with the link can read it.' : 'Private: only you can read it.',
    { timeout: 15_000 },
  )
}

export interface RoomReply {
  /** The room applied the write. */
  accepted: boolean
  /** The room answered with an explicit refusal (as opposed to not answering). */
  refused: boolean
  reply: string
}

/**
 * Talk to the record room directly from this page, the way a tampered client
 * would: a second socket to the room the app itself opened, authenticated with
 * this account's own session token. `roomUrl` comes from `recordRoomUrl`.
 */
async function withRoomSocket<T>(
  page: Page,
  roomUrl: string,
  frame: { type: string; payload: Record<string, unknown> },
  settle: 'write' | 'query' | 'roster',
): Promise<T> {
  expect(roomUrl, 'the app opened a record-room socket').not.toBe('')
  const url = new URL(roomUrl)
  url.searchParams.set('token', await sessionToken(page))
  const result = await page.evaluate(
    ({ address, outgoing, mode }) =>
      new Promise<unknown>((resolve) => {
        const socket = new WebSocket(address)
        const finish = (value: unknown) => {
          clearTimeout(timer)
          socket.close()
          resolve(value)
        }
        const silent =
          mode === 'write'
            ? { accepted: false, refused: false, reply: 'no reply' }
            : mode === 'query'
              ? { records: null }
              : { users: null }
        const timer = setTimeout(() => finish(silent), 5000)
        socket.addEventListener('open', () => socket.send(JSON.stringify(outgoing)))
        socket.addEventListener('error', () => finish(silent))
        socket.addEventListener('message', (event) => {
          let incoming: {
            type?: string
            payload?: {
              requestId?: string
              subscriptionId?: string
              success?: boolean
              records?: unknown[]
              users?: unknown[]
            }
          }
          try {
            incoming = JSON.parse(String(event.data))
          } catch {
            return
          }
          if (mode === 'query') {
            if (incoming.type === 'core.query_result' && incoming.payload?.subscriptionId === 'probe') {
              finish({ records: incoming.payload.records ?? [] })
            }
            return
          }
          if (mode === 'roster') {
            if (incoming.type === 'user.list') finish({ users: incoming.payload?.users ?? [] })
            return
          }
          const isAck = incoming.type === 'records.ack' && incoming.payload?.requestId === 'forged'
          if (!isAck && incoming.type !== 'core.error') return
          const accepted = isAck && incoming.payload?.success !== false
          finish({ accepted, refused: !accepted, reply: JSON.stringify(incoming.payload ?? {}) })
        })
      }),
    { address: url.toString(), outgoing: frame, mode: settle },
  )
  return result as T
}

/** Ask the room to create or overwrite a record, bypassing the server actions. */
export function writeToRoom(
  page: Page,
  roomUrl: string,
  record: { collection: string; recordId: string; data: Record<string, unknown> },
): Promise<RoomReply> {
  return withRoomSocket(page, roomUrl, { type: 'core.put', payload: { ...record, requestId: 'forged' } }, 'write')
}

/** Ask the room to delete a record, bypassing the server actions. */
export function deleteFromRoom(
  page: Page,
  roomUrl: string,
  record: { collection: string; recordId: string },
): Promise<RoomReply> {
  return withRoomSocket(page, roomUrl, { type: 'core.delete', payload: { ...record, requestId: 'forged' } }, 'write')
}

/**
 * What this account can read from the room for one ledger. Used as a control:
 * a private ledger's rows come back only on its keeper's socket.
 */
export async function readFromRoom(
  page: Page,
  roomUrl: string,
  collection: string,
  ledgerId: string,
): Promise<Array<{ recordId: string; data: Record<string, unknown> }> | null> {
  const result = await withRoomSocket<{ records: Array<{ recordId: string; data: Record<string, unknown> }> | null }>(
    page,
    roomUrl,
    { type: 'core.subscribe', payload: { subscriptionId: 'probe', query: { collection, where: { ledgerId } } } },
    'query',
  )
  return result.records
}

/**
 * The list of users the room is willing to show this account. `null` means
 * the room did not answer.
 */
export async function rosterFromRoom(
  page: Page,
  roomUrl: string,
): Promise<Array<{ id?: string; name?: string }> | null> {
  const result = await withRoomSocket<{ users: Array<{ id?: string; name?: string }> | null }>(
    page,
    roomUrl,
    { type: 'user.list', payload: {} },
    'roster',
  )
  return result.users
}

/**
 * Start listening for the record-room socket the app opens. Call before
 * `page.goto`, then await the returned promise once the page has loaded. It
 * resolves to '' if no socket opens, and the room helpers above then fail
 * with a message that says so.
 */
export function recordRoomUrl(page: Page): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(''), 20_000)
    page.on('websocket', (socket) => {
      if (!new URL(socket.url()).pathname.startsWith('/ws/')) return
      clearTimeout(timer)
      resolve(socket.url())
    })
  })
}
