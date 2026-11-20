import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  inReviewOrder,
  linksOf,
  numberClaims,
  scoreOf,
  slugify,
  stakesSentence,
  tallySentence,
  toClaimViews,
  toEpochMs,
  type ClaimData,
  type Row,
  type VerdictData,
} from './ledger'

const T0 = Date.parse('2026-11-16T12:00:00.000Z')
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString()

function claim(id: string, seconds: number, data: Partial<ClaimData> = {}): Row<Partial<ClaimData>> {
  return {
    recordId: id,
    createdAt: at(seconds),
    data: {
      ledgerId: 'L1',
      ownerId: 'u1',
      visibility: 'private',
      statement: `claim ${id}`,
      check: `check ${id}`,
      stakes: 'medium',
      source: 'agent',
      ...data,
    },
  }
}

function verdict(
  id: string,
  claimId: string,
  seconds: number,
  status: unknown,
  note = 'ran it myself',
): Row<Partial<VerdictData>> {
  return {
    recordId: id,
    createdAt: at(seconds),
    data: { claimId, ledgerId: 'L1', status: status as VerdictData['status'], note, byName: 'Nik' },
  }
}

describe('toClaimViews', () => {
  it('marks a claim with no verdict as new', () => {
    const [view] = toClaimViews([claim('c1', 0)], [])
    expect(view.status).toBe('new')
    expect(view.latest).toBeNull()
    expect(view.secondsToFirstVerdict).toBeNull()
  })

  it('takes the newest verdict as the status and keeps the history oldest first', () => {
    const [view] = toClaimViews(
      [claim('c1', 0)],
      [verdict('v2', 'c1', 300, 'wrong'), verdict('v1', 'c1', 60, 'verified')],
    )
    expect(view.status).toBe('wrong')
    expect(view.verdicts.map((v) => v.id)).toEqual(['v1', 'v2'])
    expect(view.latest?.id).toBe('v2')
  })

  it('measures time to the first verdict, not the latest', () => {
    const [view] = toClaimViews(
      [claim('c1', 0)],
      [verdict('v1', 'c1', 90, 'skipped'), verdict('v2', 'c1', 4000, 'verified')],
    )
    expect(view.secondsToFirstVerdict).toBe(90)
  })

  it('breaks a timestamp tie by record id so every client agrees', () => {
    const verdicts = [verdict('vB', 'c1', 60, 'verified'), verdict('vA', 'c1', 60, 'wrong')]
    const forward = toClaimViews([claim('c1', 0)], verdicts)[0]
    const reversed = toClaimViews([claim('c1', 0)], verdicts.slice().reverse())[0]
    expect(forward.status).toBe('verified')
    expect(reversed.status).toBe('verified')
  })

  it('ignores verdicts with an unknown status or no matching claim', () => {
    const views = toClaimViews(
      [claim('c1', 0)],
      [verdict('v1', 'c1', 10, 'approved'), verdict('v2', 'ghost', 10, 'verified')],
    )
    expect(views).toHaveLength(1)
    expect(views[0].status).toBe('new')
  })

  it('falls back to safe defaults for malformed claim rows', () => {
    const [view] = toClaimViews(
      [{ recordId: 'c1', createdAt: 'not a date', data: { stakes: 'extreme' as never } }],
      [],
    )
    expect(view.stakes).toBe('medium')
    expect(view.statement).toBe('')
    expect(view.source).toBe('agent')
    expect(view.filedAt).toBe(0)
  })

  it('labels claims a person typed as manual', () => {
    const [view] = toClaimViews([claim('c1', 0, { source: 'manual' })], [])
    expect(view.source).toBe('manual')
  })
})

describe('scoreOf', () => {
  it('counts each state and reports the share a person checked', () => {
    const views = toClaimViews(
      [claim('c1', 0), claim('c2', 1), claim('c3', 2), claim('c4', 3)],
      [
        verdict('v1', 'c1', 60, 'verified'),
        verdict('v2', 'c2', 60, 'wrong'),
        verdict('v3', 'c3', 60, 'skipped'),
      ],
    )
    expect(scoreOf(views)).toEqual({
      total: 4,
      new: 1,
      verified: 1,
      wrong: 1,
      skipped: 1,
      checked: 2,
      checkedPercent: 50,
      high: 0,
      highUnchecked: 0,
    })
  })

  it('does not count a skipped claim as checked', () => {
    const views = toClaimViews([claim('c1', 0)], [verdict('v1', 'c1', 5, 'skipped')])
    expect(scoreOf(views).checkedPercent).toBe(0)
  })

  it('reports zero for an empty ledger instead of dividing by zero', () => {
    expect(scoreOf([]).checkedPercent).toBe(0)
  })
})

