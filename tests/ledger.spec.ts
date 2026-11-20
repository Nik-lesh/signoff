/**
 * The important path, with real signed-in accounts: a keeper creates a ledger,
 * a claim lands in it, the keeper signs it off, and nobody else can.
 *
 * Needs two test accounts (any two from your pool). Their emails are shared
 * by every DeepSpace developer, so pick an address nobody else will have used:
 *   npx deepspace test accounts list
 *   printf %s "$PW" | npx deepspace test accounts create \
 *     --email signoff-keeper-<yourname>@deepspace.test --name "Keeper" --password-stdin
 *
 * Run with `npx deepspace test run all` or
 * `npx deepspace test run tests/ledger.spec.ts`. The default `test run`
 * covers only smoke + api, which need no accounts.
 *
 * The `users` fixture handles sign-in caching (per-account storageState
 * persisted to `~/.deepspace/playwright-states/`), context creation, and
 * cleanup. Every ledger a test creates is deleted when the test ends, so the
 * suite can be run any number of times against the same local data.
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { captureConsoleErrors } from './helpers/errors'
import {
  addClaim,
  callAction,
  claimRow,
  createLedger,
  deleteFromRoom,
  mintAgentToken,
  readFromRoom,
  recordRoomUrl,
  removeLedger,
  rosterFromRoom,
  sessionToken,
  setVisibility,
  uniqueName,
  withLedger,
  writeToRoom,
} from './helpers/signoff'

// A machine that has never created test accounts is the normal state of a
// fresh checkout, and there `users()` throws — turning "you have no pool yet"
// into red tests about the app, which it is not. Skip the file instead and
// say what creates the pool.
const usableTestAccounts = loadAllTestAccounts().length
test.skip(
  usableTestAccounts < 2,
  `Needs 2 usable test accounts, found ${usableTestAccounts}. Create them with ` +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" ' +
    '--password-stdin`, or fetch existing pool accounts with `npx deepspace test accounts recover --all`.',
)

// These tests sign in real accounts and wait on a real auth service, and the
// publishing test drives three browsers. The default 30 seconds is too tight.
test.describe.configure({ timeout: 90_000 })

const CLAIM = {
  statement: 'All unit tests pass on a clean checkout',
  check: 'Run npm run test:unit and read the summary line',
}

test('each browser renders its own signed-in account', async ({ users }) => {
  const [a, b] = await users(2)

  // /home is dynamic (under src/pages/(app)/), so it mounts the nav shell;
  // '/' is the static landing and has no navigation.
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  // Email, not name: the page renders the session's `name || email`, while
  // `user.name` comes from the local account registry, and a display name is
  // optional. The email is the one identity both sides agree on. Two distinct
  // matches also prove the contexts are not sharing one session.
  for (const user of [a, b]) {
    await expect(user.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })
    await expect(user.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })
    await user.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(user.page.getByTestId('nav-user-email')).toHaveText(user.email, {
      timeout: 15_000,
    })
  }
})

test('a keeper creates a ledger, signs a claim off, changes their mind, and deletes the ledger', async ({
  users,
}) => {
  const [keeper] = await users(1)
  const { page } = keeper
  const errors = captureConsoleErrors(page)
  const name = uniqueName('Sign-off flow')

  const ledgerId = await createLedger(page, name)
  try {
    await expect(page.getByTestId('ledger-visibility')).toContainText('Private: only you can read it.')
    await expect(
      page.getByRole('heading', { name: 'This ledger is empty. Connect your agent to fill it.' }),
    ).toBeVisible()

    await addClaim(page, { ...CLAIM, stakes: 'High' })
    const row = claimRow(page, CLAIM.statement)
    await expect(row).toHaveAttribute('data-status', 'new')
    await expect(page.getByTestId('tally')).toContainText(
      '1 claim: 0 verified, 0 wrong, 0 not checked, 1 waiting.',
    )
    // The percentage alone could hide that the claim that matters most is unchecked.
    await expect(page.getByTestId('tally')).toContainText(
      'The 1 high-stakes claim has not been checked.',
    )

    // "Verified" has to say what was done. Nothing is recorded without it.
    await row.getByRole('button', { name: 'Mark verified' }).click()
    await expect(row.getByRole('alert')).toBeVisible()
    await expect(row).toHaveAttribute('data-status', 'new')

    await row.getByLabel('What did you do to check it?').fill('Ran it myself: every test passed')
    await row.getByRole('button', { name: 'Mark verified' }).click()
    await expect(row).toHaveAttribute('data-status', 'verified', { timeout: 15_000 })
    await expect(row.getByTestId('signoff-mark')).toContainText('Verified')
    await expect(row.getByTestId('signoff-mark')).toContainText('Ran it myself: every test passed')
    await expect(page.getByTestId('tally')).toContainText('1 verified')
    await expect(page.getByTestId('tally')).toContainText('A person checked 100% of them.')
    await expect(page.getByTestId('tally')).toContainText('The 1 high-stakes claim has been checked.')

    // A change of mind is a second verdict. The first stays on the record.
    await row.getByRole('button', { name: 'Change verdict' }).click()
    await row
      .getByLabel('What did you do to check it?')
      .fill('Fails on a clean install: a variable is missing')
    await row.getByRole('button', { name: 'Mark wrong' }).click()
    await expect(row).toHaveAttribute('data-status', 'wrong', { timeout: 15_000 })
    await expect(row.getByText('1 earlier verdict')).toBeVisible()
    await expect(page.getByTestId('tally')).toContainText('0 verified, 1 wrong')

    // The verdict survives a reload: it is stored, not just drawn.
    await page.reload()
    await expect(claimRow(page, CLAIM.statement)).toHaveAttribute('data-status', 'wrong', {
      timeout: 15_000,
    })

    await page.goto('/home')
    const listed = page.getByTestId('ledger-row').filter({ hasText: name })
    await expect(listed).toBeVisible({ timeout: 15_000 })

    // Deleting is the one way anything leaves, and it takes the whole ledger.
    await listed.getByRole('link', { name }).click()
    await page.getByRole('button', { name: 'Delete ledger' }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toContainText('its 1 claim and every verdict')
    await confirm.getByRole('button', { name: 'Delete ledger' }).click()
    await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 })
    await expect(page.getByTestId('ledger-row').filter({ hasText: name })).toHaveCount(0, {
      timeout: 15_000,
    })
    await page.goto(`/l/${ledgerId}`)
    await expect(page.getByTestId('ledger-missing')).toBeVisible({ timeout: 15_000 })
    expect(errors).toEqual([])
  } finally {
    await removeLedger(page, ledgerId)
  }
})

test('a ledger is private until its keeper publishes it, and read-only for everyone else', async ({
  users,
  browser,
}) => {
  const [keeper, other] = await users(2)
  const name = uniqueName('Publishing')

  // A signed-out visitor, in a browser context with no session at all.
  const visitorContext = await browser.newContext()
  const visitor = await visitorContext.newPage()

  try {
    await withLedger(keeper.page, name, async (ledgerId) => {
      await addClaim(keeper.page, CLAIM)
      const address = new URL(`/l/${ledgerId}`, keeper.page.url()).toString()

      // Private: another signed-in person and a signed-out visitor get the same page.
      for (const page of [other.page, visitor]) {
        await page.goto(address)
        await expect(page.getByTestId('ledger-missing')).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText(CLAIM.statement)).toHaveCount(0)
      }

      await setVisibility(keeper.page, 'public')

      // Public: both can read it, and neither is offered a way to rule, add or delete.
      for (const page of [other.page, visitor]) {
        await page.goto(address)
        await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15_000 })
        await expect(claimRow(page, CLAIM.statement)).toBeVisible()
        await expect(page.getByTestId('ledger-visibility')).toContainText('Public and read-only')
        await expect(page.getByTestId('signoff-form')).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Add claim' })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Make private' })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Delete ledger' })).toHaveCount(0)
      }

      // Live: a claim and a verdict recorded now reach the readers' open pages.
      const second = { statement: 'The export matches the ledger', check: 'Compare the two by eye' }
      await addClaim(keeper.page, second)
      const keeperRow = claimRow(keeper.page, second.statement)
      await keeperRow.getByLabel('What did you do to check it?').fill('Compared all rows by hand')
      await keeperRow.getByRole('button', { name: 'Mark verified' }).click()
      for (const page of [other.page, visitor]) {
        await expect(claimRow(page, second.statement)).toHaveAttribute('data-status', 'verified', {
          timeout: 15_000,
        })
      }

      await setVisibility(keeper.page, 'private')

      // Private again: pages that were open lose it without a reload, and the
      // link stops working for everyone but the keeper.
      for (const page of [other.page, visitor]) {
        await expect(page.getByTestId('ledger-missing')).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText(CLAIM.statement)).toHaveCount(0)
        await page.goto(address)
        await expect(page.getByTestId('ledger-missing')).toBeVisible({ timeout: 15_000 })
      }
      await keeper.page.reload()
      await expect(claimRow(keeper.page, CLAIM.statement)).toBeVisible({ timeout: 15_000 })
    })
  } finally {
    await visitorContext.close()
  }
})

test("another person's session token opens nothing in a ledger they do not keep", async ({ users }) => {
  const [keeper, other] = await users(2)
  await withLedger(keeper.page, uniqueName('Doors'), async (ledgerId) => {
    const keeperToken = await sessionToken(keeper.page)
    const filed = await callAction(keeper.page, 'addClaim', { ledgerId, ...CLAIM }, keeperToken)
    expect(filed.body.success, JSON.stringify(filed.body)).toBe(true)
    const claimId = String(filed.body.data?.claimId ?? '')
    expect(claimId).not.toBe('')

    await other.page.goto('/home')
    const otherToken = await sessionToken(other.page)
    const attempts: Array<[string, Record<string, unknown>]> = [
      ['recordVerdict', { claimId, status: 'verified', note: 'Signed by someone who does not keep this ledger' }],
      ['addClaim', { ledgerId, ...CLAIM }],
      ['setLedgerVisibility', { ledgerId, visibility: 'public' }],
      ['deleteLedger', { ledgerId }],
    ]
    for (const [action, params] of attempts) {
      const reply = await callAction(other.page, action, params, otherToken)
      expect(reply.body, action).toMatchObject({ success: false, code: 'not_found' })
    }

    // Nothing changed for the keeper: one claim, still waiting, still private.
    await keeper.page.reload()
    await expect(keeper.page.getByTestId('claim-row')).toHaveCount(1, { timeout: 15_000 })
    await expect(claimRow(keeper.page, CLAIM.statement)).toHaveAttribute('data-status', 'new')
    await expect(keeper.page.getByTestId('ledger-visibility')).toContainText('Private')
  })
})

test("a person's session token is refused at the agent's door", async ({ users }) => {
  const [keeper] = await users(1)
  await keeper.page.goto('/home')
  const token = await sessionToken(keeper.page)

  const list = await keeper.page.request.get('/_deepspace/agent/tools', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(list.status()).toBe(401)

  const call = await keeper.page.request.post('/_deepspace/agent/tools/file_claim', {
    headers: { Authorization: `Bearer ${token}` },
    data: { input: { claim: CLAIM.statement, check: CLAIM.check } },
  })
  expect(call.status()).toBe(401)
})

test('a signed-in person is not told who else uses the app', async ({ users }) => {
  const [first, second] = await users(2)
  // Both accounts have visited, so both are registered in the room.
  const roomUrl = recordRoomUrl(first.page)
  await Promise.all([first.page.goto('/home'), second.page.goto('/home')])
  await expect(second.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })
  const url = await roomUrl

  for (const person of [first, second]) {
    const roster = await rosterFromRoom(person.page, url)
    expect(roster, 'the room answered').not.toBeNull()
    expect(roster).toHaveLength(1)
  }
})

test("a signed-in person cannot spend the app owner's credits through the integration proxy", async ({
  users,
}) => {
  const [person] = await users(1)
  await person.page.goto('/home')
  const token = await sessionToken(person.page)
  for (const path of ['openai/chat-completion', 'anthropic/chat-completion', 'google/calendar-list']) {
    const res = await person.page.request.post(`/api/integrations/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { model: 'any', messages: [{ role: 'user', content: 'hello' }] },
    })
    expect(res.status(), path).toBe(404)
  }
})

test('even the keeper cannot write, change or delete a claim or a verdict except through the server', async ({
  users,
}) => {
  const [keeper, other] = await users(2)
  const { page } = keeper
  const roomUrl = recordRoomUrl(page)
  await withLedger(page, uniqueName('Tamper'), async (ledgerId) => {
    await addClaim(page, CLAIM)
    const url = await roomUrl

    // Control: this socket really is the keeper's. The ledger is private, so its
    // claim comes back here and on nobody else's socket.
    const mine = await readFromRoom(page, url, 'claims', ledgerId)
    expect(mine?.map((row) => row.data.statement)).toEqual([CLAIM.statement])
    const claimId = mine?.[0]?.recordId ?? ''
    await other.page.goto('/home')
    expect(await readFromRoom(other.page, url, 'claims', ledgerId)).toEqual([])

    // A tampered client talking to the record room directly, signed in as the
    // keeper: the strongest position a browser can be in. Every attempt has to
    // be refused by the room itself, not merely go unanswered.
    const owner = String(mine?.[0]?.data.ownerId ?? '')
    const attempts = [
      await writeToRoom(page, url, {
        collection: 'verdicts',
        recordId: `forged_${Date.now()}`,
        data: {
          claimId,
          ledgerId,
          ownerId: owner,
          visibility: 'private',
          status: 'verified',
          note: 'Approved without anyone checking',
          byName: 'Nobody',
        },
      }),
      await writeToRoom(page, url, {
        collection: 'claims',
        recordId: `forged_${Date.now()}`,
        data: {
          ledgerId,
          ownerId: owner,
          visibility: 'private',
          statement: 'A claim no agent filed',
          check: 'None',
          stakes: 'low',
          source: 'agent',
        },
      }),
      await writeToRoom(page, url, {
        collection: 'claims',
        recordId: claimId,
        data: { statement: 'Rewritten after the fact' },
      }),
      await writeToRoom(page, url, {
        collection: 'ledgers',
        recordId: ledgerId,
        data: { visibility: 'public' },
      }),
      await deleteFromRoom(page, url, { collection: 'claims', recordId: claimId }),
      await deleteFromRoom(page, url, { collection: 'ledgers', recordId: ledgerId }),
    ]
    for (const attempt of attempts) {
      expect(attempt, attempt.reply).toMatchObject({ accepted: false, refused: true })
    }

    await page.reload()
    await expect(page.getByTestId('claim-row')).toHaveCount(1, { timeout: 15_000 })
    await expect(claimRow(page, CLAIM.statement)).toHaveAttribute('data-status', 'new')
    await expect(page.getByTestId('ledger-visibility')).toContainText('Private')
  })
})

/**
 * What `npx deepspace agent invoke` does before it calls a tool: get an
 * agent-scoped token for this origin. Here the test asks the auth service for
 * one directly, as the signed-in account. If the local setup cannot mint or
 * use one, the calling test is skipped rather than failed: the same path is
 * then checked by hand with the CLI (see README, "Checking the agent's door by
 * hand").
 */
