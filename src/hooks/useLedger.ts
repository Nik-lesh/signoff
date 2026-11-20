/**
 * One ledger, live.
 *
 * Three subscriptions to the record room: the ledger row, its claims and its
 * verdicts. The room only sends rows this viewer may read, so a private
 * ledger that belongs to someone else arrives as "no rows", exactly like a
 * ledger that does not exist.
 */

import { useMemo } from 'react'
import { useQuery } from 'deepspace'
import {
  numberClaims,
  scoreOf,
  toClaimViews,
  type ClaimData,
  type ClaimView,
  type LedgerData,
  type Score,
  type VerdictData,
} from '../lib/ledger'

export interface LedgerState {
  /** 'missing' covers both "does not exist" and "not yours to read". */
  phase: 'loading' | 'ready' | 'missing' | 'error'
  ledgerId: string
  ledger: LedgerData | null
  claims: ClaimView[]
  score: Score
  /** Claim id to its place in filing order, starting at 1. */
  numbers: Map<string, number>
}

export function useLedger(ledgerId: string): LedgerState {
  const ledgerQuery = useMemo(() => ({ where: { recordId: ledgerId } }), [ledgerId])
  const rowsQuery = useMemo(() => ({ where: { ledgerId } }), [ledgerId])

  const ledgers = useQuery<LedgerData>('ledgers', ledgerQuery)
  const claimRows = useQuery<ClaimData>('claims', rowsQuery)
  const verdictRows = useQuery<VerdictData>('verdicts', rowsQuery)

  const claims = useMemo(
    () => toClaimViews(claimRows.records, verdictRows.records),
    [claimRows.records, verdictRows.records],
  )
  const score = useMemo(() => scoreOf(claims), [claims])
  const numbers = useMemo(() => numberClaims(claims), [claims])

  const statuses = [ledgers.status, claimRows.status, verdictRows.status]
  const ledger = ledgers.records[0]?.data ?? null

  let phase: LedgerState['phase'] = 'ready'
  if (statuses.includes('error')) phase = 'error'
  else if (statuses.includes('loading')) phase = 'loading'
  else if (!ledger) phase = 'missing'

  return { phase, ledgerId, ledger, claims, score, numbers }
}
