/**
 * The presentational pieces of a ledger row. No data hooks and no network
 * imports, so the static landing page can show real-looking rows without
 * pulling the DeepSpace client into its bundle.
 *
 * Left of the double rule is what was claimed, set in the agent's typeface.
 * Right of it is what a person found, set in the person's typeface and ink.
 * Nothing an agent sends is ever rendered on the right.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  FOLLOWED_STATUS,
  formatDuration,
  type ClaimLinks,
  type ClaimView,
  type VerdictStatus,
  type VerdictView,
} from '@/lib/ledger'
import { exactTime, shortDate, timeAgo } from '@/lib/time'

export const STATUS_LABEL: Record<ClaimView['status'], string> = {
  new: 'Waiting',
  verified: 'Verified',
  wrong: 'Wrong',
  skipped: 'Not checked',
}

/** Blue ink for a signature, red pen for a correction, pencil for "did not check". */
export const TONE: Record<VerdictStatus, string> = {
  verified: 'text-ink',
  wrong: 'text-redpen',
  skipped: 'text-pencil',
}

interface RowFrameProps {
  claim: ClaimView
  titleId: string
  arrived?: boolean
  left: ReactNode
  right: ReactNode
}

export function RowFrame({ claim, titleId, arrived = false, left, right }: RowFrameProps) {
  return (
    <article
      id={rowAnchor(claim.id)}
      tabIndex={-1}
      aria-labelledby={titleId}
      data-testid="claim-row"
      data-status={claim.status}
      className={cn('ledger-row focus:outline-none', arrived && 'claim-arrived')}
    >
      <div className="min-w-0 px-4 py-5 sm:px-6">{left}</div>
      <div className="ledger-signoff min-w-0 px-4 py-5 sm:px-6">{right}</div>
    </article>
  )
}

/** The element id of a claim's row, so one row can point at another. */
export function rowAnchor(claimId: string): string {
  return `claim-${claimId}`
}

interface ClaimEntryProps {
  claim: ClaimView
  titleId: string
  /** Place in filing order, starting at 1. */
  number: number
  /**
   * The current time, for "5 min ago" on a live ledger. `null` prints the
   * filing date instead, in UTC: a static example must not claim to be recent.
   */
  now: number | null
  /** The claim this one follows up on, and the ones that follow it. */
  links?: ClaimLinks
  /** Bring another claim's row into view. Without it the numbers are plain text. */
  onJump?: (claimId: string) => void
}

export function ClaimEntry({ claim, titleId, number, now, links, onJump }: ClaimEntryProps) {
  const filed = now === null ? `on ${shortDate(claim.filedAt, 'utc')}` : timeAgo(claim.filedAt, now)

  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-4 text-[0.8rem] text-pencil">
        <span className="tabular-nums">No. {number}</span>
        {claim.stakes === 'high' && <span className="font-semibold text-print">High stakes</span>}
        {claim.stakes === 'low' && <span>Low stakes</span>}
        {links?.follows && (
          <span data-testid="claim-follows">
            Follows <ClaimNumber link={links.follows} onJump={onJump} />,{' '}
            {FOLLOWED_STATUS[links.follows.status]}
          </span>
        )}
        {links && links.followedBy.length > 0 && (
          <span data-testid="claim-followed-by">
            Followed by{' '}
            {links.followedBy.map((link, index) => (
              <span key={link.id}>
                {index > 0 && ', '}
                <ClaimNumber link={link} onJump={onJump} />
              </span>
            ))}
          </span>
        )}
      </p>

      <h3
        id={titleId}
        className={cn(
          'mt-1.5 break-words font-agent text-[0.92rem] font-medium leading-[1.6] text-print',
          claim.status === 'wrong' && 'claim-struck',
        )}
      >
        {claim.statement}
      </h3>

      <p className="mt-3 text-[0.8rem] text-pencil">How to check</p>
      <p className="mt-0.5 break-words font-agent text-[0.82rem] leading-[1.6] text-print">
        {claim.check}
      </p>

      <p className="mt-3 text-[0.8rem] leading-relaxed text-pencil">
        <span title={exactTime(claim.filedAt)}>
          {claim.source === 'manual'
            ? `Typed in by a person ${filed}.`
            : `Filed by ${claim.agent || 'an agent'} ${filed}.`}
        </span>
        {claim.ref && (
          <>
            {' '}
            Reference: <Reference value={claim.ref} />
          </>
        )}
      </p>
    </>
  )
}

