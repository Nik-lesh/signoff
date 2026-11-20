import { beforeEach, describe, expect, it } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { LIMITS, type ClaimData, type LedgerData, type VerdictData } from '../lib/ledger'
import { ledgerSchemas } from '../schemas/ledger-schemas'
import {
  createLedger,
  deleteLedger,
  fileClaim,
  listClaims,
  listLedgers,
  ownedLedger,
  ownedLedgerBySlug,
  recordVerdict,
  setVisibility,
  type Caller,
} from './ledger-service'

/**
 * The service is the only code that writes ledgers, claims and verdicts, and
 * it runs with the record room's per-record permissions switched off. These
 * tests are therefore the authorization tests: every rule about who may do
 * what is exercised here against an in-memory stand-in for the record room.
 *
 * The stand-in keeps two of the real room's rules, read from the real schemas
 * in src/schemas/ledger-schemas.ts: a required column must be present on
 * create, and an immutable column cannot change on update. It also counts
 * every row it is asked to remove, so a test can say exactly when deletion is
 * allowed to happen.
 */

interface StoredRow {
  recordId: string
  data: Record<string, unknown>
  createdAt: string
}

class FakeRecordRoom {
  rows = new Map<string, Map<string, StoredRow>>()
  /** Updates the room refused, so a test can assert there were none. */
  refused: string[] = []
  /** Rows removed, as `collection/recordId`, in the order they went. */
  removed: string[] = []
  private clock = Date.UTC(2026, 10, 16, 9, 0, 0)
  private serial = 0

  private table(collection: string): Map<string, StoredRow> {
    let table = this.rows.get(collection)
    if (!table) {
      table = new Map()
      this.rows.set(collection, table)
    }
    return table
  }

  private columns(collection: string) {
    return ledgerSchemas.find((schema) => schema.name === collection)?.columns ?? []
  }

  seedUser(id: string, name: string) {
    this.table('users').set(id, { recordId: id, data: { name }, createdAt: new Date(this.clock).toISOString() })
  }

  all<T>(collection: string): Array<{ recordId: string; data: T; createdAt: string }> {
    return [...this.table(collection).values()] as Array<{ recordId: string; data: T; createdAt: string }>
  }

  readonly tools = {
    create: async (collection: string, data: Record<string, unknown>) => {
      for (const column of this.columns(collection)) {
        const value = data[column.name]
        if (column.required && (value === undefined || value === null || value === '')) {
          return { success: false as const, error: `Required field '${column.name}' is missing` }
        }
      }
      this.clock += 1000
      this.serial += 1
      const recordId = `${this.clock}_${String(this.serial).padStart(4, '0')}`
      const row = { recordId, data: { ...data }, createdAt: new Date(this.clock).toISOString() }
      this.table(collection).set(recordId, row)
      return { success: true as const, data: { recordId, record: row } }
    },

    update: async (collection: string, recordId: string, patch: Record<string, unknown>) => {
      const row = this.table(collection).get(recordId)
      if (!row) return { success: false as const, error: 'no such record' }
      for (const column of this.columns(collection)) {
        const next = patch[column.name]
        if (column.immutable && next !== undefined && next !== row.data[column.name]) {
          const error = `Cannot modify immutable field '${column.name}'`
          this.refused.push(`${collection}: ${error}`)
          return { success: false as const, error }
        }
      }
      row.data = { ...row.data, ...patch }
      return { success: true as const, data: { recordId, record: row } }
    },

    get: async (collection: string, recordId: string) => {
      const row = this.table(collection).get(recordId)
      return row
        ? { success: true as const, data: { record: row } }
        : { success: false as const, error: 'not found' }
    },

    remove: async (collection: string, recordId: string) => {
      if (!this.table(collection).delete(recordId)) {
        return { success: false as const, error: 'no such record' }
      }
      this.removed.push(`${collection}/${recordId}`)
      return { success: true as const, data: { recordId } }
    },

    deleteWhere: async (collection: string, where: Record<string, unknown>, limit = 100) => {
      if (Object.keys(where).length === 0) {
        return { success: false as const, error: 'deleteWhere needs a filter' }
      }
      const matching = [...this.table(collection).values()]
        .filter((row) => Object.entries(where).every(([key, value]) => row.data[key] === value))
        .slice(0, limit)
      for (const row of matching) {
        this.table(collection).delete(row.recordId)
        this.removed.push(`${collection}/${row.recordId}`)
      }
      return { success: true as const, data: { deleted: matching.length } }
    },

    query: async (
      collection: string,
      options: { where?: Record<string, unknown>; orderDir?: 'asc' | 'desc'; limit?: number } = {},
    ) => {
      let records = [...this.table(collection).values()].filter((row) =>
        Object.entries(options.where ?? {}).every(([key, value]) => row.data[key] === value),
      )
      records.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      if (options.orderDir !== 'asc') records.reverse()
      if (options.limit !== undefined) records = records.slice(0, options.limit)
      return { success: true as const, data: { records } }
    },
  }
}

