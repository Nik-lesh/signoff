/**
 * Where the ledger's owner rules on a claim.
 *
 * The verdict goes to the `recordVerdict` server action with the person's
 * session token. The same schema validates it here (for the inline message)
 * and again on the server (for real).
 */

import { useId, useState } from 'react'
import { Button, Label, Textarea, useToast } from '@/components/ui'
import { callAction, messageOf } from '@/lib/actions-client'
import { LIMITS, type ClaimView, type VerdictStatus } from '@/lib/ledger'
import { firstIssue, recordVerdictInput } from '@/lib/validation'

const TOAST: Record<VerdictStatus, string> = {
  verified: 'Marked verified',
  wrong: 'Marked wrong',
  skipped: 'Marked not checked',
}

interface SignoffFormProps {
  claim: ClaimView
  /** Present when revising an existing verdict. */
  onCancel?: () => void
}

export function SignoffForm({ claim, onCancel }: SignoffFormProps) {
  const noteId = useId()
  const errorId = useId()
  const toast = useToast()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<VerdictStatus | null>(null)

  async function rule(status: VerdictStatus) {
    const parsed = recordVerdictInput.safeParse({
      claimId: claim.id,
      status,
      note: note.trim() || undefined,
    })
    if (!parsed.success) {
      setError(firstIssue(parsed.error).replace(/^note: /, ''))
      return
    }
    setError(null)
    setPending(status)
    try {
      await callAction('recordVerdict', parsed.data)
      toast.success(TOAST[status])
      // The row re-renders from the verdict the record room sends back, and
      // the row closes this form when that verdict arrives.
    } catch (caught) {
      toast.error('Verdict not recorded', messageOf(caught))
    } finally {
      setPending(null)
    }
  }

  return (
    <form
      data-testid="signoff-form"
      onSubmit={(event) => event.preventDefault()}
      aria-label={`Your verdict on: ${claim.statement}`}
    >
      <Label htmlFor={noteId} className="text-[0.85rem]">
        What did you do to check it?
      </Label>
      <Textarea
        id={noteId}
        value={note}
        onChange={(event) => {
          setNote(event.target.value)
          if (error) setError(null)
        }}
        rows={3}
        maxLength={LIMITS.note}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        placeholder="Ran it on a clean checkout: 80 passed"
        className="mt-1.5 bg-sheet font-person text-[0.95rem] text-ink placeholder:text-pencil"
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-[0.8rem] text-redpen">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={pending === 'verified'}
          disabled={pending !== null}
          onClick={() => rule('verified')}
        >
          Mark verified
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-redpen text-redpen hover:bg-redpen hover:text-destructive-foreground"
          loading={pending === 'wrong'}
          disabled={pending !== null}
          onClick={() => rule('wrong')}
        >
          Mark wrong
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={pending === 'skipped'}
          disabled={pending !== null}
          onClick={() => rule('skipped')}
        >
          Mark not checked
        </Button>
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 text-[0.8rem] text-pencil underline underline-offset-2 hover:text-print"
        >
          Keep the current verdict
        </button>
      )}
    </form>
  )
}
