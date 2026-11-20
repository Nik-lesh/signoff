/**
 * Every write to a ledger, a claim or a verdict happens in this file.
 *
 * The `tools` passed in run with per-record RBAC turned off (see the trust
 * model at the top of action-routes.ts), so authorization is this file's job.
 * The rule is the same everywhere: load the ledger, compare its `ownerId`
 * with the verified caller, and stop if they differ. A caller who does not
 * own a ledger gets the same "not found" as for a ledger that does not exist,
 * so ids cannot be probed.
 *
 * Two doors lead here, and they are deliberately different:
 *   - src/actions/index.ts   a signed-in person in the browser (session token)
 *   - src/ai/tools.ts        a coding agent (agent-scoped token)
 * Only the first door has a way to record a verdict.
 *
 * Nothing in this file changes what a claim or a verdict says, or removes one
 * on its own. The one update they ever receive is `visibility`, when the
 * owner publishes or unpublishes the whole ledger, and the one way they are
 * removed is `deleteLedger`, which takes the whole ledger with them.
 */

import type { ActionTools } from 'deepspace/worker'
import {
  LIMITS,
  inReviewOrder,
  slugify,
  toClaimViews,
  type ClaimData,
  type ClaimSource,
  type ClaimStatus,
  type LedgerData,
  type Row,
  type Stakes,
  type VerdictData,
  type Visibility,
} from '../lib/ledger'
import {
  createLedgerInput,
  deleteLedgerInput,
  firstIssue,
  recordVerdictInput,
  setVisibilityInput,
} from '../lib/validation'

export type ServiceErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'limit_reached'
  | 'unavailable'

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ServiceErrorCode; message: string }

/** The verified caller. `id` always comes from a checked token, never from input. */
export interface Caller {
  id: string
}

const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value })
const fail = (code: ServiceErrorCode, message: string): ServiceResult<never> => ({
  ok: false,
  code,
  message,
})

const UNAVAILABLE = 'The ledger store did not answer. Try again in a moment.'
const NO_SUCH_LEDGER = 'No ledger with that id or slug belongs to you.'
const NO_SUCH_CLAIM = 'No claim with that id belongs to you.'
const NO_SUCH_EARLIER_CLAIM =
  'follows must be the id of an earlier claim in the same ledger. Call list_claims to see the ids.'

/** Rows changed per call when a ledger is published or unpublished. */
const VISIBILITY_BATCH = 60

/** Rows removed per collection per call when a ledger is deleted (the platform's maximum). */
const DELETE_BATCH = 500

type LedgerRow = Row<LedgerData>

async function displayName(tools: ActionTools, userId: string): Promise<string> {
  const user = await tools.get<{ name?: string }>('users', userId)
  const name = user.success ? user.data.record.data.name : undefined
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, LIMITS.personName) : 'Someone'
}

async function ledgersOf(tools: ActionTools, caller: Caller): Promise<ServiceResult<LedgerRow[]>> {
  const result = await tools.query<LedgerData>('ledgers', {
    where: { ownerId: caller.id },
    orderBy: 'createdAt',
    orderDir: 'asc',
    limit: LIMITS.ledgersPerOwner + 1,
  })
  if (!result.success) return fail('unavailable', UNAVAILABLE)
  return ok(result.data.records)
}

/** Load a ledger by id and prove the caller owns it. */
export async function ownedLedger(
  tools: ActionTools,
  caller: Caller,
  ledgerId: string,
): Promise<ServiceResult<LedgerRow>> {
  const result = await tools.get<LedgerData>('ledgers', ledgerId)
  if (!result.success || result.data.record.data.ownerId !== caller.id) {
    return fail('not_found', NO_SUCH_LEDGER)
  }
  return ok(result.data.record)
}

/**
 * Find the caller's ledger by slug. Agents name ledgers by slug, and may leave
 * it out when there is only one to choose from.
 */
export async function ownedLedgerBySlug(
  tools: ActionTools,
  caller: Caller,
  slug: string | undefined,
): Promise<ServiceResult<LedgerRow>> {
  const mine = await ledgersOf(tools, caller)
  if (!mine.ok) return mine
  if (mine.value.length === 0) {
    return fail('not_found', 'You have no ledgers yet. Sign in to Signoff in a browser and create one first.')
  }
  if (slug) {
    const match = mine.value.find((ledger) => ledger.data.slug === slug)
    return match ? ok(match) : fail('not_found', NO_SUCH_LEDGER)
  }
  if (mine.value.length === 1) return ok(mine.value[0])
  const slugs = mine.value.map((ledger) => ledger.data.slug).join(', ')
  return fail('invalid_input', `You have ${mine.value.length} ledgers (${slugs}). Pass "ledger" to choose one.`)
}