describe('inReviewOrder', () => {
  it('puts new claims first, highest stakes on top, oldest first within a level', () => {
    const views = toClaimViews(
      [
        claim('settled', 0),
        claim('low', 1, { stakes: 'low' }),
        claim('high-late', 5, { stakes: 'high' }),
        claim('high-early', 2, { stakes: 'high' }),
        claim('medium', 3),
      ],
      [verdict('v1', 'settled', 60, 'verified')],
    )
    expect(inReviewOrder(views).map((v) => v.id)).toEqual([
      'high-early',
      'high-late',
      'medium',
      'low',
      'settled',
    ])
  })

  it('orders settled claims wrong, then skipped, then verified', () => {
    const views = toClaimViews(
      [claim('a', 0), claim('b', 1), claim('c', 2)],
      [
        verdict('v1', 'a', 60, 'verified'),
        verdict('v2', 'b', 60, 'skipped'),
        verdict('v3', 'c', 60, 'wrong'),
      ],
    )
    expect(inReviewOrder(views).map((v) => v.id)).toEqual(['c', 'b', 'a'])
  })

  it('does not mutate its input', () => {
    const views = toClaimViews([claim('b', 5), claim('a', 0)], [])
    const before = views.map((v) => v.id)
    inReviewOrder(views)
    expect(views.map((v) => v.id)).toEqual(before)
  })
})