/** "No. 5", as a button that brings that row into view when the sheet can do so. */
function ClaimNumber({
  link,
  onJump,
}: {
  link: { id: string; number: number }
  onJump?: (claimId: string) => void
}) {
  const label = `No. ${link.number}`
  if (!onJump) return <span className="tabular-nums">{label}</span>
  return (
    <button
      type="button"
      aria-label={`Go to claim ${label}`}
      onClick={() => onJump(link.id)}
      className="tabular-nums text-print underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  )
}

/** A reference is shown as a link only when it is a plain https address. */
function Reference({ value }: { value: string }) {
  if (/^https:\/\/[^\s<>"']+$/.test(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="font-agent text-print underline underline-offset-2 [overflow-wrap:anywhere] hover:text-ink"
      >
        {value}
      </a>
    )
  }
  return <span className="font-agent text-print [overflow-wrap:anywhere]">{value}</span>
}

/** The empty line where a signature will go. */
export function BlankSignoff() {
  return (
    <div data-testid="signoff-blank">
      <div className="signature-line" aria-hidden />
      <p className="mt-2 text-[0.8rem] text-pencil">No person has checked this yet.</p>
    </div>
  )
}

interface SignoffMarkProps {
  claim: ClaimView
  latest: VerdictView
  /** Present for the owner: opens the form to record a new verdict. */
  onRevise?: () => void
  /** Which zone dates are printed in. A static example uses UTC; see `shortDate`. */
  zone?: 'local' | 'utc'
}

export function SignoffMark({ claim, latest, onRevise, zone = 'local' }: SignoffMarkProps) {
  const tone = TONE[latest.status]
  const earlier = claim.verdicts.slice(0, -1)

  return (
    <div data-testid="signoff-mark">
      <p className={cn('text-[0.85rem] font-semibold', tone)}>{STATUS_LABEL[latest.status]}</p>

      {latest.note && (
        <p className={cn('mt-1.5 break-words font-person text-[0.95rem] leading-[1.55]', tone)}>
          {latest.note}
        </p>
      )}

      <div className="signature-line mt-3 flex items-end pb-1">
        <span className={cn('font-person text-[1.05rem] leading-none', tone)}>
          {latest.byName || 'Signed'}
        </span>
      </div>
      <p className="mt-1.5 text-[0.8rem] text-pencil">
        <span title={exactTime(latest.at)}>{shortDate(latest.at, zone)}</span>
        {claim.secondsToFirstVerdict !== null && (
          <>, first verdict {formatDuration(claim.secondsToFirstVerdict)} after filing</>
        )}
      </p>

      {earlier.length > 0 && (
        <details className="mt-3 text-[0.8rem] text-pencil">
          <summary className="cursor-pointer underline-offset-2 hover:underline">
            {earlier.length === 1 ? '1 earlier verdict' : `${earlier.length} earlier verdicts`}
          </summary>
          <ol className="mt-2 space-y-2">
            {earlier.map((verdict) => (
              <li key={verdict.id}>
                <span className={cn('font-semibold', TONE[verdict.status])}>
                  {STATUS_LABEL[verdict.status]}
                </span>{' '}
                <span title={exactTime(verdict.at)}>on {shortDate(verdict.at, zone)}</span>
                {verdict.note && (
                  <span className={cn('mt-0.5 block break-words font-person', TONE[verdict.status])}>
                    {verdict.note}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      {onRevise && (
        <button
          type="button"
          onClick={onRevise}
          className="mt-3 text-[0.8rem] text-pencil underline underline-offset-2 hover:text-print"
        >
          Change verdict
        </button>
      )}
    </div>
  )
}

/** The headings above the two columns, shown once the columns sit side by side. */
export function ColumnHeadings() {
  return (
    <div className="ledger-row hidden border-b border-print bg-secondary text-[0.8rem] font-semibold text-print min-[52rem]:grid">
      <div className="px-6 py-2">What was claimed</div>
      <div className="ledger-signoff px-6 py-2">What a person found</div>
    </div>
  )
}