const alice: Caller = { id: 'user_alice' }
const bob: Caller = { id: 'user_bob' }

let room: FakeRecordRoom
let tools: ActionTools

beforeEach(() => {
  room = new FakeRecordRoom()
  room.seedUser(alice.id, 'Alice Example')
  room.seedUser(bob.id, 'Bob Example')
  tools = room.tools as unknown as ActionTools
})

/** Unwrap a result the test expects to succeed, with a readable failure if it did not. */
function valueOf<T>(result: { ok: true; value: T } | { ok: false; code: string; message: string }): T {
  if (!result.ok) throw new Error(`expected success, got ${result.code}: ${result.message}`)
  return result.value
}

async function ledgerFor(caller: Caller, name = 'Checkout rewrite') {
  const { ledgerId } = valueOf(await createLedger(tools, caller, { name }))
  return valueOf(await ownedLedger(tools, caller, ledgerId))
}

async function claimIn(caller: Caller, ledgerId: string, statement = 'All unit tests pass') {
  const ledger = valueOf(await ownedLedger(tools, caller, ledgerId))
  return valueOf(
    await fileClaim(tools, caller, ledger, { statement, check: 'Run npm run test:unit' }, 'agent'),
  )
}

describe('createLedger', () => {
  it('starts private, owned by the caller, with a slug made from the name', async () => {
    const ledger = await ledgerFor(alice, 'Checkout Rewrite!')
    expect(ledger.data).toMatchObject({
      name: 'Checkout Rewrite!',
      slug: 'checkout-rewrite',
      ownerId: alice.id,
      ownerName: 'Alice Example',
      visibility: 'private',
      claimCount: 0,
    })
  })

  it('gives a second ledger with the same name its own slug', async () => {
    await ledgerFor(alice)
    const second = await ledgerFor(alice)
    expect(second.data.slug).toBe('checkout-rewrite-2')
  })

  it('lets two people use the same slug without seeing each other', async () => {
    const hers = await ledgerFor(alice)
    const his = await ledgerFor(bob)
    expect(his.data.slug).toBe(hers.data.slug)
    expect(valueOf(await listLedgers(tools, alice))).toHaveLength(1)
  })

  it('refuses a missing name and a repository link that is not https', async () => {
    expect(await createLedger(tools, alice, { name: '  ' })).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(
      await createLedger(tools, alice, { name: 'Fine', repoUrl: 'http://example.com/repo' }),
    ).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(room.all('ledgers')).toHaveLength(0)
  })

  it('stops at the ledger limit', async () => {
    for (let n = 0; n < LIMITS.ledgersPerOwner; n += 1) await ledgerFor(alice, `Ledger ${n}`)
    expect(await createLedger(tools, alice, { name: 'One more' })).toMatchObject({
      ok: false,
      code: 'limit_reached',
    })
    // The limit is per person.
    expect((await createLedger(tools, bob, { name: 'His first' })).ok).toBe(true)
  })
})

