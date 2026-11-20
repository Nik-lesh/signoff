/** The ledger as a Markdown summary, to paste into a pull request or a write-up. */

import { useMemo } from 'react'
import { Download } from 'lucide-react'
import { Button, Modal, Textarea, useToast } from '@/components/ui'
import { CopyButton } from '@/components/CopyButton'
import { ledgerToMarkdown } from '@/lib/export'
import type { ClaimView, LedgerData } from '@/lib/ledger'

interface ExportDialogProps {
  ledger: LedgerData
  claims: ClaimView[]
  open: boolean
  onClose: () => void
}

export function ExportDialog({ ledger, claims, open, onClose }: ExportDialogProps) {
  const toast = useToast()
  // Rebuilt each time the dialog opens, so the export date and contents are current.
  const markdown = useMemo(
    () => (open ? ledgerToMarkdown(ledger, claims, Date.now()) : ''),
    [open, ledger, claims],
  )

  function download() {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `signoff-${ledger.slug}.md`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast.success('Summary downloaded')
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <Modal.Header>
        <Modal.Title>Export summary</Modal.Title>
        <Modal.Description>
          Built from the ledger as it stands now: what was claimed, what was verified, what was
          wrong, and what was never checked.
        </Modal.Description>
      </Modal.Header>
      <Modal.Body>
        <Textarea
          readOnly
          aria-label="Ledger summary in Markdown"
          value={markdown}
          rows={16}
          className="resize-y bg-sheet font-agent text-[0.78rem] leading-relaxed md:text-[0.78rem]"
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline" onClick={download}>
          <Download aria-hidden />
          Download .md
        </Button>
        <CopyButton
          size="default"
          variant="default"
          text={markdown}
          label="Copy summary"
          copied="Summary copied"
        />
      </Modal.Footer>
    </Modal>
  )
}
