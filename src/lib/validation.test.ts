import { describe, expect, it } from 'vitest'
import {
  addClaimInput,
  createLedgerInput,
  fileClaimToolInput,
  findLikelySecret,
  firstIssue,
  recordVerdictInput,
  setVisibilityInput,
} from './validation'

const goodClaim = {
  claim: 'Non-members cannot read a private ledger',
  check: 'Open the ledger link while signed in as a second user',
}

describe('fileClaimToolInput', () => {
  it('accepts a claim with only the two required fields', () => {
    expect(fileClaimToolInput.safeParse(goodClaim).success).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    const parsed = fileClaimToolInput.parse({ ...goodClaim, claim: `  ${goodClaim.claim}  ` })
    expect(parsed.claim).toBe(goodClaim.claim)
  })

  it('refuses a claim without a way to check it', () => {
    expect(fileClaimToolInput.safeParse({ claim: goodClaim.claim }).success).toBe(false)
    expect(fileClaimToolInput.safeParse({ ...goodClaim, check: 'ok' }).success).toBe(false)
    expect(fileClaimToolInput.safeParse({ ...goodClaim, check: 'npm test' }).success).toBe(true)
  })

  it('refuses unknown fields, so an agent cannot set status or source', () => {
    for (const extra of [{ status: 'verified' }, { source: 'manual' }, { ownerId: 'someone' }]) {
      const result = fileClaimToolInput.safeParse({ ...goodClaim, ...extra })
      expect(result.success).toBe(false)
    }
  })

  it('refuses text over the length limits', () => {
    expect(fileClaimToolInput.safeParse({ ...goodClaim, claim: 'x'.repeat(281) }).success).toBe(false)
    expect(fileClaimToolInput.safeParse({ ...goodClaim, check: 'x'.repeat(501) }).success).toBe(false)
  })

  it('only accepts the three stakes levels', () => {
    expect(fileClaimToolInput.safeParse({ ...goodClaim, stakes: 'high' }).success).toBe(true)
    expect(fileClaimToolInput.safeParse({ ...goodClaim, stakes: 'critical' }).success).toBe(false)
  })

  it('takes the id of an earlier claim to follow, and nothing shaped otherwise', () => {
    const parsed = fileClaimToolInput.safeParse({ ...goodClaim, follows: ' 1795121067348_damnie ' })
    expect(parsed.success && parsed.data.follows).toBe('1795121067348_damnie')
    expect(fileClaimToolInput.safeParse({ ...goodClaim, follows: '' }).success).toBe(false)
    expect(fileClaimToolInput.safeParse({ ...goodClaim, follows: 'x'.repeat(65) }).success).toBe(false)
    expect(fileClaimToolInput.safeParse({ ...goodClaim, follows: 5 }).success).toBe(false)
  })
})

describe('secret screening', () => {
  // Assembled at runtime so no secret-shaped literal sits in the repository.
  const samples: Array<[string, string]> = [
    ['a GitHub token', `ghp_${'a1B2'.repeat(9)}`],
    ['an AWS access key', `AKIA${'ABCD1234'.repeat(2)}`],
    ['an API key', `sk-${'abcdEFGH1234'.repeat(2)}`],
    ['a private key', `-----BEGIN RSA ${'PRIVATE'} KEY-----`],
    ['a signed token (JWT)', ['eyJhbGciOiJFUzI1NiJ9', 'eyJzdWIiOiJ1c2VyXzEifQ', 'c2lnbmF0dXJlLWJ5dGVz'].join('.')],
  ]

  it.each(samples)('recognises %s', (label, sample) => {
    expect(findLikelySecret(`token is ${sample} ok`)).toBe(label)
  })

  it('lets ordinary technical text through', () => {
    for (const text of [
      'All 41 unit tests pass on Node 24',
      'See src/server/ledger-service.ts lines 40-80, commit 3f2a9c1',
      'The task-list skeleton renders before data arrives',
      'Run npm run test:unit and read the summary line',
    ]) {
      expect(findLikelySecret(text)).toBeNull()
    }
  })

  it('refuses a claim that carries a credential, in any text field', () => {
    const token = `ghp_${'a1B2'.repeat(9)}`
    for (const field of ['claim', 'check', 'ref'] as const) {
      const result = fileClaimToolInput.safeParse({ ...goodClaim, [field]: `use ${token} here` })
      expect(result.success).toBe(false)
      if (!result.success) expect(firstIssue(result.error)).toContain('a GitHub token')
    }
  })

  it('refuses a verdict note that carries a credential', () => {
    const result = recordVerdictInput.safeParse({
      claimId: 'c1',
      status: 'verified',
      note: `logged in with sk-${'abcdEFGH1234'.repeat(2)}`,
    })
    expect(result.success).toBe(false)
  })
})

