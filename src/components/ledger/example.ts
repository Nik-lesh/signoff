/**
 * Three example rows for the pages that explain Signoff to someone who is not
 * signed in. They are illustrations, labelled as such where they appear, and
 * never mixed into a real ledger.
 *
 * The rows carry fixed timestamps and are printed with their dates, in UTC,
 * never as "5 min ago": the static landing page then renders the same markup
 * at build time and in every browser, and the example never claims to be
 * recent.
 */

import { ledgerToMarkdown } from '@/lib/export'
import { toClaimViews, type ClaimView } from '@/lib/ledger'

/** Every timestamp in the example falls on this day, 16 November 2026, in UTC. */
const at = (hour: number, minute: number) =>
  new Date(Date.UTC(2026, 10, 16, hour, minute)).toISOString()

/** When the example ledger was exported: after its last entry. */
export const EXAMPLE_EXPORTED_AT = Date.UTC(2026, 10, 16, 15, 0)

export const EXAMPLE_CLAIMS: ClaimView[] = toClaimViews(
  [
    {
      recordId: 'example-1',
      createdAt: at(14, 34),
      data: {
        statement: 'Someone who is not the owner cannot read a private ledger',
        check: 'Open the ledger link in a private window, signed in as a second account',
        stakes: 'high',
        agent: 'coding-agent',
        source: 'agent',
        ref: 'tests/permissions.spec.ts',
      },
    },
    {
      recordId: 'example-2',
      createdAt: at(14, 39),
      data: {
        statement: 'All 41 unit tests pass',
        check: 'Run npm run test:unit and read the summary line',
        stakes: 'medium',
        agent: 'coding-agent',
        source: 'agent',
      },
    },
    {
      recordId: 'example-3',
      createdAt: at(14, 56),
      data: {
        statement: 'Fixed the two failing export tests. All 41 unit tests pass now',
        check: 'Run npm run test:unit on a clean checkout and read the summary line',
        stakes: 'medium',
        agent: 'coding-agent',
        source: 'agent',
        ref: 'src/lib/export.ts',
        follows: 'example-2',
      },
    },
  ],
  [
    {
      recordId: 'example-v1',
      createdAt: at(14, 51),
      data: {
        claimId: 'example-1',
        status: 'verified',
        note: 'Opened it as my test account. Got "no ledger to show here", and the network tab showed no rows.',
        byName: 'Dana Okafor',
      },
    },
    {
      recordId: 'example-v2',
      createdAt: at(14, 54),
      data: {
        claimId: 'example-2',
        status: 'wrong',
        note: 'Ran it on a clean checkout: 39 passed, 2 failed in export.test.ts.',
        byName: 'Dana Okafor',
      },
    },
  ],
)

/**
 * The example ledger's exported summary, as the landing page shows it. It is
 * the export function's own output for the rows above, so the page cannot
 * show a summary the app would not write.
 */
export const EXAMPLE_SUMMARY = ledgerToMarkdown(
  { name: 'Checkout rewrite', ownerName: 'Dana Okafor' },
  EXAMPLE_CLAIMS,
  EXAMPLE_EXPORTED_AT,
).trimEnd()