async function agentDoor(page: Page) {
  const origin = new URL(page.url()).origin
  const minted = await mintAgentToken(page)
  const auth = { Authorization: `Bearer ${minted.token}` }
  const list = minted.token
    ? await page.request.get('/_deepspace/agent/tools', { headers: auth })
    : null
  test.skip(
    !list || list.status() !== 200,
    `No usable agent token for ${origin} in this run (mint: HTTP ${minted.status}, ` +
      `tool list: ${list ? `HTTP ${list.status()}` : 'not tried'}). Check the agent's door with the CLI instead.`,
  )
  const tools = list
    ? ((await list.json()) as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)
    : []
  const invoke = (tool: string, input: Record<string, unknown>) =>
    page.request.post(`/_deepspace/agent/tools/${tool}`, { headers: auth, data: { input } })

  /** The agent finds a ledger the way a real one would: by listing its own. */
  const slugOf = async (name: string) => {
    const ledgers = await invoke('list_ledgers', {})
    expect(ledgers.status(), await ledgers.text()).toBe(200)
    const listed = (await ledgers.json()) as {
      result?: { ledgers?: Array<{ slug: string; name: string }> }
    }
    const slug = listed.result?.ledgers?.find((ledger) => ledger.name === name)?.slug ?? ''
    expect(slug, `slug of "${name}" in ${JSON.stringify(listed)}`).not.toBe('')
    return slug
  }
  return { auth, tools, invoke, slugOf }
}

