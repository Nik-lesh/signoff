/**
 * How to point a coding agent at this ledger.
 *
 * Shown in place of the sheet while a ledger is empty, and in a dialog
 * afterwards. The three steps are a real sequence, so they are numbered.
 */

import { CodeBlock } from '@/components/CodeBlock'
import { CopyButton } from '@/components/CopyButton'
import { agentSnippets, agentTarget } from '@/lib/agent-target'

export function ConnectAgent({ slug }: { slug: string }) {
  const snippets = agentSnippets(agentTarget(window.location.origin), slug)

  return (
    <ol className="space-y-7 text-[0.92rem] leading-relaxed text-print">
      <li>
        <p>
          <span className="font-semibold">1. Sign in to the DeepSpace CLI</span> on the machine
          where your agent runs. You do this once; your agent then acts with your login.
        </p>
        <CodeBlock className="mt-2">npx deepspace auth login</CodeBlock>
      </li>

      <li>
        <p>
          <span className="font-semibold">2. File a first claim</span> to check the connection. It
          shows up in this ledger without a reload.
        </p>
        <CodeBlock className="mt-2">{snippets.firstClaim}</CodeBlock>
        <CopyButton
          className="mt-2"
          text={snippets.firstClaim}
          label="Copy command"
          copied="Command copied"
        />
      </li>

      <li>
        <p>
          <span className="font-semibold">3. Tell your agent to file claims as it works.</span>{' '}
          Paste this into the instructions file it reads, such as AGENTS.md.
        </p>
        <CodeBlock className="mt-2 max-h-72 overflow-y-auto">{snippets.instructions}</CodeBlock>
        <CopyButton
          className="mt-2"
          text={snippets.instructions}
          label="Copy instructions"
          copied="Instructions copied"
        />
      </li>
    </ol>
  )
}
