/**
 * The ledger's domain logic. Pure functions, no DeepSpace or React imports,
 * so the browser, the worker and the unit tests all share one definition of
 * "what state is this claim in" and "how much of this ledger was checked".
 *
 * Verdicts are append-only rows. A claim's status is never stored: it is the
 * status of its newest verdict, or 'new' when it has none. Changing your mind
 * adds a verdict, and the older one stays visible in the claim's history.
 */

export const VERDICT_STATUSES = ['verified', 'wrong', 'skipped'] as const
export type VerdictStatus = (typeof VERDICT_STATUSES)[number]

/** 'new' means no person has ruled on the claim yet. */
export type ClaimStatus = 'new' | VerdictStatus

export const STAKES = ['low', 'medium', 'high'] as const
export type Stakes = (typeof STAKES)[number]

export type ClaimSource = 'agent' | 'manual'
export type Visibility = 'private' | 'public'

/** Field and collection caps. The schema enforces the text lengths again at the record room. */
export const LIMITS = {
  ledgerName: 60,
  slug: 40,
  repoUrl: 200,
  personName: 80,
  statement: 280,
  check: 500,
  ref: 200,
  agentName: 40,
  note: 1000,
  /** A verified or wrong verdict has to say what the person did. */
  noteMinWhenChecked: 8,
  ledgersPerOwner: 20,
  claimsPerLedger: 500,
  /** Enough for any honest change of mind, and it keeps a ledger's size bounded. */
  verdictsPerClaim: 20,
} as const

/**
 * Record shapes are `type` aliases, not interfaces: the SDK's record tools take
 * `Record<string, unknown>`, which an interface does not satisfy.
 */
export type LedgerData = {
  name: string
  slug: string
  repoUrl?: string
  ownerId: string
  ownerName?: string
  visibility: Visibility
  claimCount?: number
}

export type ClaimData = {
  ledgerId: string
  ownerId: string
  visibility: Visibility
  statement: string
  check: string
  stakes: Stakes
  ref?: string
  agent?: string
  source: ClaimSource
  /** Id of an earlier claim in the same ledger that this one follows up on. */
  follows?: string
}

export type VerdictData = {
  claimId: string
  ledgerId: string
  ownerId: string
  visibility: Visibility
  status: VerdictStatus
  note?: string
  byName?: string
}

/** A record as both `useQuery` and the server tools return it. */
export interface Row<T> {
  recordId: string
  data: T
  createdAt: string
}

export interface VerdictView {
  id: string
  status: VerdictStatus
  note: string
  byName: string
  /** Server time the verdict was recorded, in epoch ms. */
  at: number
}

export interface ClaimView {
  id: string
  statement: string
  check: string
  stakes: Stakes
  ref: string
  agent: string
  source: ClaimSource
  /** Server time the claim was filed, in epoch ms. */
  filedAt: number
  status: ClaimStatus
  /** Oldest first. The last entry decides `status`. */
  verdicts: VerdictView[]
  latest: VerdictView | null
  /** Seconds between filing and the first verdict; null while the claim is new. */
  secondsToFirstVerdict: number | null
  /** Id of the earlier claim this one follows up on, or '' when there is none in this ledger. */
  follows: string
  /** Ids of later claims that follow up on this one, in filing order. */
  followedBy: string[]
}

/** A claim's links to its neighbours, resolved to the numbers the page shows. */
export interface ClaimLinks {
  follows: { id: string; number: number; status: ClaimStatus } | null
  followedBy: Array<{ id: string; number: number }>
}

export interface Score {
  total: number
  new: number
  verified: number
  wrong: number
  skipped: number
  /** Claims a person actually checked: verified plus wrong. */
  checked: number
  /** `checked / total` as a whole percentage, 0 for an empty ledger. */
  checkedPercent: number
  /** Claims filed as high stakes. */
  high: number
  /** High-stakes claims nobody has checked: still waiting, or marked "not checked". */
  highUnchecked: number
}

