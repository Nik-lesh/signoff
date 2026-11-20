/**
 * Integrations this app may call, and who pays for each call.
 *
 * Signoff calls none, so the list is empty and the proxy route in
 * src/server/http-routes.ts answers 404 for every integration. That is
 * deliberate. The scaffold's default is the opposite: an integration that is
 * not listed is callable by any signed-in person and billed to the app owner.
 *
 * To add one, list it here with its billing mode:
 *
 * - 'developer': the app owner pays.
 * - 'user': the calling user pays.
 *
 * Every integration requires a signed-in caller. `anonymous: true` on a
 * 'developer' integration lets signed-out visitors call it too, and the owner
 * then pays for anyone who can reach the app.
 *
 * Any integration backed by per-user connected accounts (Google, Composio)
 * must be 'user': the api-worker resolves the account from the JWT subject.
 */

export const integrations: Record<
  string,
  { billing: 'developer' | 'user'; anonymous?: boolean }
> = {}
