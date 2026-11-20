/**
 * How to name this app on the `deepspace agent` command line.
 *
 * The CLI accepts an app name or a full URL. A deployed app lives at
 * https://<name>.app.space, so the name alone is enough there; anywhere else
 * (local dev) the full origin is the only thing that identifies it.
 */
export function agentTarget(origin: string): string {
  try {
    const { hostname } = new URL(origin)
    const suffix = '.app.space'
    if (hostname.endsWith(suffix)) {
      const label = hostname.slice(0, -suffix.length)
      if (label && !label.includes('.')) return label
    }
  } catch {
    // Fall through to the raw value.
  }
  return origin
}

export interface AgentSnippets {
  /** One command that files a harmless first claim, to prove the connection. */
  firstClaim: string
  /** Lists the tools and their input schemas. */
  listTools: string
  /** Instructions to paste into the file the agent reads, such as AGENTS.md. */
  instructions: string
}

export function agentSnippets(target: string, slug: string): AgentSnippets {
  const firstClaimInput = JSON.stringify({
    ledger: slug,
    claim: 'My agent can file claims into this ledger',
    check: 'See this claim appear in the ledger without reloading the page',
    stakes: 'low',
  })
  const wrongInput = JSON.stringify({ ledger: slug, status: 'wrong' })
  const claimTemplate = JSON.stringify(
    {
      ledger: slug,
      claim: 'One specific, checkable statement',
      check: 'How I can verify it myself in a few minutes',
      stakes: 'low | medium | high',
      ref: 'commit, file path or https link (optional)',
      agent: 'your name (optional)',
      follows: 'id of the claim this one fixes (optional)',
    },
    null,
    2,
  )

  return {
    firstClaim: `npx deepspace agent invoke ${target} file_claim --input '${firstClaimInput}'`,
    listTools: `npx deepspace agent tools ${target}`,
    instructions: [
      '## Signoff',
      '',
      'Before you tell me that something is done or true (tests pass, a bug is fixed, a permission is enforced, an assumption you relied on), file it as a claim:',
      '',
      '```sh',
      `npx deepspace agent invoke ${target} file_claim --input-file claim.json --json`,
      '```',
      '',
      '`claim.json`:',
      '',
      '```json',
      claimTemplate,
      '```',
      '',
      'File one claim per call. Never put secrets or credentials in a claim: a claim cannot be edited or removed on its own. You cannot mark a claim verified; I do that.',
      '',
      'Before you continue work, read what I marked wrong and fix it:',
      '',
      '```sh',
      `npx deepspace agent invoke ${target} list_claims --input '${wrongInput}' --json`,
      '```',
      '',
      'When you have fixed one, file a new claim for the fix and set `follows` to the id of the claim I marked wrong. A claim that already lists `followedBy` has a fix on file: skip it unless that fix was marked wrong too.',
      '',
    ].join('\n'),
  }
}