describe('finding a ledger', () => {
  it("answers someone else's ledger exactly like one that does not exist", async () => {
    const hers = await ledgerFor(alice)
    const stranger = await ownedLedger(tools, bob, hers.recordId)
    const missing = await ownedLedger(tools, bob, 'no_such_ledger')
    expect(stranger).toMatchObject({ ok: false, code: 'not_found' })
    expect(stranger).toEqual(missing)
  })

  it('needs no slug when the caller has one ledger, and asks for one when there are several', async () => {
    const only = await ledgerFor(alice)
    expect(valueOf(await ownedLedgerBySlug(tools, alice, undefined)).recordId).toBe(only.recordId)

    await ledgerFor(alice, 'Second')
    const ambiguous = await ownedLedgerBySlug(tools, alice, undefined)
    expect(ambiguous).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(ambiguous.ok ? '' : ambiguous.message).toContain('checkout-rewrite, second')
    expect(valueOf(await ownedLedgerBySlug(tools, alice, 'second')).data.name).toBe('Second')
  })

  it("cannot be steered into someone else's ledger by naming its slug", async () => {
    await ledgerFor(alice, 'Secret project')
    await ledgerFor(bob, 'His own')
    expect(await ownedLedgerBySlug(tools, bob, 'secret-project')).toMatchObject({
      ok: false,
      code: 'not_found',
    })
  })

  it('tells a caller with no ledgers to create one in the browser', async () => {
    const result = await ownedLedgerBySlug(tools, alice, undefined)
    expect(result).toMatchObject({ ok: false, code: 'not_found' })
    expect(result.ok ? '' : result.message).toMatch(/create one/i)
  })
})

describe('fileClaim', () => {
  it('records the claim under the ledger with the source of the door it came through', async () => {
    const ledger = await ledgerFor(alice)
    valueOf(
      await fileClaim(
        tools,
        alice,
        ledger,
        { statement: 'Typed by a person', check: 'Read it' },
        'manual',
      ),
    )
    await claimIn(alice, ledger.recordId, 'Filed by an agent')

    const claims = room.all<ClaimData>('claims')
    expect(claims.map((claim) => [claim.data.statement, claim.data.source])).toEqual([
      ['Typed by a person', 'manual'],
      ['Filed by an agent', 'agent'],
    ])
    expect(claims.every((claim) => claim.data.ownerId === alice.id)).toBe(true)
    expect(claims.every((claim) => claim.data.ledgerId === ledger.recordId)).toBe(true)
    expect(claims.every((claim) => claim.data.stakes === 'medium')).toBe(true)
  })

  it('links a follow-up to the earlier claim it fixes, and shows the link to an agent', async () => {
    const ledger = await ledgerFor(alice)
    const first = await claimIn(alice, ledger.recordId, 'All unit tests pass')
    valueOf(await recordVerdict(tools, alice, { claimId: first.claimId, status: 'wrong', note: 'Two tests fail' }))

    const row = valueOf(await ownedLedger(tools, alice, ledger.recordId))
    const fix = valueOf(
      await fileClaim(
        tools,
        alice,
        row,
        { statement: 'Fixed the two failing tests', check: 'Run npm run test:unit', follows: first.claimId },
        'agent',
      ),
    )
    expect(room.all<ClaimData>('claims').find((claim) => claim.recordId === fix.claimId)?.data.follows).toBe(
      first.claimId,
    )
    // A claim that follows nothing stores no link at all.
    expect('follows' in (room.all<ClaimData>('claims')[0].data as object)).toBe(false)

    const listed = valueOf(await listClaims(tools, alice, valueOf(await ownedLedger(tools, alice, ledger.recordId)), undefined))
    expect(listed.claims.map((claim) => [claim.claim, claim.follows])).toEqual([
      ['Fixed the two failing tests', first.claimId],
      ['All unit tests pass', undefined],
    ])
  })

  it('tells an agent which wrong claims already have a fix on file, and how the fix stands', async () => {
    const ledger = await ledgerFor(alice)
    const answered = await claimIn(alice, ledger.recordId, 'All unit tests pass')
    const open = await claimIn(alice, ledger.recordId, 'The build is reproducible')
    for (const claim of [answered, open]) {
      valueOf(await recordVerdict(tools, alice, { claimId: claim.claimId, status: 'wrong', note: 'Checked it: not so' }))
    }
    const row = async () => valueOf(await ownedLedger(tools, alice, ledger.recordId))
    const fix = valueOf(
      await fileClaim(
        tools,
        alice,
        await row(),
        { statement: 'Fixed the two failing tests', check: 'Run npm run test:unit', follows: answered.claimId },
        'agent',
      ),
    )

    // The filter hides the fix itself, but the wrong claim still says it has one.
    const wrong = async () => {
      const listed = valueOf(await listClaims(tools, alice, await row(), 'wrong'))
      return new Map(listed.claims.map((claim) => [claim.claim, claim.followedBy]))
    }
    expect([...(await wrong())]).toHaveLength(2)
    expect((await wrong()).get('All unit tests pass')).toEqual([{ id: fix.claimId, status: 'new' }])
    expect((await wrong()).get('The build is reproducible')).toBeUndefined()

    // If the fix is refuted too, the agent can see the first claim is open again.
    valueOf(await recordVerdict(tools, alice, { claimId: fix.claimId, status: 'wrong', note: 'One test still fails' }))
    expect((await wrong()).get('All unit tests pass')).toEqual([{ id: fix.claimId, status: 'wrong' }])
  })

  it('refuses to follow a claim that is missing, in another ledger, or someone else\'s, with one answer', async () => {
    const mine = await ledgerFor(alice, 'Mine')
    const other = await ledgerFor(alice, 'My other one')
    const his = await ledgerFor(bob, 'His')
    const elsewhere = await claimIn(alice, other.recordId, 'A claim in my other ledger')
    const foreign = await claimIn(bob, his.recordId, 'A claim in his ledger')

    const row = valueOf(await ownedLedger(tools, alice, mine.recordId))
    const answers = []
    for (const follows of ['no_such_claim', elsewhere.claimId, foreign.claimId]) {
      answers.push(
        await fileClaim(tools, alice, row, { statement: 'A follow-up', check: 'Read it closely', follows }, 'agent'),
      )
    }
    for (const answer of answers) {
      expect(answer).toMatchObject({ ok: false, code: 'invalid_input' })
      expect(answer).toEqual(answers[0])
    }
    expect(room.all<ClaimData>('claims')).toHaveLength(2)
    expect(valueOf(await listLedgers(tools, alice)).find((ledger) => ledger.slug === 'mine')?.claims).toBe(0)
  })

  it('keeps the link fixed once the claim is filed', async () => {
    const ledger = await ledgerFor(alice)
    const first = await claimIn(alice, ledger.recordId, 'First')
    const second = await claimIn(alice, ledger.recordId, 'Second')
    const row = valueOf(await ownedLedger(tools, alice, ledger.recordId))
    const fix = valueOf(
      await fileClaim(tools, alice, row, { statement: 'Fix of the first', check: 'Read it closely', follows: first.claimId }, 'agent'),
    )
    expect((await room.tools.update('claims', fix.claimId, { follows: second.claimId })).success).toBe(false)
  })

  it('counts claims on the ledger', async () => {
    const ledger = await ledgerFor(alice)
    await claimIn(alice, ledger.recordId, 'One')
    await claimIn(alice, ledger.recordId, 'Two')
    expect(valueOf(await listLedgers(tools, alice))[0].claims).toBe(2)
  })

  it("refuses a ledger row that belongs to someone else, even if the caller holds it", async () => {
    const hers = await ledgerFor(alice)
    const result = await fileClaim(tools, bob, hers, { statement: 'Sneaky', check: 'None' }, 'agent')
    expect(result).toMatchObject({ ok: false, code: 'not_found' })
    expect(room.all('claims')).toHaveLength(0)
  })

  it('stops when the ledger is full', async () => {
    const ledger = await ledgerFor(alice)
    await room.tools.update('ledgers', ledger.recordId, { claimCount: LIMITS.claimsPerLedger })
    const full = valueOf(await ownedLedger(tools, alice, ledger.recordId))
    expect(
      await fileClaim(tools, alice, full, { statement: 'One too many', check: 'Count them' }, 'agent'),
    ).toMatchObject({ ok: false, code: 'limit_reached' })
    expect(room.all('claims')).toHaveLength(0)
  })
})

