/**
 * Input validation shared by the server actions and the agent tools.
 *
 * Every write to Signoff passes one of these schemas on the server, whichever
 * door it came through. The browser forms reuse them for inline messages, but
 * the server never relies on that.
 */

import { z } from 'zod/v4'
import { LIMITS, STAKES, VERDICT_STATUSES } from './ledger'

/**
 * A claim or a verdict note cannot be edited or removed on its own, and a
 * ledger can be made public. A pasted credential would be stuck there until
 * the whole ledger was deleted, so text that matches a well-known secret
 * format is refused at the door. The list is deliberately short and specific:
 * a false refusal costs a rewrite, a miss costs a leak.
 */
const SECRET_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: 'a GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/ },
  { label: 'an AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'an API key', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { label: 'a Stripe live key', pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}/ },
  { label: 'a Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  {
    label: 'a signed token (JWT)',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
]

/** Returns what the text looks like it contains ("a GitHub token"), or null. */
export function findLikelySecret(value: string): string | null {
  for (const { label, pattern } of SECRET_PATTERNS) {
    if (pattern.test(value)) return label
  }
  return null
}

const noSecret = (value: string, ctx: z.RefinementCtx) => {
  const found = findLikelySecret(value)
  if (found) {
    ctx.addIssue({
      code: 'custom',
      message: `This looks like it contains ${found}. An entry cannot be edited or removed on its own, so take it out and try again.`,
    })
  }
}

/** Trimmed text with a length cap that must not look like a credential. */
const safeText = (max: number) => z.string().trim().max(max).superRefine(noSecret)

const statement = safeText(LIMITS.statement).min(8, 'Say what is being claimed, in at least 8 characters.')
const check = safeText(LIMITS.check).min(8, 'Say how a person can check this, in at least 8 characters.')
const stakes = z.enum(STAKES)
const ref = safeText(LIMITS.ref)
const recordId = z.string().trim().min(1).max(64)

/** Only https links are stored, because the ledger page renders this as a link. */
const repoUrl = z
  .string()
  .trim()
  .max(LIMITS.repoUrl)
  .refine((value) => {
    if (value === '') return true
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && url.hostname.includes('.')
    } catch {
      return false
    }
  }, 'Use a full https:// link, or leave this empty.')

export const createLedgerInput = z.strictObject({
  name: z.string().trim().min(2, 'Give the ledger a name of at least 2 characters.').max(LIMITS.ledgerName),
  repoUrl: repoUrl.optional(),
})
export type CreateLedgerInput = z.infer<typeof createLedgerInput>

/** A claim typed by a signed-in person in the app. */
export const addClaimInput = z.strictObject({
  ledgerId: recordId,
  statement,
  check,
  stakes: stakes.optional(),
  ref: ref.optional(),
})
export type AddClaimInput = z.infer<typeof addClaimInput>

/** What an agent sends to the `file_claim` tool. Descriptions are shown to the agent. */
export const fileClaimToolInput = z.strictObject({
  claim: statement.describe(
    'One specific, checkable statement about the work you just did, for example "Non-members cannot read a private ledger". One claim per call.',
  ),
  check: check.describe(
    'How a person can verify the claim themselves in a few minutes: the command to run, the page to open, or the file and lines to read.',
  ),
  stakes: stakes
    .optional()
    .describe('How bad it is if the claim is false: low, medium (default) or high. High-stakes claims are reviewed first.'),
  ref: ref
    .optional()
    .describe('Where to look: a commit hash, a file path, or an https link. Optional.'),
  agent: safeText(LIMITS.agentName)
    .optional()
    .describe('A name for yourself, for example "coding-agent". Optional.'),
  ledger: z
    .string()
    .trim()
    .max(LIMITS.slug)
    .optional()
    .describe('Slug of the ledger to file into. Optional when you have exactly one ledger; call list_ledgers to see them.'),
  follows: recordId
    .optional()
    .describe(
      'Id of an earlier claim in the same ledger that this claim follows up on, for example the fix for a claim a person marked wrong. Ids come from list_claims. Optional.',
    ),
})
export type FileClaimToolInput = z.infer<typeof fileClaimToolInput>

export const listClaimsToolInput = z.strictObject({
  ledger: z
    .string()
    .trim()
    .max(LIMITS.slug)
    .optional()
    .describe('Slug of the ledger to read. Optional when you have exactly one ledger.'),
  status: z
    .enum(['new', ...VERDICT_STATUSES])
    .optional()
    .describe('Only return claims in this state. Use "wrong" to find claims a person refuted, so you can fix them.'),
})
export type ListClaimsToolInput = z.infer<typeof listClaimsToolInput>

export const listLedgersToolInput = z.strictObject({})

export const recordVerdictInput = z
  .strictObject({
    claimId: recordId,
    status: z.enum(VERDICT_STATUSES),
    note: safeText(LIMITS.note).optional(),
  })
  .superRefine((value, ctx) => {
    const needsNote = value.status !== 'skipped'
    if (needsNote && (value.note ?? '').length < LIMITS.noteMinWhenChecked) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Say what you did to check it, in at least 8 characters.',
      })
    }
  })
export type RecordVerdictInput = z.infer<typeof recordVerdictInput>

export const setVisibilityInput = z.strictObject({
  ledgerId: recordId,
  visibility: z.enum(['private', 'public']),
})
export type SetVisibilityInput = z.infer<typeof setVisibilityInput>

export const deleteLedgerInput = z.strictObject({ ledgerId: recordId })

/** First validation message, phrased for a person. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'That input is not valid.'
  if (issue.code === 'unrecognized_keys') {
    return `Unknown field: ${issue.keys.join(', ')}.`
  }
  const field = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
  return `${field}${issue.message}`
}
