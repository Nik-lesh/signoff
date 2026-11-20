/** One live row of the ledger: the claim, and either its sign-off or the form to give one. */

import { useEffect, useId, useState } from 'react'
import type { ClaimLinks, ClaimView } from '@/lib/ledger'
import { BlankSignoff, ClaimEntry, RowFrame, SignoffMark } from './ClaimParts'
import { SignoffForm } from './SignoffForm'

interface ClaimRowProps {
  claim: ClaimView
  /** Place in filing order, starting at 1. */
  number: number
  /** True for the ledger's owner, the only person who can rule on a claim. */
  canSign: boolean
  /** True for a moment after the claim arrives over the wire, or is jumped to. */
  arrived: boolean
  now: number
  links: ClaimLinks
  onJump: (claimId: string) => void
}

export function ClaimRow({ claim, number, canSign, arrived, now, links, onJump }: ClaimRowProps) {
  const titleId = useId()
  const [revising, setRevising] = useState(false)

  // A new verdict (ours, or one recorded in another tab) closes the form.
  useEffect(() => {
    setRevising(false)
  }, [claim.verdicts.length])

  const showForm = canSign && (claim.status === 'new' || revising)

  return (
    <RowFrame
      claim={claim}
      titleId={titleId}
      arrived={arrived}
      left={
        <ClaimEntry
          claim={claim}
          titleId={titleId}
          number={number}
          now={now}
          links={links}
          onJump={onJump}
        />
      }
      right={
        showForm ? (
          <SignoffForm claim={claim} onCancel={revising ? () => setRevising(false) : undefined} />
        ) : claim.latest ? (
          <SignoffMark
            claim={claim}
            latest={claim.latest}
            onRevise={canSign ? () => setRevising(true) : undefined}
          />
        ) : (
          <BlankSignoff />
        )
      }
    />
  )
}
