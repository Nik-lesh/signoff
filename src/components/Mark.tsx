import { cn } from '@/lib/utils'

/** Signoff's mark, the same as the favicon: a signature tick in blue ink. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('h-6 w-6 shrink-0', className)}>
      <rect width="32" height="32" rx="6" className="fill-ink" />
      <path
        d="M8 17.5l5.2 5.2L24.5 10"
        fill="none"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
    </svg>
  )
}