describe('recordVerdict', () => {
  it('lets the keeper of the ledger rule on a claim, signed with their name', async () => {
    const ledger = await ledgerFor(alice)
    const { claimId } = await claimIn(alice, ledger.recordId)
    valueOf(
      await recordVerdict(tools, alice, {
        claimId,
        status: 'verified',
        note: 'Ran it on a clean checkout: 80 passed',
      }),
    )
    expect(room.all<VerdictData>('verdicts')[0].data).toMatchObject({
      claimId,
      ledgerId: ledger.recordId,
      ownerId: alice.id,
      status: 'verified',
      byName: 'Alice Example',
      visibility: 'private',
    })
  })

  it("answers someone else's claim exactly like one that does not exist", async () => {
    const ledger = await ledgerFor(alice)
    const { claimId } = await claimIn(alice, ledger.recordId)
    const verdict = { status: 'verified', note: 'Looks right to me, honestly' }
    const stranger = await recordVerdict(tools, bob, { claimId, ...verdict })
    const missing = await recordVerdict(tools, bob, { claimId: 'no_such_claim', ...verdict })
    expect(stranger).toMatchObject({ ok: false, code: 'not_found' })
    expect(stranger).toEqual(missing)
    expect(room.all('verdicts')).toHaveLength(0)
  })

  it('needs a note saying what was done, unless the verdict is "not checked"', async () => {
    const ledger = await ledgerFor(alice)
    const { claimId } = await claimIn(alice, ledger.recordId)
    expect(await recordVerdict(tools, alice, { claimId, status: 'verified' })).toMatchObject({
      ok: false,
      code: 'invalid_input',
    })
    expect(await recordVerdict(tools, alice, { claimId, status: 'wrong', note: 'no' })).toMatchObject({
      ok: false,
      code: 'invalid_input',
    })
    expect((await recordVerdict(tools, alice, { claimId, status: 'skipped' })).ok).toBe(true)
  })

  it('refuses a status that is not a verdict', async () => {
    const ledger = await ledgerFor(alice)
    const { claimId } = await claimIn(alice, ledger.recordId)
    expect(
      await recordVerdict(tools, alice, { claimId, status: 'new', note: 'Trying to reset it' }),
    ).toMatchObject({ ok: false, code: 'invalid_input' })
  })

  it('stops at the verdict limit for one claim, and only for that claim', async () => {
    const ledger = await ledgerFor(alice)
    const busy = await claimIn(alice, ledger.recordId, 'Ruled on again and again')
    const quiet = await claimIn(alice, ledger.recordId, 'Ruled on once')
    for (let n = 0; n < LIMITS.verdictsPerClaim; n += 1) {
      valueOf(await recordVerdict(tools, alice, { claimId: busy.claimId, status: 'skipped' }))
    }
    expect(await recordVerdict(tools, alice, { claimId: busy.claimId, status: 'skipped' })).toMatchObject({
      ok: false,
      code: 'limit_reached',
    })
    expect((await recordVerdict(tools, alice, { claimId: quiet.claimId, status: 'skipped' })).ok).toBe(true)
    expect(room.all('verdicts')).toHaveLength(LIMITS.verdictsPerClaim + 1)
  })

  it('keeps every verdict: a change of mind is a second row, not an edit', async () => {
    const ledger = await ledgerFor(alice)
    const { claimId } = await claimIn(alice, ledger.recordId)
    valueOf(await recordVerdict(tools, alice, { claimId, status: 'verified', note: 'Tests passed locally' }))
    valueOf(await recordVerdict(tools, alice, { claimId, status: 'wrong', note: 'Fails on a clean install' }))

    expect(room.all<VerdictData>('verdicts').map((verdict) => verdict.data.status)).toEqual([
      'verified',
      'wrong',
    ])
    const listed = valueOf(await listClaims(tools, alice, valueOf(await ownedLedger(tools, alice, ledger.recordId)), undefined))
    expect(listed.claims[0]).toMatchObject({ status: 'wrong', note: 'Fails on a clean install' })
  })
})