export async function createLedger(
  tools: ActionTools,
  caller: Caller,
  input: unknown,
): Promise<ServiceResult<{ ledgerId: string; slug: string }>> {
  const parsed = createLedgerInput.safeParse(input)
  if (!parsed.success) return fail('invalid_input', firstIssue(parsed.error))

  const mine = await ledgersOf(tools, caller)
  if (!mine.ok) return mine
  if (mine.value.length >= LIMITS.ledgersPerOwner) {
    return fail('limit_reached', `You can keep up to ${LIMITS.ledgersPerOwner} ledgers.`)
  }

  const taken = new Set(mine.value.map((ledger) => ledger.data.slug))
  const base = slugify(parsed.data.name)
  let slug = base
  for (let n = 2; taken.has(slug); n += 1) {
    const suffix = `-${n}`
    slug = `${base.slice(0, LIMITS.slug - suffix.length)}${suffix}`
  }

  const created = await tools.create<LedgerData>('ledgers', {
    name: parsed.data.name,
    slug,
    repoUrl: parsed.data.repoUrl ?? '',
    ownerId: caller.id,
    ownerName: await displayName(tools, caller.id),
    visibility: 'private',
    claimCount: 0,
  })
  if (!created.success) return fail('unavailable', UNAVAILABLE)
  return ok({ ledgerId: created.data.recordId, slug })
}

export interface ClaimFields {
  statement: string
  check: string
  stakes?: Stakes
  ref?: string
  agent?: string
  /** Id of an earlier claim in the same ledger that this one follows up on. */
  follows?: string
}

/**
 * Add a claim to a ledger the caller has already been shown to own (pass the
 * row from `ownedLedger` or `ownedLedgerBySlug`). `source` is decided by which
 * door the request came through, never by the request itself.
 *
 * `follows` links the claim to an earlier one, typically the fix for a claim
 * a person marked wrong. The earlier claim has to be the caller's and in this
 * same ledger. Any other id gets one answer, so the link cannot be used to
 * find out whether a claim exists somewhere else.
 */
export async function fileClaim(
  tools: ActionTools,
  caller: Caller,
  ledger: LedgerRow,
  fields: ClaimFields,
  source: ClaimSource,
): Promise<ServiceResult<{ claimId: string; ledgerId: string; slug: string }>> {
  if (ledger.data.ownerId !== caller.id) return fail('not_found', NO_SUCH_LEDGER)

  const count = Number(ledger.data.claimCount ?? 0)
  if (count >= LIMITS.claimsPerLedger) {
    return fail('limit_reached', `This ledger is full (${LIMITS.claimsPerLedger} claims). Start a new ledger.`)
  }

  if (fields.follows) {
    const earlier = await tools.get<ClaimData>('claims', fields.follows)
    const found = earlier.success ? earlier.data.record.data : null
    if (!found || found.ownerId !== caller.id || found.ledgerId !== ledger.recordId) {
      return fail('invalid_input', NO_SUCH_EARLIER_CLAIM)
    }
  }

  const created = await tools.create<ClaimData>('claims', {
    ledgerId: ledger.recordId,
    ownerId: caller.id,
    visibility: ledger.data.visibility,
    statement: fields.statement,
    check: fields.check,
    stakes: fields.stakes ?? 'medium',
    ref: fields.ref ?? '',
    agent: fields.agent ?? '',
    source,
    ...(fields.follows ? { follows: fields.follows } : {}),
  })
  if (!created.success) return fail('unavailable', UNAVAILABLE)

  // A counter, not a ledger entry: two claims filed in the same instant can
  // leave it one short, which only makes the cap slightly generous.
  await tools.update<LedgerData>('ledgers', ledger.recordId, { claimCount: count + 1 })

  return ok({ claimId: created.data.recordId, ledgerId: ledger.recordId, slug: ledger.data.slug })
}

