import { describe, expect, it } from 'vitest'
import { agentSnippets, agentTarget } from './agent-target'

describe('agentTarget', () => {
  it('uses the app name for a deployed app', () => {
    expect(agentTarget('https://signoff.app.space')).toBe('signoff')
  })

  it('uses the full origin anywhere else', () => {
    expect(agentTarget('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173')
    expect(agentTarget('https://ledger.example.com')).toBe('https://ledger.example.com')
    expect(agentTarget('https://a.b.app.space')).toBe('https://a.b.app.space')
  })
})

describe('agentSnippets', () => {
  const snippets = agentSnippets('signoff', 'my-build')

  it('names the app and the ledger in every command', () => {
    expect(snippets.firstClaim).toContain('npx deepspace agent invoke signoff file_claim')
    expect(snippets.firstClaim).toContain('"ledger":"my-build"')
    expect(snippets.listTools).toBe('npx deepspace agent tools signoff')
    expect(snippets.instructions).toContain('"ledger": "my-build"')
  })

  it('produces a first-claim input the tool schema accepts', async () => {
    const { fileClaimToolInput } = await import('./validation')
    const json = snippets.firstClaim.slice(snippets.firstClaim.indexOf("'") + 1, -1)
    expect(fileClaimToolInput.safeParse(JSON.parse(json)).success).toBe(true)
  })

  it('tells the agent it cannot verify its own claims', () => {
    expect(snippets.instructions).toContain('You cannot mark a claim verified')
  })

  it('tells the agent to read what was marked wrong and file its fix as a follow-up', () => {
    expect(snippets.instructions).toContain('"status":"wrong"')
    expect(snippets.instructions).toContain('"follows": "id of the claim this one fixes (optional)"')
    expect(snippets.instructions).toContain('set `follows` to the id of the claim I marked wrong')
    expect(snippets.instructions).toContain('already lists `followedBy` has a fix on file')
  })
})
