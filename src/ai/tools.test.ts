import { describe, expect, it } from 'vitest'
import type { AgentToolContext, UserToolExecutor } from 'deepspace/worker'
import type { Env } from '../../worker'
import { buildTools } from './tools'

/**
 * The agent surface is a product rule, so it gets a test of its own: an agent
 * can read and file claims, and nothing here lets it record a verdict or reach
 * the generic record tools. If someone adds a tool, this fails until they come
 * here and say so.
 */

const executor = (() => {
  throw new Error('the generic record executor must never be called')
}) as unknown as UserToolExecutor

/** Enough of the worker context to build the tools; nothing here is ever fetched. */
const context = {
  env: {
    RECORD_ROOMS: {
      idFromName: () => 'room',
      get: () => ({
        fetch: () => {
          throw new Error('building the tool list must not touch the record room')
        },
      }),
    },
  },
  userId: 'user_test',
  request: new Request('https://signoff.app.space/_deepspace/agent/tools'),
} as unknown as AgentToolContext<Env>

describe('agent tools', () => {
  it('are exactly list_ledgers, file_claim and list_claims', () => {
    expect(Object.keys(buildTools(executor, context)).sort()).toEqual([
      'file_claim',
      'list_claims',
      'list_ledgers',
    ])
  })

  it('include nothing that records a verdict or writes records generically', () => {
    for (const name of Object.keys(buildTools(executor, context))) {
      expect(name).not.toMatch(/verdict|verify|sign|records?\.|update|delete|publish|visibility/i)
    }
  })

  it('describe every tool and publish an input schema for it', () => {
    for (const [name, tool] of Object.entries(buildTools(executor, context))) {
      expect(tool.description, name).toMatch(/\S{3,}/)
      expect(tool.inputSchema, name).toBeTruthy()
    }
  })

  it('refuse verdict fields on file_claim before anything is written', async () => {
    const fileClaim = buildTools(executor, context).file_claim
    const schema = fileClaim.inputSchema as {
      validate?: (value: unknown) => unknown
    }
    const result = (await schema.validate?.({
      claim: 'All unit tests pass',
      check: 'Run npm run test:unit',
      status: 'verified',
    })) as { success: boolean }
    expect(result.success).toBe(false)
  })

  it('offer no tools when there is no caller', () => {
    expect(Object.keys(buildTools(executor, undefined))).toEqual([])
  })
})
