/* home pattern: data-forward — your ledgers, with what is waiting on you, above the fold */

/**
 * /home. Signed in, it is a table of your ledgers and how much of each is
 * still waiting for you. Signed out, it shows a ledger to read (this app's
 * own, when one is configured in src/showcase.ts) next to the sign-in button.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, useAuthStatus, useQuery } from 'deepspace'
import { BookOpenCheck, Plus } from 'lucide-react'
import { Button, EmptyState } from '@/components/ui'
import { ExampleSheet } from '@/components/ledger/ExampleSheet'
import { LedgerSheet } from '@/components/ledger/LedgerSheet'
import { NewLedgerDialog } from '@/components/ledger/NewLedgerDialog'
import { Tally } from '@/components/ledger/Tally'
import { DISPLAY_NAME } from '@/constants'
import { useLedger } from '@/hooks/useLedger'
import {
  scoreOf,
  toClaimViews,
  toEpochMs,
  type ClaimData,
  type LedgerData,
  type Score,
  type VerdictData,
} from '@/lib/ledger'
import { shortDate } from '@/lib/time'
import { SHOWCASE_LEDGER_ID } from '@/showcase'

export default function HomePage() {
  const { isSignedIn, userId } = useAuthStatus()

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-8 sm:pt-10">
      <title>{`Ledgers · ${DISPLAY_NAME}`}</title>
      {isSignedIn && userId ? <YourLedgers userId={userId} /> : <SignedOutHome />}
    </div>
  )
}

function YourLedgers({ userId }: { userId: string }) {
  const [creating, setCreating] = useState(false)

  // The record room already limits these to rows this person may read; the
  // filter keeps public ledgers that belong to other people out of the list.
  const mine = useMemo(() => ({ where: { ownerId: userId } }), [userId])
  const ledgers = useQuery<LedgerData>('ledgers', mine)
  const claims = useQuery<ClaimData>('claims', mine)
  const verdicts = useQuery<VerdictData>('verdicts', mine)

  const scores = useMemo(() => {
    const byLedger = new Map<string, Score>()
    const views = toClaimViews(claims.records, verdicts.records)
    const ledgerOf = new Map(claims.records.map((row) => [row.recordId, row.data.ledgerId]))
    const grouped = new Map<string, typeof views>()
    for (const view of views) {
      const ledgerId = ledgerOf.get(view.id)
      if (!ledgerId) continue
      const list = grouped.get(ledgerId) ?? []
      list.push(view)
      grouped.set(ledgerId, list)
    }
    for (const [ledgerId, list] of grouped) byLedger.set(ledgerId, scoreOf(list))
    return byLedger
  }, [claims.records, verdicts.records])

  const rows = useMemo(
    () =>
      ledgers.records
        .slice()
        .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt) || a.recordId.localeCompare(b.recordId)),
    [ledgers.records],
  )

  const loading = [ledgers.status, claims.status, verdicts.status].includes('loading')
  const failed = [ledgers.status, claims.status, verdicts.status].includes('error')
  const waiting = rows.reduce((sum, row) => sum + (scores.get(row.recordId)?.new ?? 0), 0)

  let summary = 'A ledger holds what your coding agent says it did, and what you found when you checked.'
  if (!loading && rows.length > 0) {
    summary =
      waiting === 0
        ? 'Nothing is waiting for your verdict.'
        : `${waiting} ${waiting === 1 ? 'claim is' : 'claims are'} waiting for your verdict.`
  }

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="max-w-2xl">
          <h1 className="text-[2rem] font-bold leading-[1.15] tracking-tight text-print">
            Your ledgers
          </h1>
          <p className="mt-2 text-[0.95rem] text-pencil" data-testid="home-summary">
            {summary}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          New ledger
        </Button>
      </header>

      <div className="mt-8">
        {failed ? (
          <EmptyState
            icon={<BookOpenCheck />}
            title="Your ledgers could not be loaded"
            description="The connection to Signoff dropped or the request was refused. Reload to try again."
            action={{ label: 'Reload', onClick: () => window.location.reload() }}
          />
        ) : loading ? (
          <div aria-busy="true" aria-label="Loading your ledgers" className="animate-pulse space-y-px border border-rule">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-16 bg-card" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="border border-print bg-card">
            <EmptyState
              icon={<BookOpenCheck />}
              title="Start your first ledger"
              description="Name it after the thing you are building. Then connect your coding agent, and its claims will land here for you to check."
              action={{ label: 'New ledger', onClick: () => setCreating(true) }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto border border-print bg-card">
            <table className="w-full min-w-[34rem] border-collapse text-left text-[0.92rem]">
              <thead>
                <tr className="border-b border-print bg-secondary text-[0.8rem] text-print">
                  <th scope="col" className="px-5 py-2 font-semibold">Ledger</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Waiting</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Wrong</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Claims</th>
                  <th scope="col" className="px-5 py-2 font-semibold">Read by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const score = scores.get(row.recordId)
                  return (
                    <tr key={row.recordId} data-testid="ledger-row" className="border-b border-rule last:border-b-0">
                      <th scope="row" className="px-5 py-3.5 font-normal">
                        <Link
                          to={`/l/${row.recordId}`}
                          className="font-semibold text-print underline-offset-4 hover:text-ink hover:underline"
                        >
                          {row.data.name}
                        </Link>
                        <span className="mt-0.5 block text-[0.8rem] text-pencil">
                          <span className="font-agent">{row.data.slug}</span>, started{' '}
                          {shortDate(toEpochMs(row.createdAt))}
                        </span>
                      </th>
                      <td className="px-3 py-3.5 text-right tabular-nums">
                        <span className={score?.new ? 'font-semibold text-print' : 'text-pencil'}>
                          {score?.new ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums">
                        <span className={score?.wrong ? 'font-semibold text-redpen' : 'text-pencil'}>
                          {score?.wrong ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-right tabular-nums text-print">
                        {score?.total ?? 0}
                      </td>
                      <td className="px-5 py-3.5 text-pencil">
                        {row.data.visibility === 'public' ? 'Anyone with the link' : 'Only you'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewLedgerDialog open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

function SignedOutHome() {
  const [showAuth, setShowAuth] = useState(false)

  return (
    <>
      <header className="max-w-2xl">
        <h1 className="text-[2rem] font-bold leading-[1.15] tracking-tight text-print">
          Know what you checked, and what you took on trust
        </h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-pencil">
          Your coding agent files each thing it says is done. You mark it verified, wrong, or not
          checked. The ledger keeps both, and only you can sign.
        </p>
        <Button className="mt-5" onClick={() => setShowAuth(true)}>
          Sign in to start a ledger
        </Button>
      </header>

      <div className="mt-10">
        {SHOWCASE_LEDGER_ID ? <Showcase ledgerId={SHOWCASE_LEDGER_ID} /> : <ExampleSheet />}
      </div>

      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </>
  )
}

/** A real public ledger, live and read-only. Falls back to the example if it cannot be read. */
function Showcase({ ledgerId }: { ledgerId: string }) {
  const state = useLedger(ledgerId)

  if (state.phase === 'loading') {
    return <div aria-busy="true" className="h-64 animate-pulse border border-rule bg-card" />
  }
  if (state.phase !== 'ready' || !state.ledger || state.claims.length === 0) {
    return <ExampleSheet />
  }

  return (
    <section aria-labelledby="showcase-heading">
      <h2 id="showcase-heading" className="text-[1.05rem] font-semibold text-print">
        A real one:{' '}
        <Link to={`/l/${ledgerId}`} className="underline underline-offset-4 hover:text-ink">
          {state.ledger.name}
        </Link>
        , kept by {state.ledger.ownerName || 'its owner'}
      </h2>
      <div className="mt-4">
        <Tally score={state.score} />
      </div>
      <div className="mt-6">
        <LedgerSheet
          claims={state.claims}
          score={state.score}
          numbers={state.numbers}
          canSign={false}
          ready
        />
      </div>
    </section>
  )
}