describe('setVisibility', () => {
  it('publishes the ledger with every claim and verdict already in it', async () => {
    const ledger = await ledgerFor(alice)
    const { claimId } = await claimIn(alice, ledger.recordId)
    valueOf(await recordVerdict(tools, alice, { claimId, status: 'verified', note: 'Checked by hand' }))

    const result = valueOf(await setVisibility(tools, alice, { ledgerId: ledger.recordId, visibility: 'public' }))
    expect(result).toEqual({ visibility: 'public', updated: 2, done: true })
    for (const collection of ['ledgers', 'claims', 'verdicts']) {
      expect(room.all<{ visibility: string }>(collection).map((row) => row.data.visibility)).toEqual(['public'])
    }
  })

  it('makes later claims and verdicts public from the start, and can be undone', async () => {
    const ledger = await ledgerFor(alice)
    valueOf(await setVisibility(tools, alice, { ledgerId: ledger.recordId, visibility: 'public' }))
    const { claimId } = await claimIn(alice, ledger.recordId)
    valueOf(await recordVerdict(tools, alice, { claimId, status: 'skipped' }))
    expect(room.all<ClaimData>('claims')[0].data.visibility).toBe('public')
    expect(room.all<VerdictData>('verdicts')[0].data.visibility).toBe('public')

    valueOf(await setVisibility(tools, alice, { ledgerId: ledger.recordId, visibility: 'private' }))
    for (const collection of ['ledgers', 'claims', 'verdicts']) {
      expect(room.all<{ visibility: string }>(collection).map((row) => row.data.visibility)).toEqual(['private'])
    }
  })

  it('is harmless to repeat', async () => {
    const ledger = await ledgerFor(alice)
    await claimIn(alice, ledger.recordId)
    valueOf(await setVisibility(tools, alice, { ledgerId: ledger.recordId, visibility: 'public' }))
    expect(
      valueOf(await setVisibility(tools, alice, { ledgerId: ledger.recordId, visibility: 'public' })),
    ).toEqual({ visibility: 'public', updated: 0, done: true })
  })

  it('works through a large ledger in batches until it reports done', async () => {
    const ledger = await ledgerFor(alice)
    for (let n = 0; n < 130; n += 1) await claimIn(alice, ledger.recordId, `Claim ${n}`)

    const input = { ledgerId: ledger.recordId, visibility: 'public' }
    const first = valueOf(await setVisibility(tools, alice, input))
    expect(first.done).toBe(false)

    let calls = 1
    let last = first
    while (!last.done && calls < 10) {
      last = valueOf(await setVisibility(tools, alice, input))
      calls += 1
    }
    expect(last.done).toBe(true)
    expect(calls).toBe(3)
    expect(room.all<ClaimData>('claims').every((claim) => claim.data.visibility === 'public')).toBe(true)
  })

  it("leaves the owner's other ledgers alone", async () => {
    const shown = await ledgerFor(alice, 'Shown')
    const hidden = await ledgerFor(alice, 'Hidden')
    await claimIn(alice, hidden.recordId, 'Stays private')
    valueOf(await setVisibility(tools, alice, { ledgerId: shown.recordId, visibility: 'public' }))
    expect(room.all<ClaimData>('claims')[0].data.visibility).toBe('private')
    expect(valueOf(await ownedLedger(tools, alice, hidden.recordId)).data.visibility).toBe('private')
  })

  it("cannot be used on someone else's ledger", async () => {
    const hers = await ledgerFor(alice)
    expect(
      await setVisibility(tools, bob, { ledgerId: hers.recordId, visibility: 'public' }),
    ).toMatchObject({ ok: false, code: 'not_found' })
    expect(valueOf(await ownedLedger(tools, alice, hers.recordId)).data.visibility).toBe('private')
  })
})

