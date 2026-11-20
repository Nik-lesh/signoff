/**
 * The ruled sheet: a filter, the two column headings, and one row per claim.
 */

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  inReviewOrder,
  linksOf,
  type ClaimStatus,
  type ClaimView,
  type Score,
} from '@/lib/ledger'
import { useArrivals } from '@/hooks/useArrivals'
import { useNow } from '@/hooks/useNow'
import { ColumnHeadings, STATUS_LABEL, rowAnchor } from './ClaimParts'
import { ClaimRow } from './ClaimRow'

type Filter = 'all' | ClaimStatus

const FILTERS: Filter[] = ['all', 'new', 'wrong', 'skipped', 'verified']

const EMPTY: Record<Filter, string> = {
  all: 'No claims in this ledger yet.',
  new: 'Nothing is waiting for a verdict.',
  wrong: 'No claim has been marked wrong.',
  skipped: 'No claim has been marked not checked.',
  verified: 'No claim has been verified yet.',
}

interface LedgerSheetProps {
  claims: ClaimView[]
  score: Score
  numbers: Map<string, number>
  canSign: boolean
  /** False while the first snapshot is still loading, so nothing counts as "just arrived". */
  ready: boolean
}

export function LedgerSheet({ claims, score, numbers, canSign, ready }: LedgerSheetProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const now = useNow()

  const ids = useMemo(() => claims.map((claim) => claim.id), [claims])
  const arrived = useArrivals(ids, ready)

  const counts: Record<Filter, number> = {
    all: score.total,
    new: score.new,
    wrong: score.wrong,
    skipped: score.skipped,
    verified: score.verified,
  }
  const ordered = useMemo(() => inReviewOrder(claims), [claims])
  const shown = filter === 'all' ? ordered : ordered.filter((claim) => claim.status === filter)
  const byId = useMemo(() => new Map(claims.map((claim) => [claim.id, claim])), [claims])

  // Following a "No. 5" link: the target may be hidden by the filter, so show
  // every claim first, then bring the row into view and mark it for a moment.
  const [jumpedTo, setJumpedTo] = useState<string | null>(null)
  function jumpTo(claimId: string) {
    setFilter('all')
    setJumpedTo(claimId)
  }
  useEffect(() => {
    if (!jumpedTo) return
    const row = document.getElementById(rowAnchor(jumpedTo))
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    row?.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
    row?.focus({ preventScroll: true })
    const timer = setTimeout(() => setJumpedTo(null), 1600)
    return () => clearTimeout(timer)
  }, [jumpedTo])

  return (
    <section aria-labelledby="claims-heading">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h2 id="claims-heading" className="text-[1.05rem] font-semibold text-print">
          Claims
        </h2>
        <div role="group" aria-label="Show claims" className="flex flex-wrap gap-x-1 gap-y-1">
          {FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={cn(
                'rounded-sm px-2.5 py-1 text-[0.85rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filter === option
                  ? 'bg-print text-background'
                  : 'text-pencil hover:bg-secondary hover:text-print',
              )}
            >
              {option === 'all' ? 'All' : STATUS_LABEL[option]}{' '}
              <span className="tabular-nums">{counts[option]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 border border-print bg-card">
        <ColumnHeadings />

        {shown.length === 0 ? (
          <p className="px-6 py-10 text-center text-[0.9rem] text-pencil">
            {EMPTY[filter]}
          </p>
        ) : (
          <div className="[&>article:last-child]:border-b-0">
            {shown.map((claim) => (
              <ClaimRow
                key={claim.id}
                claim={claim}
                number={numbers.get(claim.id) ?? 0}
                canSign={canSign}
                arrived={arrived.has(claim.id) || jumpedTo === claim.id}
                now={now}
                links={linksOf(claim, byId, numbers)}
                onJump={jumpTo}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
