/**
 * The ledger in one sentence, with a bar showing the same proportions.
 *
 * The sentence uses the same words as the Markdown export
 * (`tallySentence` in src/lib/ledger.ts); here its parts are coloured so the
 * sentence doubles as the key to the bar.
 */

import { stakesSentence, type Score } from '@/lib/ledger'

export function Tally({ score }: { score: Score }) {
  if (score.total === 0) return null

  const segments = [
    { key: 'verified', count: score.verified, className: 'bg-ink' },
    { key: 'wrong', count: score.wrong, className: 'bg-redpen' },
    { key: 'skipped', count: score.skipped, className: 'bg-pencil' },
    { key: 'new', count: score.new, className: 'bg-transparent' },
  ].filter((segment) => segment.count > 0)
  const stakes = stakesSentence(score)

  return (
    <section aria-label="Ledger summary" data-testid="tally">
      <p className="text-[1.05rem] leading-relaxed text-print">
        {score.total} {score.total === 1 ? 'claim' : 'claims'}:{' '}
        <span className="font-semibold text-ink">{score.verified} verified</span>,{' '}
        <span className="font-semibold text-redpen">{score.wrong} wrong</span>,{' '}
        <span className="font-semibold text-pencil">{score.skipped} not checked</span>,{' '}
        <span className="font-semibold">{score.new} waiting</span>. A person checked{' '}
        <span className="font-semibold tabular-nums">{score.checkedPercent}%</span> of them.
        {stakes && (
          <>
            {' '}
            <span className={score.highUnchecked > 0 ? 'font-semibold' : undefined}>{stakes}</span>
          </>
        )}
      </p>
      <div
        aria-hidden
        className="mt-3 flex h-2.5 w-full overflow-hidden rounded-sm border border-print bg-sheet"
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={segment.className}
            style={{ width: `${(segment.count / score.total) * 100}%` }}
          />
        ))}
      </div>
    </section>
  )
}