/** Record a person's verdict on a claim. Reached only through a server action. */
export async function recordVerdict(
  tools: ActionTools,
  caller: Caller,
  input: unknown,
): Promise<ServiceResult<{ verdictId: string; claimId: string }>> {
  const parsed = recordVerdictInput.safeParse(input)
  if (!parsed.success) return fail('invalid_input', firstIssue(parsed.error))

  const claim = await tools.get<ClaimData>('claims', parsed.data.claimId)
  if (!claim.success || claim.data.record.data.ownerId !== caller.id) {
    return fail('not_found', NO_SUCH_CLAIM)
  }
  const ledger = await ownedLedger(tools, caller, claim.data.record.data.ledgerId)
  if (!ledger.ok) return fail('not_found', NO_SUCH_CLAIM)

  const earlier = await tools.query<VerdictData>('verdicts', {
    where: { claimId: claim.data.record.recordId },
    limit: LIMITS.verdictsPerClaim,
  })
  if (!earlier.success) return fail('unavailable', UNAVAILABLE)
  if (earlier.data.records.length >= LIMITS.verdictsPerClaim) {
    return fail(
      'limit_reached',
      `This claim already has ${LIMITS.verdictsPerClaim} verdicts, which is the most a claim can carry.`,
    )
  }

  const created = await tools.create<VerdictData>('verdicts', {
    claimId: claim.data.record.recordId,
    ledgerId: ledger.value.recordId,
    ownerId: caller.id,
    visibility: ledger.value.data.visibility,
    status: parsed.data.status,
    note: parsed.data.note ?? '',
    byName: await displayName(tools, caller.id),
  })
  if (!created.success) return fail('unavailable', UNAVAILABLE)
  return ok({ verdictId: created.data.recordId, claimId: claim.data.record.recordId })
}

/**
 * Publish or unpublish a ledger.
 *
 * Read access is decided row by row, so the ledger's claims and verdicts each
 * carry their own `visibility`. The ledger is switched first, which makes any
 * claim filed from now on inherit the new value; existing rows are then
 * switched in batches. One call changes at most VISIBILITY_BATCH rows per
 * collection and reports `done: false` if more remain, so the caller repeats
 * the same call until it is done. Repeating is always safe.
 */
export async function setVisibility(
  tools: ActionTools,
  caller: Caller,
  input: unknown,
): Promise<ServiceResult<{ visibility: Visibility; updated: number; done: boolean }>> {
  const parsed = setVisibilityInput.safeParse(input)
  if (!parsed.success) return fail('invalid_input', firstIssue(parsed.error))
  const target = parsed.data.visibility
  const stale: Visibility = target === 'public' ? 'private' : 'public'

  const ledger = await ownedLedger(tools, caller, parsed.data.ledgerId)
  if (!ledger.ok) return ledger

  if (ledger.value.data.visibility !== target) {
    const switched = await tools.update<LedgerData>('ledgers', ledger.value.recordId, {
      visibility: target,
    })
    if (!switched.success) return fail('unavailable', UNAVAILABLE)
  }

  let updated = 0
  let done = true
  for (const collection of ['claims', 'verdicts'] as const) {
    const rows = await tools.query<{ visibility: Visibility }>(collection, {
      where: { ledgerId: ledger.value.recordId, visibility: stale },
      limit: VISIBILITY_BATCH,
    })
    if (!rows.success) return fail('unavailable', UNAVAILABLE)
    const results = await Promise.all(
      rows.data.records.map((row) => tools.update(collection, row.recordId, { visibility: target })),
    )
    if (results.some((result) => !result.success)) return fail('unavailable', UNAVAILABLE)
    updated += results.length
    if (rows.data.records.length === VISIBILITY_BATCH) done = false
  }

  return ok({ visibility: target, updated, done })
}

/**
 * Delete a ledger with every claim and verdict in it.
 *
 * This is the only way anything leaves Signoff, and it is all or nothing: a
 * keeper can remove a ledger, never trim one. It is also the way out when
 * something that should not have been filed gets past the credential screen.
 *
 * Verdicts go first, then claims, and the ledger row last, so a deletion that
 * stops halfway leaves a ledger its keeper can still open and delete again.
 * One call removes at most DELETE_BATCH rows per collection and reports
 * `done: false` if more remain, so the caller repeats it until it is done.
 */
