import { describe, expect, it } from 'vitest'
import claims from '../claims/build.json'
import { fileClaimToolInput } from './lib/validation'

/**
 * claims/build.json holds the claims the coding agent made about this app's
 * own build. scripts/file-claims.mjs files them through the agent door, and a
 * claim cannot be edited or removed on its own once filed, so the file is checked here
 * first: every entry must be something `file_claim` would accept.
 */
describe('claims/build.json', () => {
  it('holds only claims the file_claim tool would accept', () => {
    expect(claims.length).toBeGreaterThan(0)
    const statements = claims.map((claim) => claim.claim)
    for (const entry of claims) {
      // "followsClaim" quotes an earlier claim in this file; the filing script
      // turns it into the id the tool takes as `follows`.
      const { followsClaim, ...claim } = entry as typeof entry & { followsClaim?: string }
      if (followsClaim !== undefined) {
        expect(statements.indexOf(followsClaim), `${claim.claim} follows a claim in this file`).toBeGreaterThan(-1)
        expect(statements.indexOf(followsClaim)).toBeLessThan(statements.indexOf(claim.claim))
      }
      const parsed = fileClaimToolInput.safeParse({ ...claim, ledger: 'signoff-build', agent: 'coding-agent' })
      const reason = parsed.success ? '' : parsed.error.issues.map((issue) => issue.message).join('; ')
      expect(reason, claim.claim).toBe('')
    }
  })

  it('never states the same claim twice', () => {
    const statements = claims.map((claim) => claim.claim)
    expect(new Set(statements).size).toBe(statements.length)
  })
})
