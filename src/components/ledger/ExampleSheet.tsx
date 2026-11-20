/** A read-only sheet of the three example rows, for the landing page and the signed-out home. */

import { BlankSignoff, ClaimEntry, ColumnHeadings, RowFrame, SignoffMark } from './ClaimParts'
import { linksOf, numberClaims } from '@/lib/ledger'
import { EXAMPLE_CLAIMS } from './example'

const NUMBERS = numberClaims(EXAMPLE_CLAIMS)
const BY_ID = new Map(EXAMPLE_CLAIMS.map((claim) => [claim.id, claim]))

export function ExampleSheet() {
  return (
    <figure>
      <div className="border border-print bg-card [&>article:last-child]:border-b-0">
        <ColumnHeadings />
        {EXAMPLE_CLAIMS.map((claim, index) => {
          const titleId = `example-claim-${index + 1}`
          return (
            <RowFrame
              key={claim.id}
              claim={claim}
              titleId={titleId}
              left={
                <ClaimEntry
                  claim={claim}
                  titleId={titleId}
                  number={NUMBERS.get(claim.id) ?? index + 1}
                  now={null}
                  links={linksOf(claim, BY_ID, NUMBERS)}
                />
              }
              right={
                claim.latest ? (
                  <SignoffMark claim={claim} latest={claim.latest} zone="utc" />
                ) : (
                  <BlankSignoff />
                )
              }
            />
          )
        })}
      </div>
      <figcaption className="mt-2 text-[0.8rem] text-pencil">
        An example ledger. The claims are in the agent&apos;s typeface; the verdicts are in the
        person&apos;s.
      </figcaption>
    </figure>
  )
}