test('an agent token can file a claim and read it back, and cannot sign or delete', async ({
  users,
}) => {
  const [keeper] = await users(1)
  const { page } = keeper
  const name = uniqueName('Agent door')
  await withLedger(page, name, async (ledgerId) => {
    const { auth, tools, invoke, slugOf } = await agentDoor(page)
    expect(tools.sort()).toEqual(['file_claim', 'list_claims', 'list_ledgers'])
    const slug = await slugOf(name)

    const statement = 'The agent door refuses every verdict'
    const filed = await invoke('file_claim', {
      ledger: slug,
      claim: statement,
      check: 'Run this spec',
      agent: 'playwright',
    })
    expect(filed.status(), await filed.text()).toBe(200)

    // It arrives on the keeper's open page without a reload, marked as an agent's.
    const row = claimRow(page, statement)
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row).toHaveAttribute('data-status', 'new')
    await expect(row).toContainText('playwright')

    // The agent cannot sign or delete: there is no such tool, and its token is
    // refused by the actions that do those things.
    for (const tool of ['record_verdict', 'recordVerdict', 'delete_ledger', 'records.update', 'records.create']) {
      const call = await invoke(tool, { claimId: 'any', status: 'verified', note: 'I checked my own work' })
      expect(call.status(), tool).toBe(404)
    }
    const actions: Array<[string, Record<string, unknown>]> = [
      ['recordVerdict', { claimId: 'any', status: 'verified', note: 'I checked my own work' }],
      ['deleteLedger', { ledgerId }],
      ['setLedgerVisibility', { ledgerId, visibility: 'public' }],
    ]
    for (const [action, params] of actions) {
      const reply = await page.request.post(`/api/actions/${action}`, { headers: auth, data: params })
      expect(reply.status(), action).toBe(401)
    }
    await expect(row).toHaveAttribute('data-status', 'new')

    // Once a person rules, the agent can read the verdict and the reason.
    await row.getByLabel('What did you do to check it?').fill('Read the 401s and the 404s above')
    await row.getByRole('button', { name: 'Mark verified' }).click()
    await expect(row).toHaveAttribute('data-status', 'verified', { timeout: 15_000 })
    const readBack = await invoke('list_claims', { ledger: slug })
    expect(readBack.status()).toBe(200)
    expect(await readBack.text()).toContain('Read the 401s and the 404s above')
  })
})

