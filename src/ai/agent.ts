/**
 * The agent's door: the routes a coding agent uses to reach Signoff.
 *
 * `registerAgentToolRoutes` (from the SDK) serves the tools in src/ai/tools.ts
 * over HTTP and MCP under /_deepspace/agent. A local agent reaches them with
 * `npx deepspace agent invoke`, which first exchanges the developer's login
 * for an agent-scoped token for this app's exact origin.
 *
 * Two things were removed from the scaffold here, both on purpose:
 *
 * - `resolveBrowserAccess`, which serves the same tools to a browser session.
 *   A browser session is a person's credential, and this app's rule is that
 *   the agent's door and the person's door stay separate, so the tools answer
 *   to an agent-scoped token and nothing else.
 * - the in-app AI chat routes. Signoff makes no model calls of its own.
 */

import type { Hono } from 'hono'
import { registerAgentToolRoutes, resolveAppMembership } from 'deepspace/worker'
import type { AgentToolAccessResult, AgentToolRouteOptions } from 'deepspace/worker'
import { resolveAgentAuth } from '../server/http-routes.js'
import type { AppContext, Env } from '../../worker.js'

/** `buildTools` from src/ai/tools.ts. */
type ToolFactory = AgentToolRouteOptions<Env>['buildTools']

/**
 * Who may call the tools: a caller with a valid agent-scoped token for this
 * origin who is also a member of the app.
 *
 * Membership has one definition, the caller's row in the `users` collection
 * of the app's record room. A signed-in visit to the app creates it, and the
 * app owner is always a member. A membership read that could not complete is
 * 503 (retryable), never 403: a transient failure must not look like a
 * permission denial.
 */
async function resolveAgentAccess(request: Request, env: Env): Promise<AgentToolAccessResult> {
  const auth = await resolveAgentAuth(request, env)
  if (!auth) return { ok: false, status: 401 }

  const membership = await resolveAppMembership(env, auth.userId, request.signal, {})
  if (!membership) return { ok: false, status: 503 }
  if (!membership.member) return { ok: false, status: 403 }

  return { ok: true, auth }
}

export function registerAgentTools(app: Hono<AppContext>, buildTools: ToolFactory): void {
  registerAgentToolRoutes(app, { buildTools, resolveAccess: resolveAgentAccess })
}
