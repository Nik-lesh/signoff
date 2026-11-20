import { describe, expect, it } from 'vitest'
import { ledgerToMarkdown } from './export'
import { toClaimViews, type ClaimData, type Row, type VerdictData } from './ledger'

const T0 = Date.parse('2026-11-16T12:00:00.000Z')
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString()

const claims: Array<Row<Partial<ClaimData>>> = [
  {
    recordId: 'c1',
    createdAt: at(0),
    data: { statement: 'All unit tests pass', check: 'Run npm run test:unit', stakes: 'high', source: 'agent', agent: 'coding-agent' },
  },
  {
    recordId: 'c2',
    createdAt: at(10),
    data: { statement: 'Non-members cannot read a ledger', check: 'Open it as a second user', stakes: 'high', source: 'agent', ref: 'tests/api.spec.ts' },
  },
  {
    recordId: 'c3',
    createdAt: at(20),
    data: { statement: 'Export escapes *markdown*', check: 'Read export.ts', stakes: 'low', source: 'manual' },
  },
  {
    recordId: 'c4',
    createdAt: at(30),
    data: { statement: 'Landing page has no auth call', check: 'Watch the network tab', stakes: 'medium', source: 'agent' },
  },
]

const verdicts: Array<Row<Partial<VerdictData>>> = [
  { recordId: 'v1', createdAt: at(120), data: { claimId: 'c1', status: 'verified', note: 'Ran it, 30 passed', byName: 'Nik' } },
  { recordId: 'v2', createdAt: at(600), data: { claimId: 'c1', status: 'wrong', note: 'Fails on Node 24', byName: 'Nik' } },
  { recordId: 'v3', createdAt: at(700), data: { claimId: 'c2', status: 'verified', note: 'Second user saw nothing', byName: 'Nik' } },
  { recordId: 'v4', createdAt: at(800), data: { claimId: 'c3', status: 'skipped', byName: 'Nik' } },
]

const markdown = ledgerToMarkdown(
  { name: 'Signoff', repoUrl: 'https://github.com/Nik-lesh/signoff', ownerName: 'Nik' },
  toClaimViews(claims, verdicts),
  T0 + 86_400_000,
)

