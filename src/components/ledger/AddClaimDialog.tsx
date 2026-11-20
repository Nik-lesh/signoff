/**
 * A claim typed by a person: for an agent that cannot run the CLI itself, or
 * for something it said in a chat. It is stored as "manual", never "agent".
 */

import { useId, useState, type FormEvent } from 'react'
import { Button, Input, Label, Modal, Textarea, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import { callAction, messageOf } from '@/lib/actions-client'
import { LIMITS, STAKES, type Stakes } from '@/lib/ledger'
import { addClaimInput, firstIssue } from '@/lib/validation'

interface AddClaimDialogProps {
  ledgerId: string
  open: boolean
  onClose: () => void
}

type Field = 'statement' | 'check' | 'ref'

const STAKES_LABEL: Record<Stakes, string> = { low: 'Low', medium: 'Medium', high: 'High' }

export function AddClaimDialog({ ledgerId, open, onClose }: AddClaimDialogProps) {
  const statementId = useId()
  const checkId = useId()
  const refId = useId()
  const errorId = useId()
  const toast = useToast()
  const [statement, setStatement] = useState('')
  const [check, setCheck] = useState('')
  const [stakes, setStakes] = useState<Stakes>('medium')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<{ field: Field; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = addClaimInput.safeParse({
      ledgerId,
      statement,
      check,
      stakes,
      ref: reference.trim() || undefined,
    })
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path[0]
      setError({
        field: path === 'check' || path === 'ref' ? path : 'statement',
        message: firstIssue(parsed.error).replace(/^(statement|check|ref): /, ''),
      })
      return
    }
    setError(null)
    setSaving(true)
    try {
      await callAction('addClaim', parsed.data)
      toast.success('Claim added')
      setStatement('')
      setCheck('')
      setReference('')
      setStakes('medium')
      onClose()
    } catch (caught) {
      toast.error('Claim not added', messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  const describedBy = (field: Field) => (error?.field === field ? errorId : undefined)
  const message = (field: Field) =>
    error?.field === field && (
      <p id={errorId} role="alert" className="mt-1.5 text-[0.8rem] text-redpen">
        {error.message}
      </p>
    )

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
        <Modal.Header>
          <Modal.Title>Add a claim by hand</Modal.Title>
          <Modal.Description>
            For something your agent told you outside the CLI. A claim cannot be edited or removed
            afterwards, short of deleting the ledger.
          </Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <div>
            <Label htmlFor={statementId}>What was claimed</Label>
            <Textarea
              id={statementId}
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              rows={2}
              maxLength={LIMITS.statement}
              placeholder="All 41 unit tests pass on Node 24"
              autoFocus
              aria-invalid={error?.field === 'statement' ? true : undefined}
              aria-describedby={describedBy('statement')}
              className="mt-1.5 bg-sheet font-agent text-[0.88rem]"
            />
            {message('statement')}
          </div>
          <div>
            <Label htmlFor={checkId}>How to check it</Label>
            <Textarea
              id={checkId}
              value={check}
              onChange={(event) => setCheck(event.target.value)}
              rows={2}
              maxLength={LIMITS.check}
              placeholder="Run npm run test:unit and read the summary line"
              aria-invalid={error?.field === 'check' ? true : undefined}
              aria-describedby={describedBy('check')}
              className="mt-1.5 bg-sheet font-agent text-[0.88rem]"
            />
            {message('check')}
          </div>
          <fieldset>
            <legend className="text-sm font-medium leading-none">How bad if it is false</legend>
            <div role="radiogroup" className="mt-2 inline-flex rounded-md border border-input">
              {STAKES.map((level) => (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={stakes === level}
                  onClick={() => setStakes(level)}
                  className={cn(
                    'px-3.5 py-1.5 text-sm first:rounded-l-[3px] last:rounded-r-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    stakes === level
                      ? 'bg-print text-background'
                      : 'text-pencil hover:bg-secondary hover:text-print',
                  )}
                >
                  {STAKES_LABEL[level]}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <Label htmlFor={refId}>Reference (optional)</Label>
            <Input
              id={refId}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={LIMITS.ref}
              placeholder="src/server/ledger-service.ts"
              aria-invalid={error?.field === 'ref' ? true : undefined}
              aria-describedby={describedBy('ref')}
              className="mt-1.5 bg-sheet font-agent text-[0.85rem]"
            />
            {message('ref')}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Add claim
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}
