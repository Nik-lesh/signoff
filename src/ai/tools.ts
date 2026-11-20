/**
 * Agent tools: everything a coding agent can do in Signoff.
 *
 * worker.ts serves these at /_deepspace/agent (HTTP and MCP) through the
 * SDK's `registerAgentToolRoutes`. A local agent reaches them with
 *
 *   npx deepspace agent tools <app>
 *   npx deepspace agent invoke <app> file_claim --input '{...}'
 *
 * which authenticates with an agent-scoped token for this app's origin.
 *
 * The list below is the whole surface, on purpose:
 *   list_ledgers   read
 *   file_claim     write a claim
 *   list_claims    read claims and what a person ruled on them
 *
 * There is no tool that records a verdict, and the scaffold's generic record
 * tools (records.create / update / delete) are not exposed. An agent can say
 * what it did; it cannot say that someone checked.
 *
 * The tools reach records through `createActionTools`, the RBAC-off path, so
 * each one resolves the ledger through the caller's own ledgers before it
 * reads or writes (see src/server/ledger-service.ts).
 */

import { jsonSchema, tool } from 'ai'
import type { ToolSet } from 'ai'
import { z } from 'zod/v4'
import { AgentToolError } from 'deepspace/worker'
import type { AgentToolContext, UserToolExecutor } from 'deepspace/worker'
import type { Env } from '../../worker'
import { fileClaimToolInput, listClaimsToolInput, listLedgersToolInput } from '../lib/validation'
import { createActionTools } from '../server/action-routes'
import {
  fileClaim,
  listClaims,
  listLedgers,
  ownedLedgerBySlug,
  type ServiceErrorCode,
  type ServiceResult,
} from '../server/ledger-service'

const HTTP_STATUS: Record<ServiceErrorCode, number> = {
  invalid_input: 400,
  not_found: 404,
  limit_reached: 409,
  unavailable: 503,
}

/** Turn an expected refusal into one the agent can read and act on. */
function valueOf<T>(result: ServiceResult<T>): T {
  if (result.ok) return result.value
  throw new AgentToolError(result.code, result.message, HTTP_STATUS[result.code])
}

/**
 * Publish a Zod schema as the tool's JSON Schema and validate with the same
 * schema. Refinements (minimum note length, the secret screen) cannot be
 * expressed in JSON Schema, so they run in `validate` only.
 */
function inputOf<Schema extends z.ZodType>(schema: Schema) {
  return jsonSchema<z.infer<Schema>>(
    z.toJSONSchema(schema, { unrepresentable: 'any' }) as Parameters<typeof jsonSchema>[0],
    {
      validate: async (value) => {
        const result = await schema.safeParseAsync(value)
        return result.success
          ? { success: true, value: result.data }
          : { success: false, error: result.error }
      },
    },
  )
}

export function buildTools(_executor: UserToolExecutor, context?: AgentToolContext<Env>): ToolSet {
  // Without the worker context there is no verified caller to act for.
  if (!context) return {}

  const caller = { id: context.userId }
  const records = createActionTools(context.env, context.userId, '')
  const origin = new URL(context.request.url).origin

  return {
    list_ledgers: tool({
      description:
        'List the Signoff ledgers you can file claims into, with each ledger\'s slug. ' +
        'Ledgers are created by a person in the Signoff web app.',
      inputSchema: inputOf(listLedgersToolInput),
      execute: async () => ({ ledgers: valueOf(await listLedgers(records, caller)) }),
    }),

    file_claim: tool({
      description:
        'File one claim about work you just did so that a person can verify it. ' +
        'Call this each time you are about to report something as done or true: ' +
        'tests passing, a bug fixed, a permission enforced, an assumption you relied on. ' +
        'One specific, checkable claim per call, with how to check it. ' +
        'When the claim is your fix for one a person marked wrong, pass that claim\'s id as `follows`. ' +
        'You cannot mark a claim verified; only a signed-in person can. ' +
        'A claim cannot be edited or removed on its own, so never include secrets or credentials.',
      inputSchema: inputOf(fileClaimToolInput),
      execute: async (input) => {
        const ledger = valueOf(await ownedLedgerBySlug(records, caller, input.ledger || undefined))
        const filed = valueOf(
          await fileClaim(
            records,
            caller,
            ledger,
            {
              statement: input.claim,
              check: input.check,
              stakes: input.stakes,
              ref: input.ref,
              agent: input.agent,
              follows: input.follows,
            },
            'agent',
          ),
        )
        return {
          id: filed.claimId,
          ledger: filed.slug,
          status: 'new',
          url: `${origin}/l/${filed.ledgerId}`,
          next: 'A person rules on it at the url. Call list_claims with status "wrong" to see what they refuted.',
        }
      },
    }),

    list_claims: tool({
      description:
        'Read the claims in a ledger with their current status (new, verified, wrong, skipped) ' +
        'and the note the person wrote. Call it with status "wrong" before continuing work, ' +
        'to find claims a person refuted and fix what they describe. ' +
        'A wrong claim that lists `followedBy` already has a fix on file: ' +
        'leave it alone unless that fix was marked wrong as well.',
      inputSchema: inputOf(listClaimsToolInput),
      execute: async (input) => {
        const ledger = valueOf(await ownedLedgerBySlug(records, caller, input.ledger || undefined))
        return valueOf(await listClaims(records, caller, ledger, input.status))
      },
    }),
  }
}