describe('deleteLedger', () => {
  it('removes the ledger with its claims and verdicts, and nothing else', async () => {
    const doomed = await ledgerFor(alice, 'Doomed')
    const kept = await ledgerFor(alice, 'Kept')
    const his = await ledgerFor(bob, 'His')
    for (const ledger of [doomed, kept, his]) {
      const keeper = ledger === his ? bob : alice
      const { claimId } = await claimIn(keeper, ledger.recordId, `A claim in ${ledger.data.name}`)
      valueOf(await recordVerdict(tools, keeper, { claimId, status: 'verified', note: 'Checked by hand' }))
    }

    const result = valueOf(await deleteLedger(tools, alice, { ledgerId: doomed.recordId }))
    expect(result).toEqual({ deleted: 3, done: true })

    expect(room.all<LedgerData>('ledgers').map((ledger) => ledger.data.name).sort()).toEqual(['His', 'Kept'])
    expect(room.all<ClaimData>('claims').map((claim) => claim.data.statement).sort()).toEqual([
      'A claim in His',
      'A claim in Kept',
    ])
    expect(room.all('verdicts')).toHaveLength(2)
  })

  it('removes the ledger row last, so an interrupted deletion can be run again', async () => {
    const ledger = await ledgerFor(alice)
    const { claimId } = await claimIn(alice, ledger.recordId)
    valueOf(await recordVerdict(tools, alice, { claimId, status: 'skipped' }))
    valueOf(await deleteLedger(tools, alice, { ledgerId: ledger.recordId }))
    expect(room.removed.map((entry) => entry.split('/')[0])).toEqual(['verdicts', 'claims', 'ledgers'])
  })

  it("cannot be used on someone else's ledger, and looks the same as a missing one", async () => {
    const hers = await ledgerFor(alice)
    await claimIn(alice, hers.recordId)
    const stranger = await deleteLedger(tools, bob, { ledgerId: hers.recordId })
    const missing = await deleteLedger(tools, bob, { ledgerId: 'no_such_ledger' })
    expect(stranger).toMatchObject({ ok: false, code: 'not_found' })
    expect(stranger).toEqual(missing)
    expect(room.removed).toEqual([])
    expect(room.all('claims')).toHaveLength(1)
  })

  it('frees a place under the ledger limit', async () => {
    const ledgers = []
    for (let n = 0; n < LIMITS.ledgersPerOwner; n += 1) ledgers.push(await ledgerFor(alice, `Ledger ${n}`))
    valueOf(await deleteLedger(tools, alice, { ledgerId: ledgers[0].recordId }))
    expect((await createLedger(tools, alice, { name: 'Room for one more' })).ok).toBe(true)
  })

  it('refuses anything but a ledger id', async () => {
    const ledger = await ledgerFor(alice)
    expect(
      await deleteLedger(tools, alice, { ledgerId: ledger.recordId, claimId: 'just-this-one' }),
    ).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(room.all('ledgers')).toHaveLength(1)
  })
})

