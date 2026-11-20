/**
 * Calls a server action as the signed-in person.
 *
 * The token comes from the SDK's `getAuthToken`, which exchanges the browser's
 * session cookie for a short-lived JWT. This is the "person" door described in
 * src/actions/index.ts.
 */

import { getAuthToken } from 'deepspace'

export class ActionError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ActionError'
    this.code = code
  }
}

interface ActionEnvelope<T> {
  success?: boolean
  data?: T
  error?: string
  code?: string
}

export async function callAction<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new ActionError('Sign in to do that.', 'unauthenticated')

  let response: Response
  try {
    response = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
  } catch {
    throw new ActionError('Could not reach Signoff. Check your connection and try again.', 'network')
  }

  let body: ActionEnvelope<T> | null = null
  try {
    body = (await response.json()) as ActionEnvelope<T>
  } catch {
    body = null
  }

  if (response.status === 401) {
    throw new ActionError('Your session expired. Sign in again.', 'unauthenticated')
  }
  if (!response.ok || !body || body.success !== true) {
    throw new ActionError(body?.error ?? 'That did not go through. Try again.', body?.code)
  }
  return body.data as T
}

/** A message fit for a toast, whatever was thrown. */
export function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'That did not go through. Try again.'
}
