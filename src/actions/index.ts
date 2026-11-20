/**
 * Server actions: what a signed-in person can do from the browser.
 *
 * Each one is reached at POST /api/actions/<name>, behind `resolveAuth` in
 * src/server/action-routes.ts. That check accepts a person's session token
 * and rejects an agent-scoped token (different issuer, and a `scope` claim
 * the session verifier refuses), so nothing in this file can be called by a
 * coding agent using the credential the CLI gives it. `recordVerdict` living
 * here, and nowhere in src/ai/tools.ts, is the product's central rule.
 *
 * The actions stay thin on purpose. Validation and ownership checks are in
 * src/server/ledger-service.ts so both doors share them.
 */

import type { ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import { addClaimInput, firstIssue } from '../lib/validation'
import {
  createLedger,
  deleteLedger,
  fileClaim,
  ownedLedger,
  recordVerdict,
  setVisibility,
  type ServiceResult,
} from '../server/ledger-service'

function respond<T>(result: ServiceResult<T>): ActionResult {
  return result.ok
    ? { success: true, data: result.value }
    : { success: false, error: result.message, code: result.code }
}

export const actions: Record<string, ActionHandler<Env>> = {
  /** Start a ledger. It is private until its owner publishes it. */
  createLedger: async ({ userId, params, tools }) =>
    respond(await createLedger(tools, { id: userId }, params)),

  /** A claim typed by a person, for agents that cannot call the tool themselves. */
  addClaim: async ({ userId, params, tools }) => {
    const parsed = addClaimInput.safeParse(params)
    if (!parsed.success) {
      return { success: false, error: firstIssue(parsed.error), code: 'invalid_input' }
    }
    const caller = { id: userId }
    const ledger = await ownedLedger(tools, caller, parsed.data.ledgerId)
    if (!ledger.ok) return respond(ledger)
    const { ledgerId: _ledgerId, ...fields } = parsed.data
    return respond(await fileClaim(tools, caller, ledger.value, fields, 'manual'))
  },

  /** Verified, wrong, or not checked. A person's call, recorded as a new row every time. */
  recordVerdict: async ({ userId, params, tools }) =>
    respond(await recordVerdict(tools, { id: userId }, params)),

  /** Publish or unpublish. Returns `done: false` while rows remain; call again until done. */
  setLedgerVisibility: async ({ userId, params, tools }) =>
    respond(await setVisibility(tools, { id: userId }, params)),

  /** Remove a ledger and everything in it. The only delete there is; same `done` contract. */
  deleteLedger: async ({ userId, params, tools }) =>
    respond(await deleteLedger(tools, { id: userId }, params)),
}