describe('ledgerToMarkdown', () => {
  it('opens with the counts and the share a person checked', () => {
    expect(markdown).toContain('# Signoff ledger: Signoff')
    expect(markdown).toContain('4 claims: 1 verified, 1 wrong, 1 not checked, 1 waiting.')
    expect(markdown).toContain('A person checked 50% of them.')
  })

  it('files each claim under its current status, wrong first', () => {
    const order = [
      '## Wrong (1)',
      '## Follow-ups (0)',
      '## Verified (1)',
      '## Not checked (1)',
      '## Waiting for a verdict (1)',
    ]
    const positions = order.map((heading) => markdown.indexOf(heading))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual(positions.slice().sort((a, b) => a - b))

    const wrong = markdown.slice(positions[0], positions[1])
    expect(wrong).toContain('All unit tests pass')
    expect(wrong).toContain('What was done: Fails on Node 24')
  })

  it('shows the verdict history when a verdict was revised', () => {
    expect(markdown).toContain('Verdict history: verified → wrong')
  })

  it('reports time from filing to the first verdict', () => {
    expect(markdown).toContain('first verdict 2m after filing')
  })

  it('tells claims an agent filed from claims a person typed', () => {
    expect(markdown).toContain('Filed 2026-11-16 by coding-agent, stakes: high.')
    expect(markdown).toContain('Entered by hand on 2026-11-16, stakes: low.')
  })

  it('gives waiting claims their check instead of a verdict', () => {
    const waiting = markdown.slice(markdown.indexOf('## Waiting for a verdict'))
    expect(waiting).toContain('How to check: Watch the network tab')
    expect(waiting).not.toContain('Verdict 2026')
  })

  it('escapes user text so it cannot restructure the document', () => {
    expect(markdown).toContain('Export escapes \\*markdown\\*')
    const hostile = ledgerToMarkdown(
      { name: 'x' },
      toClaimViews(
        [{ recordId: 'c', createdAt: at(0), data: { statement: 'line one\n# Fake heading', check: 'n/a n/a n/a' } }],
        [],
      ),
      T0,
    )
    expect(hostile).not.toMatch(/^# Fake heading/m)
    expect(hostile).toContain('line one # Fake heading')
  })

  it('says whether the high-stakes claims were checked', () => {
    expect(markdown).toContain('All 2 high-stakes claims have been checked.')
  })

  it('numbers each claim and spells out which claim follows which', () => {
    const linked = ledgerToMarkdown(
      { name: 'Loop' },
      toClaimViews(
        [
          { recordId: 'a', createdAt: at(0), data: { statement: 'All tests pass', check: 'Run them all', source: 'agent' } },
          { recordId: 'b', createdAt: at(60), data: { statement: 'Fixed the failing test', check: 'Run them all', source: 'agent', follows: 'a' } },
        ],
        [{ recordId: 'v', createdAt: at(30), data: { claimId: 'a', status: 'wrong', note: 'One test fails' } }],
      ),
      T0,
    )
    expect(linked).toContain('- **No. 1: All tests pass**')
    expect(linked).toContain('- **No. 2: Fixed the failing test**')
    expect(linked).toContain('  - Follows No. 1, marked wrong.')
    expect(linked).toContain('  - Followed by No. 2.')
  })

  it('gathers the follow-ups in one place, with where both claims stand', () => {
    const rows: Array<Row<Partial<ClaimData>>> = [
      { recordId: 'a', createdAt: at(0), data: { statement: 'All tests pass', check: 'Run them all', source: 'agent' } },
      { recordId: 'b', createdAt: at(10), data: { statement: 'The build is reproducible', check: 'Build it twice', source: 'agent' } },
      { recordId: 'c', createdAt: at(60), data: { statement: 'Fixed the failing test', check: 'Run them all', source: 'agent', follows: 'a' } },
    ]
    const ruled = (extra: Array<Row<Partial<VerdictData>>>) =>
      ledgerToMarkdown(
        { name: 'Loop' },
        toClaimViews(rows, [
          { recordId: 'v1', createdAt: at(30), data: { claimId: 'a', status: 'wrong', note: 'One test fails' } },
          { recordId: 'v2', createdAt: at(40), data: { claimId: 'b', status: 'wrong', note: 'The two builds differ' } },
          ...extra,
        ]),
        T0,
      )

    const open = ruled([])
    const section = open.slice(open.indexOf('## Follow-ups'), open.indexOf('## Verified'))
    expect(section).toContain('## Follow-ups (1)')
    expect(section).toContain('- No. 3 follows No. 1, marked wrong. No. 3 is still waiting.')
    // A claim found wrong that nothing has answered is named, not left to be noticed.
    expect(section).toContain('- Marked wrong with no follow-up: No. 2.')
    // The section sits between what was wrong and what was verified.
    expect(open.indexOf('## Wrong')).toBeLessThan(open.indexOf('## Follow-ups'))

    const settled = ruled([
      { recordId: 'v3', createdAt: at(90), data: { claimId: 'c', status: 'verified', note: 'Ran them: all pass' } },
    ])
    expect(settled).toContain('- No. 3 follows No. 1, marked wrong. No. 3 is verified.')
  })

  it('says so when no claim follows up on another', () => {
    const quiet = ledgerToMarkdown(
      { name: 'Quiet' },
      toClaimViews(
        [{ recordId: 'a', createdAt: at(0), data: { statement: 'All tests pass', check: 'Run them all', source: 'agent' } }],
        [],
      ),
      T0,
    )
    expect(quiet).toContain('## Follow-ups (0)\n\nNo claim follows up on another.')
  })

  it('handles an empty ledger', () => {
    const empty = ledgerToMarkdown({ name: 'Empty' }, [], T0)
    expect(empty).toContain('0 claims: 0 verified, 0 wrong, 0 not checked, 0 waiting.')
    expect(empty).toContain('A person checked 0% of them.')
    expect(empty.endsWith('\n')).toBe(true)
    expect(empty).not.toMatch(/\n{3,}/)
  })
})
