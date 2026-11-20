import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Label, Modal, useToast } from '@/components/ui'
import { callAction, messageOf } from '@/lib/actions-client'
import { LIMITS } from '@/lib/ledger'
import { createLedgerInput, firstIssue } from '@/lib/validation'

interface NewLedgerDialogProps {
  open: boolean
  onClose: () => void
}

export function NewLedgerDialog({ open, onClose }: NewLedgerDialogProps) {
  const nameId = useId()
  const repoId = useId()
  const errorId = useId()
  const navigate = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [error, setError] = useState<{ field: 'name' | 'repoUrl'; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = createLedgerInput.safeParse({ name, repoUrl: repoUrl.trim() || undefined })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      setError({
        field: issue?.path[0] === 'repoUrl' ? 'repoUrl' : 'name',
        message: firstIssue(parsed.error).replace(/^(name|repoUrl): /, ''),
      })
      return
    }
    setError(null)
    setSaving(true)
    try {
      const created = await callAction<{ ledgerId: string }>('createLedger', parsed.data)
      toast.success('Ledger created')
      onClose()
      setName('')
      setRepoUrl('')
      navigate(`/l/${created.ledgerId}`)
    } catch (caught) {
      toast.error('Ledger not created', messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
        <Modal.Header>
          <Modal.Title>New ledger</Modal.Title>
          <Modal.Description>
            One ledger per thing you are building. It starts private.
          </Modal.Description>
        </Modal.Header>
        <Modal.Body className="space-y-4">
          <div>
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={LIMITS.ledgerName}
              placeholder="Checkout rewrite"
              autoFocus
              aria-invalid={error?.field === 'name' ? true : undefined}
              aria-describedby={error?.field === 'name' ? errorId : undefined}
              className="mt-1.5 bg-sheet"
            />
            {error?.field === 'name' && (
              <p id={errorId} role="alert" className="mt-1.5 text-[0.8rem] text-redpen">
                {error.message}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor={repoId}>Repository link (optional)</Label>
            <Input
              id={repoId}
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              maxLength={LIMITS.repoUrl}
              inputMode="url"
              placeholder="https://github.com/you/checkout"
              aria-invalid={error?.field === 'repoUrl' ? true : undefined}
              aria-describedby={error?.field === 'repoUrl' ? errorId : undefined}
              className="mt-1.5 bg-sheet font-agent text-[0.85rem]"
            />
            {error?.field === 'repoUrl' && (
              <p id={errorId} role="alert" className="mt-1.5 text-[0.8rem] text-redpen">
                {error.message}
              </p>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Create ledger
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  )
}