describe('recordVerdictInput', () => {
  it('requires a note saying what was done for verified and wrong', () => {
    for (const status of ['verified', 'wrong'] as const) {
      expect(recordVerdictInput.safeParse({ claimId: 'c1', status }).success).toBe(false)
      expect(recordVerdictInput.safeParse({ claimId: 'c1', status, note: 'ok' }).success).toBe(false)
      expect(
        recordVerdictInput.safeParse({ claimId: 'c1', status, note: 'Ran the tests on my Mac' }).success,
      ).toBe(true)
    }
  })

  it('does not count padding spaces towards the note', () => {
    const result = recordVerdictInput.safeParse({ claimId: 'c1', status: 'verified', note: '   ok      ' })
    expect(result.success).toBe(false)
  })

  it('allows skipping without a note', () => {
    expect(recordVerdictInput.safeParse({ claimId: 'c1', status: 'skipped' }).success).toBe(true)
  })

  it('refuses any status outside the three verdicts', () => {
    for (const status of ['new', 'approved', '']) {
      expect(
        recordVerdictInput.safeParse({ claimId: 'c1', status, note: 'Ran the tests on my Mac' }).success,
      ).toBe(false)
    }
  })

  it('points the message at the note field', () => {
    const result = recordVerdictInput.safeParse({ claimId: 'c1', status: 'wrong' })
    expect(result.success).toBe(false)
    if (!result.success) expect(firstIssue(result.error)).toMatch(/^note: /)
  })
})

describe('createLedgerInput', () => {
  it('accepts a name alone, and an https repository link', () => {
    expect(createLedgerInput.safeParse({ name: 'Signoff' }).success).toBe(true)
    expect(
      createLedgerInput.safeParse({ name: 'Signoff', repoUrl: 'https://github.com/Nik-lesh/signoff' }).success,
    ).toBe(true)
    expect(createLedgerInput.safeParse({ name: 'Signoff', repoUrl: '' }).success).toBe(true)
  })

  it('refuses links that are not https, since the page renders them as links', () => {
    for (const repoUrl of ['javascript:alert(1)', 'http://example.com', 'github.com/x/y', 'https://localhost']) {
      expect(createLedgerInput.safeParse({ name: 'Signoff', repoUrl }).success).toBe(false)
    }
  })

  it('refuses a one-character or missing name', () => {
    expect(createLedgerInput.safeParse({ name: ' a ' }).success).toBe(false)
    expect(createLedgerInput.safeParse({}).success).toBe(false)
  })
})

describe('addClaimInput and setVisibilityInput', () => {
  it('requires a ledger id for a hand-entered claim', () => {
    const body = { statement: goodClaim.claim, check: goodClaim.check }
    expect(addClaimInput.safeParse(body).success).toBe(false)
    expect(addClaimInput.safeParse({ ...body, ledgerId: 'L1' }).success).toBe(true)
  })

  it('only knows private and public', () => {
    expect(setVisibilityInput.safeParse({ ledgerId: 'L1', visibility: 'public' }).success).toBe(true)
    expect(setVisibilityInput.safeParse({ ledgerId: 'L1', visibility: 'unlisted' }).success).toBe(false)
  })
})

describe('firstIssue', () => {
  it('names an unknown field plainly', () => {
    const result = fileClaimToolInput.safeParse({ ...goodClaim, verdict: 'verified' })
    expect(result.success).toBe(false)
    if (!result.success) expect(firstIssue(result.error)).toBe('Unknown field: verdict.')
  })
})
