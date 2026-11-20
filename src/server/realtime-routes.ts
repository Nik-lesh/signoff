/**
 * WebSocket routing for the app's one Durable Object room.
 *
 * Signoff keeps everything (ledgers, claims, verdicts, users) in a single
 * record room, `app:<DEEPSPACE_APP_ID>`. This file routes to that room and to
 * nothing else. The scaffold also routes Yjs, canvas, presence, cron and job
 * rooms, and lets a caller name any record room; Signoff uses none of that,
 * so those routes are not registered here. The room classes are still
 * exported from worker.ts because the deploy manifest expects them.
 *
 * Caller identity in query parameters and headers is never trusted. The route
 * verifies the token, scrubs caller-supplied identity, and forwards the
 * verified identity in internal-only headers. A connection with no token is a
 * signed-out visitor: the room serves it published rows only and takes no
 * writes from it (the rules are in src/schemas/ledger-schemas.ts). An
 * agent-scoped token is not a session token and is refused here.
 */

import type { Hono } from 'hono'
import { authenticatedRoomRequest, verifyJwt } from 'deepspace/worker'
import type { JwtVerifierConfig, VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'

function jwtConfig(env: Env): JwtVerifierConfig {
  return { publicKey: env.AUTH_JWT_PUBLIC_KEY, issuer: env.AUTH_JWT_ISSUER }
}

export function registerRealtimeRoutes(app: Hono<AppContext>): void {
  app.get('/ws/:roomId', async (c) => {
    const roomId = c.req.param('roomId')
    if (roomId !== `app:${c.env.DEEPSPACE_APP_ID}`) {
      return new Response('Not found', { status: 404 })
    }

    const token = new URL(c.req.url).searchParams.get('token')
    let auth: VerifyResult | null = null
    if (token) {
      auth = (await verifyJwt(jwtConfig(c.env), token)).result
      if (!auth) return new Response('Unauthorized', { status: 401 })
    }

    const room = c.env.RECORD_ROOMS.get(c.env.RECORD_ROOMS.idFromName(roomId))
    return room.fetch(authenticatedRoomRequest(c.req.raw, auth, undefined))
  })

  // Any other /ws/ address ends here with a plain 404. Without this, an
  // unmatched upgrade request would fall through to the static-asset handler,
  // which is not built to answer one (locally it takes the dev server down).
  app.all('/ws/*', () => new Response('Not found', { status: 404 }))
}