describe('toEpochMs', () => {
  it('reads ISO strings, epoch milliseconds and epoch seconds', () => {
    expect(toEpochMs('2026-11-16T12:00:00.000Z')).toBe(T0)
    expect(toEpochMs(T0)).toBe(T0)
    expect(toEpochMs(T0 / 1000)).toBe(T0)
    expect(toEpochMs(String(T0))).toBe(T0)
  })

  it('returns 0 for anything unreadable', () => {
    expect(toEpochMs(undefined)).toBe(0)
    expect(toEpochMs('')).toBe(0)
    expect(toEpochMs('soon')).toBe(0)
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [45, '45s'],
    [60, '1m'],
    [3599, '59m'],
    [3600, '1h'],
    [3900, '1h 5m'],
    [86400, '1d'],
    [93600, '1d 2h'],
  ])('%i seconds reads as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})

describe('slugify', () => {
  it.each([
    ['Signoff', 'signoff'],
    ['  My  App: v2! ', 'my-app-v2'],
    ['Café Déjà', 'cafe-deja'],
    ['___', 'ledger'],
    ['', 'ledger'],
  ])('%j becomes %j', (name, expected) => {
    expect(slugify(name)).toBe(expected)
  })

  it('never exceeds the slug limit or ends with a dash', () => {
    const slug = slugify(`${'a'.repeat(39)} b c d`)
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('tallySentence', () => {
  const noStakes = { high: 0, highUnchecked: 0 }

  it('reads as one plain sentence pair', () => {
    expect(
      tallySentence({ total: 12, new: 2, verified: 7, wrong: 1, skipped: 2, checked: 8, checkedPercent: 67, ...noStakes }),
    ).toBe('12 claims: 7 verified, 1 wrong, 2 not checked, 2 waiting. A person checked 67% of them.')
  })

  it('uses the singular for one claim', () => {
    expect(
      tallySentence({ total: 1, new: 1, verified: 0, wrong: 0, skipped: 0, checked: 0, checkedPercent: 0, ...noStakes }),
    ).toMatch(/^1 claim: /)
  })

  it('adds what the percentage hides when the ledger has high-stakes claims', () => {
    expect(
      tallySentence({ total: 12, new: 2, verified: 7, wrong: 1, skipped: 2, checked: 8, checkedPercent: 67, high: 5, highUnchecked: 3 }),
    ).toBe(
      '12 claims: 7 verified, 1 wrong, 2 not checked, 2 waiting. A person checked 67% of them. ' +
        '3 of the 5 high-stakes claims have not been checked.',
    )
  })
})

describe('stakes in the score', () => {
  it('counts a high-stakes claim as unchecked while it waits or is marked "not checked"', () => {
    const views = toClaimViews(
      [
        claim('waiting', 0, { stakes: 'high' }),
        claim('skipped', 1, { stakes: 'high' }),
        claim('verified', 2, { stakes: 'high' }),
        claim('wrong', 3, { stakes: 'high' }),
        claim('medium', 4, { stakes: 'medium' }),
        claim('low', 5, { stakes: 'low' }),
      ],
      [
        verdict('v1', 'skipped', 10, 'skipped'),
        verdict('v2', 'verified', 11, 'verified'),
        verdict('v3', 'wrong', 12, 'wrong'),
      ],
    )
    expect(scoreOf(views)).toMatchObject({ total: 6, high: 4, highUnchecked: 2 })
  })

  it('follows the newest verdict, like everything else', () => {
    const views = toClaimViews(
      [claim('c', 0, { stakes: 'high' })],
      [verdict('v1', 'c', 10, 'verified'), verdict('v2', 'c', 20, 'skipped')],
    )
    expect(scoreOf(views)).toMatchObject({ high: 1, highUnchecked: 1 })
  })

  it.each([
    [0, 0, ''],
    [1, 0, 'The 1 high-stakes claim has been checked.'],
    [1, 1, 'The 1 high-stakes claim has not been checked.'],
    [4, 0, 'All 4 high-stakes claims have been checked.'],
    [4, 1, '1 of the 4 high-stakes claims has not been checked.'],
    [4, 3, '3 of the 4 high-stakes claims have not been checked.'],
    [4, 4, '4 of the 4 high-stakes claims have not been checked.'],
  ])('%i high, %i unchecked reads as %j', (high, highUnchecked, expected) => {
    expect(stakesSentence({ high, highUnchecked })).toBe(expected)
  })
})

describe('follow-up links', () => {
  const views = () =>
    toClaimViews(
      [
        claim('first', 0),
        claim('fix', 60, { follows: 'first' }),
        claim('second-fix', 120, { follows: 'first' }),
        claim('fix-of-fix', 180, { follows: 'fix' }),
        claim('dangling', 240, { follows: 'not-in-this-ledger' }),
        claim('selfish', 300, { follows: 'selfish' }),
      ],
      [verdict('v1', 'first', 30, 'wrong')],
    )
  const find = (id: string) => views().find((view) => view.id === id)

  it('links a claim to the earlier one it follows, and back, in filing order', () => {
    expect(find('fix')?.follows).toBe('first')
    expect(find('first')?.followedBy).toEqual(['fix', 'second-fix'])
    expect(find('fix')?.followedBy).toEqual(['fix-of-fix'])
    expect(find('first')?.follows).toBe('')
  })

  it('drops a link to a claim that is not in the ledger, and a claim pointing at itself', () => {
    expect(find('dangling')).toMatchObject({ follows: '', followedBy: [] })
    expect(find('selfish')).toMatchObject({ follows: '', followedBy: [] })
  })

  it('numbers claims by when they were filed, whatever order they arrive in', () => {
    const numbers = numberClaims(views().reverse())
    expect([...numbers.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual([
      'first',
      'fix',
      'second-fix',
      'fix-of-fix',
      'dangling',
      'selfish',
    ])
  })

  it('resolves links to the numbers and the status the page shows', () => {
    const all = views()
    const numbers = numberClaims(all)
    const byId = new Map(all.map((view) => [view.id, view]))
    expect(linksOf(byId.get('fix')!, byId, numbers)).toEqual({
      follows: { id: 'first', number: 1, status: 'wrong' },
      followedBy: [{ id: 'fix-of-fix', number: 4 }],
    })
    expect(linksOf(byId.get('first')!, byId, numbers)).toEqual({
      follows: null,
      followedBy: [
        { id: 'fix', number: 2 },
        { id: 'second-fix', number: 3 },
      ],
    })
    expect(linksOf(byId.get('dangling')!, byId, numbers)).toEqual({ follows: null, followedBy: [] })
  })
})