describe('listClaims', () => {
  it('shows an agent what a person ruled, and why, with unchecked claims first', async () => {
    const ledger = await ledgerFor(alice)
    const first = await claimIn(alice, ledger.recordId, 'The migration is reversible')
    await claimIn(alice, ledger.recordId, 'All unit tests pass')
    valueOf(
      await recordVerdict(tools, alice, {
        claimId: first.claimId,
        status: 'wrong',
        note: 'The down migration drops a column',
      }),
    )

    const row = valueOf(await ownedLedger(tools, alice, ledger.recordId))
    const listed = valueOf(await listClaims(tools, alice, row, undefined))
    expect(listed).toMatchObject({ ledger: 'checkout-rewrite', total: 2, shown: 2 })
    expect(listed.claims.map((claim) => [claim.claim, claim.status, claim.note])).toEqual([
      ['All unit tests pass', 'new', ''],
      ['The migration is reversible', 'wrong', 'The down migration drops a column'],
    ])

    const wrong = valueOf(await listClaims(tools, alice, row, 'wrong'))
    expect(wrong.claims.map((claim) => claim.id)).toEqual([first.claimId])
  })

  it("refuses to list someone else's ledger", async () => {
    const hers = await ledgerFor(alice)
    expect(await listClaims(tools, bob, hers, undefined)).toMatchObject({ ok: false, code: 'not_found' })
  })
})

describe('the ledger is append-only', () => {
  it('never asks the room to change or remove a claim or a verdict while the ledger lives', async () => {
    const ledger = await ledgerFor(alice)
    const { claimId } = await claimIn(alice, ledger.recordId)
    valueOf(await recordVerdict(tools, alice, { claimId, status: 'verified', note: 'Checked by hand' }))
    valueOf(await recordVerdict(tools, alice, { claimId, status: 'wrong', note: 'Checked again, it fails' }))
    valueOf(await setVisibility(tools, alice, { ledgerId: ledger.recordId, visibility: 'public' }))
    valueOf(await setVisibility(tools, alice, { ledgerId: ledger.recordId, visibility: 'private' }))

    expect(room.refused).toEqual([])
    expect(room.removed).toEqual([])
    expect(room.all<ClaimData>('claims')[0].data).toMatchObject({
      statement: 'All unit tests pass',
      check: 'Run npm run test:unit',
      source: 'agent',
    })
    expect(room.all<VerdictData>('verdicts').map((verdict) => verdict.data.note)).toEqual([
      'Checked by hand',
      'Checked again, it fails',
    ])
  })

  it('is backed by a room that refuses such a change if code ever tried', async () => {
    const ledger = await ledgerFor(alice)
    const { claimId } = await claimIn(alice, ledger.recordId)
    const attempt = await room.tools.update('claims', claimId, { statement: 'Rewritten after the fact' })
    expect(attempt.success).toBe(false)
    expect(room.all<ClaimData>('claims')[0].data.statement).toBe('All unit tests pass')
  })

  it('keeps the ledger a claim belongs to and who owns it fixed', async () => {
    const hers = await ledgerFor(alice)
    const { claimId } = await claimIn(alice, hers.recordId)
    for (const patch of [{ ownerId: bob.id }, { ledgerId: 'another' }, { source: 'manual' }]) {
      expect((await room.tools.update('claims', claimId, patch)).success).toBe(false)
    }
    expect(room.all<LedgerData>('ledgers')[0].data.ownerId).toBe(alice.id)
  })
})