export async function deleteLedger(
  tools: ActionTools,
  caller: Caller,
  input: unknown,
): Promise<ServiceResult<{ deleted: number; done: boolean }>> {
  const parsed = deleteLedgerInput.safeParse(input)
  if (!parsed.success) return fail('invalid_input', firstIssue(parsed.error))

  const ledger = await ownedLedger(tools, caller, parsed.data.ledgerId)
  if (!ledger.ok) return ledger

  let deleted = 0
  for (const collection of ['verdicts', 'claims'] as const) {
    // These tools ignore who owns a row, so the filter names the owner too.
    const removed = await tools.deleteWhere(
      collection,
      { ledgerId: ledger.value.recordId, ownerId: caller.id },
      DELETE_BATCH,
    )
    if (!removed.success) return fail('unavailable', UNAVAILABLE)
    deleted += removed.data.deleted
    if (removed.data.deleted >= DELETE_BATCH) return ok({ deleted, done: false })
  }

  const gone = await tools.remove('ledgers', ledger.value.recordId)
  if (!gone.success) return fail('unavailable', UNAVAILABLE)
  return ok({ deleted: deleted + 1, done: true })
}

export interface LedgerSummary {
  slug: string
  name: string
  visibility: Visibility
  claims: number
}

export async function listLedgers(
  tools: ActionTools,
  caller: Caller,
): Promise<ServiceResult<LedgerSummary[]>> {
  const mine = await ledgersOf(tools, caller)
  if (!mine.ok) return mine
  return ok(
    mine.value.map((ledger) => ({
      slug: ledger.data.slug,
      name: ledger.data.name,
      visibility: ledger.data.visibility,
      claims: Number(ledger.data.claimCount ?? 0),
    })),
  )
}

export interface ClaimSummary {
  id: string
  claim: string
  check: string
  stakes: Stakes
  status: ClaimStatus
  /** What the person wrote with their latest verdict; empty while the claim is new. */
  note: string
  filed: string
  /** Id of the earlier claim this one follows up on, when it has one. */
  follows?: string
  /**
   * Later claims that follow up on this one, with where each stands. A claim
   * marked wrong stays wrong after it is fixed, so this is how an agent tells
   * one that still needs a fix from one that already has a fix on file.
   */
  followedBy?: Array<{ id: string; status: ClaimStatus }>
}

/** How many claims one `list_claims` call returns. Keeps the tool result small for the agent. */
const LIST_CLAIMS_PAGE = 100

/**
 * The agent's view of a ledger it files into: each claim with its current
 * status and the person's note. This is how an agent learns that a claim was
 * marked wrong, and why.
 */
export async function listClaims(
  tools: ActionTools,
  caller: Caller,
  ledger: LedgerRow,
  status: ClaimStatus | undefined,
): Promise<ServiceResult<{ ledger: string; total: number; shown: number; claims: ClaimSummary[] }>> {
  if (ledger.data.ownerId !== caller.id) return fail('not_found', NO_SUCH_LEDGER)

  const where = { ledgerId: ledger.recordId }
  const [claims, verdicts] = await Promise.all([
    tools.query<ClaimData>('claims', { where, limit: LIMITS.claimsPerLedger }),
    tools.query<VerdictData>('verdicts', { where, limit: LIMITS.claimsPerLedger * 4 }),
  ])
  if (!claims.success || !verdicts.success) return fail('unavailable', UNAVAILABLE)

  const all = inReviewOrder(toClaimViews(claims.data.records, verdicts.data.records))
  const statusOf = new Map(all.map((claim) => [claim.id, claim.status]))
  const matching = status ? all.filter((claim) => claim.status === status) : all
  const page = matching.slice(0, LIST_CLAIMS_PAGE)

  return ok({
    ledger: ledger.data.slug,
    total: matching.length,
    shown: page.length,
    claims: page.map((claim) => ({
      id: claim.id,
      claim: claim.statement,
      check: claim.check,
      stakes: claim.stakes,
      status: claim.status,
      note: claim.latest?.note ?? '',
      filed: new Date(claim.filedAt).toISOString(),
      ...(claim.follows ? { follows: claim.follows } : {}),
      ...(claim.followedBy.length > 0
        ? { followedBy: claim.followedBy.map((id) => ({ id, status: statusOf.get(id) ?? 'new' })) }
        : {}),
    })),
  })
}
