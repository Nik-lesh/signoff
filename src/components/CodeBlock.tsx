import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Something a machine types or reads: a command, or a file to paste. Set in the agent's typeface. */
export function CodeBlock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <pre
      className={cn(
        'overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-rule bg-sheet px-3 py-2.5 font-agent text-[0.8rem] leading-relaxed text-print',
        className,
      )}
    >
      {children}
    </pre>
  )
}