test('an agent files its fix as a follow-up to the claim a person marked wrong', async ({ users }) => {
  const [keeper] = await users(1)
  const { page } = keeper
  const name = uniqueName('Follow-up')
  await withLedger(page, name, async () => {
    const { invoke, slugOf } = await agentDoor(page)
    const slug = await slugOf(name)

    const broken = 'Every page loads in under a second'
    const first = await invoke('file_claim', {
      ledger: slug,
      claim: broken,
      check: 'Time the first load of the ledger list',
      stakes: 'high',
    })
    expect(first.status(), await first.text()).toBe(200)
    const brokenRow = claimRow(page, broken)
    await expect(brokenRow).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('tally')).toContainText(
      'The 1 high-stakes claim has not been checked.',
    )
    await brokenRow.getByLabel('What did you do to check it?').fill('Took four seconds on a cold start')
    await brokenRow.getByRole('button', { name: 'Mark wrong' }).click()
    await expect(brokenRow).toHaveAttribute('data-status', 'wrong', { timeout: 15_000 })

    // The agent reads what was refuted, and gets the id it needs to answer it.
    const refuted = await invoke('list_claims', { ledger: slug, status: 'wrong' })
    const wrong = (
      (await refuted.json()) as { result?: { claims?: Array<{ id: string; claim: string }> } }
    ).result?.claims
    expect(wrong?.map((claim) => claim.claim)).toEqual([broken])

    // Its fix is a new claim that points back. The wrong one stays wrong, the
    // fix waits for its own verdict, and each row names the other.
    const fix = 'Fixed the slow first load: the list now loads in under a second'
    const second = await invoke('file_claim', {
      ledger: slug,
      claim: fix,
      check: 'Time the first load of the ledger list again',
      follows: wrong?.[0]?.id,
    })
    expect(second.status(), await second.text()).toBe(200)
    const fixRow = claimRow(page, fix)
    await expect(fixRow.getByTestId('claim-follows')).toHaveText('Follows No. 1, marked wrong', {
      timeout: 15_000,
    })
    await expect(fixRow).toHaveAttribute('data-status', 'new')
    await expect(brokenRow.getByTestId('claim-followed-by')).toHaveText('Followed by No. 2')
    await expect(brokenRow).toHaveAttribute('data-status', 'wrong')
    await expect(page.getByTestId('tally')).toContainText('The 1 high-stakes claim has been checked.')

    // Asked again, the agent can tell that this wrong claim already has a fix on file.
    const again = await invoke('list_claims', { ledger: slug, status: 'wrong' })
    const answered = (
      (await again.json()) as { result?: { claims?: Array<{ followedBy?: Array<{ status: string }> }> } }
    ).result?.claims?.[0]?.followedBy
    expect(answered?.map((link) => link.status)).toEqual(['new'])

    // A follow-up has to point at a claim in this same ledger. Anything else is refused.
    const stray = await invoke('file_claim', {
      ledger: slug,
      claim: 'A fix for a claim that is not in this ledger',
      check: 'This call has to be refused',
      follows: 'no-such-claim',
    })
    expect(stray.status(), await stray.text()).toBe(400)
    await expect(page.getByTestId('claim-row')).toHaveCount(2)
  })
})