/** The record room stores `createdAt` as an ISO string; tolerate epoch numbers too. */
export function toEpochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === 'string' && value !== '') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export function isVerdictStatus(value: unknown): value is VerdictStatus {
  return typeof value === 'string' && (VERDICT_STATUSES as readonly string[]).includes(value)
}

export function isStakes(value: unknown): value is Stakes {
  return typeof value === 'string' && (STAKES as readonly string[]).includes(value)
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * Join claims with their verdicts.
 *
 * Rows arrive from the network, so nothing here trusts their shape: a verdict
 * with an unknown status or no matching claim is dropped rather than rendered.
 * Ties on timestamp fall back to record id so every client picks the same
 * "latest" verdict.
 */
export function toClaimViews(
  claims: ReadonlyArray<Row<Partial<ClaimData>>>,
  verdicts: ReadonlyArray<Row<Partial<VerdictData>>>,
): ClaimView[] {
  const byClaim = new Map<string, VerdictView[]>()
  for (const row of verdicts) {
    const claimId = text(row.data?.claimId)
    if (!claimId || !isVerdictStatus(row.data?.status)) continue
    const list = byClaim.get(claimId) ?? []
    list.push({
      id: row.recordId,
      status: row.data.status,
      note: text(row.data.note),
      byName: text(row.data.byName),
      at: toEpochMs(row.createdAt),
    })
    byClaim.set(claimId, list)
  }

  const views: ClaimView[] = claims.map((row) => {
    const history = (byClaim.get(row.recordId) ?? [])
      .slice()
      .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    const latest = history.length > 0 ? history[history.length - 1] : null
    const filedAt = toEpochMs(row.createdAt)
    return {
      id: row.recordId,
      statement: text(row.data?.statement),
      check: text(row.data?.check),
      stakes: isStakes(row.data?.stakes) ? row.data.stakes : 'medium',
      ref: text(row.data?.ref),
      agent: text(row.data?.agent),
      source: row.data?.source === 'manual' ? 'manual' : 'agent',
      filedAt,
      status: latest ? latest.status : 'new',
      verdicts: history,
      latest,
      secondsToFirstVerdict:
        history.length > 0 ? Math.max(0, Math.round((history[0].at - filedAt) / 1000)) : null,
      follows: text(row.data?.follows),
      followedBy: [],
    }
  })

  // A follow-up link counts only when its target is a different claim in this
  // same set. Anything else (a stale id, a claim pointing at itself) is dropped
  // here, so the page never draws a link that leads nowhere.
  const byId = new Map(views.map((view) => [view.id, view]))
  for (const view of views.slice().sort(byFiling)) {
    const earlier = view.follows && view.follows !== view.id ? byId.get(view.follows) : undefined
    if (earlier) earlier.followedBy.push(view.id)
    else view.follows = ''
  }
  return views
}

/** Filing order: oldest first, with the record id as a tie-break every client agrees on. */
export const byFiling = (
  a: Pick<ClaimView, 'id' | 'filedAt'>,
  b: Pick<ClaimView, 'id' | 'filedAt'>,
) => a.filedAt - b.filedAt || a.id.localeCompare(b.id)

/** Each claim's place in filing order, starting at 1: the "No. 5" on the page. */
export function numberClaims(
  claims: ReadonlyArray<Pick<ClaimView, 'id' | 'filedAt'>>,
): Map<string, number> {
  return new Map(
    claims
      .slice()
      .sort(byFiling)
      .map((claim, index) => [claim.id, index + 1]),
  )
}

/** Resolve one claim's follow-up links against the ledger it is shown in. */
export function linksOf(
  claim: Pick<ClaimView, 'follows' | 'followedBy'>,
  byId: ReadonlyMap<string, Pick<ClaimView, 'status'>>,
  numbers: ReadonlyMap<string, number>,
): ClaimLinks {
  const earlier = claim.follows ? byId.get(claim.follows) : undefined
  const number = numbers.get(claim.follows)
  return {
    follows:
      earlier && number !== undefined
        ? { id: claim.follows, number, status: earlier.status }
        : null,
    followedBy: claim.followedBy.flatMap((id) => {
      const place = numbers.get(id)
      return place === undefined ? [] : [{ id, number: place }]
    }),
  }
}

/** How a followed claim's state reads in a sentence: "Follows No. 5, marked wrong". */
export const FOLLOWED_STATUS: Record<ClaimStatus, string> = {
  new: 'still waiting',
  verified: 'verified',
  wrong: 'marked wrong',
  skipped: 'not checked',
}

export function scoreOf(claims: ReadonlyArray<Pick<ClaimView, 'status' | 'stakes'>>): Score {
  const score: Score = {
    total: claims.length,
    new: 0,
    verified: 0,
    wrong: 0,
    skipped: 0,
    checked: 0,
    checkedPercent: 0,
    high: 0,
    highUnchecked: 0,
  }
  for (const claim of claims) {
    score[claim.status] += 1
    if (claim.stakes !== 'high') continue
    score.high += 1
    if (claim.status === 'new' || claim.status === 'skipped') score.highUnchecked += 1
  }
  score.checked = score.verified + score.wrong
  score.checkedPercent = score.total === 0 ? 0 : Math.round((score.checked / score.total) * 100)
  return score
}

/**
 * What the percentage hides: whether the claims that matter most were checked.
 * Empty when the ledger has no high-stakes claims.
 */
export function stakesSentence(score: Pick<Score, 'high' | 'highUnchecked'>): string {
  if (score.high === 0) return ''
  if (score.highUnchecked === 0) {
    return score.high === 1
      ? 'The 1 high-stakes claim has been checked.'
      : `All ${score.high} high-stakes claims have been checked.`
  }
  if (score.high === 1) return 'The 1 high-stakes claim has not been checked.'
  const verb = score.highUnchecked === 1 ? 'has' : 'have'
  return `${score.highUnchecked} of the ${score.high} high-stakes claims ${verb} not been checked.`
}

/**
 * The ledger in one sentence, or two when it holds high-stakes claims. The
 * page header and the Markdown export both use it, so the two never describe
 * the same ledger differently.
 */
export function tallySentence(score: Score): string {
  const noun = score.total === 1 ? 'claim' : 'claims'
  const counts =
    `${score.total} ${noun}: ${score.verified} verified, ${score.wrong} wrong, ` +
    `${score.skipped} not checked, ${score.new} waiting. ` +
    `A person checked ${score.checkedPercent}% of them.`
  const stakes = stakesSentence(score)
  return stakes ? `${counts} ${stakes}` : counts
}

const STATUS_ORDER: Record<ClaimStatus, number> = { new: 0, wrong: 1, skipped: 2, verified: 3 }
const STAKES_ORDER: Record<Stakes, number> = { high: 0, medium: 1, low: 2 }

/**
 * Review order: what still needs a person comes first. New claims lead, the
 * riskiest of those on top and the oldest before the newest so nothing is
 * starved. Settled claims follow, most recently ruled first.
 */
export function inReviewOrder(claims: ReadonlyArray<ClaimView>): ClaimView[] {
  return claims.slice().sort((a, b) => {
    if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (a.status === 'new') {
      return (
        STAKES_ORDER[a.stakes] - STAKES_ORDER[b.stakes] ||
        a.filedAt - b.filedAt ||
        a.id.localeCompare(b.id)
      )
    }
    return (b.latest?.at ?? 0) - (a.latest?.at ?? 0) || a.id.localeCompare(b.id)
  })
}

/** "45s", "12m", "3h 5m", "2d 4h". Used for time-to-verdict. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest ? `${hours}h ${rest}m` : `${hours}h`
  }
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days}d ${restHours}h` : `${days}d`
}

/** Lowercase letters, digits and single dashes; never empty. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.slug)
    .replace(/-+$/g, '')
  return slug || 'ledger'
}
