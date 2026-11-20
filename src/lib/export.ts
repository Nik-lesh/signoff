/**
 * Turns a ledger into a Markdown summary that keeps four things apart: what a
 * person found wrong, which later claims follow up on earlier ones, what a
 * person verified and how, and what nobody verified.
 *
 * Deterministic on purpose. The summary is built from the records alone, so
 * it says exactly what the ledger says and nothing else.
 */

import {
  FOLLOWED_STATUS,
  byFiling,
  formatDuration,
  linksOf,
  numberClaims,
  scoreOf,
  tallySentence,
  type ClaimLinks,
  type ClaimStatus,
  type ClaimView,
  type LedgerData,
} from './ledger'

const SECTIONS: ReadonlyArray<{ status: ClaimStatus; title: string; empty: string }> = [
  { status: 'wrong', title: 'Wrong', empty: 'No claim was found to be wrong.' },
  { status: 'verified', title: 'Verified', empty: 'Nothing has been verified yet.' },
  { status: 'skipped', title: 'Not checked', empty: 'Nothing was knowingly left unchecked.' },
  { status: 'new', title: 'Waiting for a verdict', empty: 'No claims are waiting.' },
]

/** Keep user text on one line and stop it from being read as Markdown structure. */
function inline(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/([\\`*_[\]<>|])/g, '\\$1')
}

function isoDate(ms: number): string {
  return ms > 0 ? new Date(ms).toISOString().slice(0, 10) : 'unknown date'
}

function claimLine(claim: ClaimView, number: number, links: ClaimLinks): string {
  const parts = [`- **No. ${number}: ${inline(claim.statement)}**`]
  const filed =
    claim.source === 'manual'
      ? `Entered by hand on ${isoDate(claim.filedAt)}`
      : `Filed ${isoDate(claim.filedAt)} by ${inline(claim.agent || 'an agent')}`
  parts.push(`  - ${filed}, stakes: ${claim.stakes}.`)
  if (links.follows) {
    parts.push(
      `  - Follows No. ${links.follows.number}, ${FOLLOWED_STATUS[links.follows.status]}.`,
    )
  }
  if (links.followedBy.length > 0) {
    parts.push(`  - Followed by ${links.followedBy.map((link) => `No. ${link.number}`).join(', ')}.`)
  }
  if (claim.ref) parts.push(`  - Reference: ${inline(claim.ref)}`)
  if (claim.latest) {
    const by = claim.latest.byName ? ` by ${inline(claim.latest.byName)}` : ''
    const after =
      claim.secondsToFirstVerdict === null
        ? ''
        : `, first verdict ${formatDuration(claim.secondsToFirstVerdict)} after filing`
    parts.push(`  - Verdict ${isoDate(claim.latest.at)}${by}${after}.`)
    if (claim.latest.note) parts.push(`  - What was done: ${inline(claim.latest.note)}`)
    if (claim.verdicts.length > 1) {
      const trail = claim.verdicts.map((verdict) => verdict.status).join(' → ')
      parts.push(`  - Verdict history: ${trail}`)
    }
  } else {
    parts.push(`  - How to check: ${inline(claim.check)}`)
  }
  return parts.join('\n')
}

/**
 * The follow-up section: one line per claim that follows an earlier one, with
 * where both stand, then the claims marked wrong that nothing has answered.
 */
function followUpSection(
  claims: ReadonlyArray<ClaimView>,
  numbers: ReadonlyMap<string, number>,
  byId: ReadonlyMap<string, ClaimView>,
): string[] {
  const inFilingOrder = claims.slice().sort(byFiling)
  const no = (claim: ClaimView) => `No. ${numbers.get(claim.id) ?? 0}`

  const lines: string[] = []
  let followUps = 0
  for (const claim of inFilingOrder) {
    const earlier = claim.follows ? byId.get(claim.follows) : undefined
    if (!earlier) continue
    followUps += 1
    lines.push(
      `- ${no(claim)} follows ${no(earlier)}, ${FOLLOWED_STATUS[earlier.status]}. ` +
        `${no(claim)} is ${FOLLOWED_STATUS[claim.status]}.`,
    )
  }
  const unanswered = inFilingOrder.filter(
    (claim) => claim.status === 'wrong' && claim.followedBy.length === 0,
  )
  if (unanswered.length > 0) {
    lines.push(`- Marked wrong with no follow-up: ${unanswered.map(no).join(', ')}.`)
  }
  if (lines.length === 0) lines.push('No claim follows up on another.')
  return [`## Follow-ups (${followUps})`, '', ...lines, '']
}

export function ledgerToMarkdown(
  ledger: Pick<LedgerData, 'name' | 'repoUrl' | 'ownerName'>,
  claims: ReadonlyArray<ClaimView>,
  nowMs: number,
): string {
  const score = scoreOf(claims)
  const numbers = numberClaims(claims)
  const byId = new Map(claims.map((claim) => [claim.id, claim]))
  const lines: string[] = [`# Signoff ledger: ${inline(ledger.name)}`, '']
  if (ledger.repoUrl) lines.push(`Repository: ${ledger.repoUrl}`, '')
  lines.push(
    `Exported ${isoDate(nowMs)}${ledger.ownerName ? ` from ${inline(ledger.ownerName)}'s ledger` : ''}.`,
    '',
    tallySentence(score),
    '',
  )

  for (const section of SECTIONS) {
    const matching = claims.filter((claim) => claim.status === section.status).sort(byFiling)
    lines.push(`## ${section.title} (${matching.length})`, '')
    if (matching.length === 0) {
      lines.push(section.empty, '')
    } else {
      for (const claim of matching) {
        lines.push(claimLine(claim, numbers.get(claim.id) ?? 0, linksOf(claim, byId, numbers)))
      }
      lines.push('')
    }
    // What was wrong is followed at once by what was done about it.
    if (section.status === 'wrong') lines.push(...followUpSection(claims, numbers, byId))
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
