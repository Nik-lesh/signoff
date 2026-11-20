/**
 * One ledger at /l/<id>.
 *
 * This page sits under (app)/ but outside any sign-in gate, because a public
 * ledger is meant to be read by people who are signed out. What a visitor
 * receives is decided by the record room, not by this file: a private ledger
 * that is not theirs arrives as no rows at all.
 */

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuthOverlay, useAuthStatus } from 'deepspace'
import { FileSearch, Globe, Lock, Plus, Terminal, Trash2, Upload } from 'lucide-react'
import { Button, ConfirmModal, EmptyState, Modal, useToast } from '@/components/ui'
import { CopyButton } from '@/components/CopyButton'
import { AddClaimDialog } from '@/components/ledger/AddClaimDialog'
import { ConnectAgent } from '@/components/ledger/ConnectAgent'
import { ExportDialog } from '@/components/ledger/ExportDialog'
import { LedgerSheet } from '@/components/ledger/LedgerSheet'
import { Tally } from '@/components/ledger/Tally'
import { DISPLAY_NAME } from '@/constants'
import { useLedger, type LedgerState } from '@/hooks/useLedger'
import { ActionError, callAction, messageOf } from '@/lib/actions-client'
import type { LedgerData, Visibility } from '@/lib/ledger'

export default function LedgerPage() {
  const { id = '' } = useParams<{ id: string }>()
  const state = useLedger(id)
  const { isSignedIn, userId } = useAuthStatus()
  const navigate = useNavigate()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)

  async function deleteLedger() {
    setDeleting(true)
    try {
      // The server removes rows in batches and says when it is done.
      let done = false
      for (let pass = 0; pass < 40 && !done; pass += 1) {
        const result = await callAction<{ done: boolean }>('deleteLedger', { ledgerId: id })
        done = result.done
      }
      if (!done) {
        throw new ActionError(
          'This ledger is large and is not fully deleted yet. Run this again to finish.',
        )
      }
      toast.success('Ledger deleted')
      navigate('/home', { replace: true })
    } catch (caught) {
      toast.error('Ledger not deleted', messageOf(caught))
      setDeleting(false)
    }
  }

  if (state.phase === 'loading') return <LedgerSkeleton />
  if (state.phase === 'error') return <LedgerProblem />
  if (state.phase === 'missing' || !state.ledger) {
    // The ledger row leaves the live query a moment before the delete call
    // returns. Say what is happening instead of "no ledger here".
    if (deleting) return <LedgerLeaving />
    return <LedgerMissing signedIn={isSignedIn} />
  }

  return (
    <LedgerView
      state={state}
      ledger={state.ledger}
      isOwner={Boolean(userId) && userId === state.ledger.ownerId}
      deleting={deleting}
      onDelete={deleteLedger}
    />
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-8 sm:pt-10">{children}</div>
}

interface LedgerViewProps {
  state: LedgerState
  ledger: LedgerData
  isOwner: boolean
  deleting: boolean
  onDelete: () => void
}

function LedgerView({ state, ledger, isOwner, deleting, onDelete }: LedgerViewProps) {
  const toast = useToast()
  const [dialog, setDialog] = useState<'connect' | 'add' | 'export' | null>(null)
  const [confirming, setConfirming] = useState<Visibility | 'delete' | null>(null)
  const [changing, setChanging] = useState(false)

  const isPublic = ledger.visibility === 'public'
  const isEmpty = state.claims.length === 0

  async function changeVisibility(target: Visibility) {
    setChanging(true)
    try {
      // The server switches rows in batches and says when it is done.
      let done = false
      for (let pass = 0; pass < 40 && !done; pass += 1) {
        const result = await callAction<{ done: boolean }>('setLedgerVisibility', {
          ledgerId: state.ledgerId,
          visibility: target,
        })
        done = result.done
      }
      // Never report "private" (or "published") while rows are still switching.
      if (!done) {
        throw new ActionError(
          'This ledger is large and has not finished switching. Run this again to finish.',
        )
      }
      if (target === 'public') {
        toast.success('Published', 'Anyone with the link can read this ledger.')
      } else {
        toast.success('Made private', 'Only you can read this ledger now.')
      }
    } catch (caught) {
      toast.error(target === 'public' ? 'Not published' : 'Still public', messageOf(caught))
    } finally {
      setChanging(false)
      setConfirming(null)
    }
  }

  return (
    <Page>
      <title>{`${ledger.name} · ${DISPLAY_NAME}`}</title>

      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 max-w-2xl">
          <h1 className="break-words text-[2rem] font-bold leading-[1.15] tracking-tight text-print">
            {ledger.name}
          </h1>
          <p className="mt-2 flex items-start gap-2 text-[0.92rem] text-pencil">
            {isPublic ? (
              <Globe aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span data-testid="ledger-visibility">
              Kept by {ledger.ownerName || 'its owner'}.{' '}
              {isOwner
                ? isPublic
                  ? 'Public: anyone with the link can read it.'
                  : 'Private: only you can read it.'
                : 'Public and read-only: only its keeper can rule on a claim.'}
            </span>
          </p>
          {ledger.repoUrl && (
            <a
              href={ledger.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block break-all font-agent text-[0.82rem] text-print underline underline-offset-2 hover:text-ink"
            >
              {ledger.repoUrl.replace(/^https:\/\//, '')}
            </a>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {isOwner && (
            <>
              <Button variant="outline" size="sm" onClick={() => setDialog('connect')}>
                <Terminal aria-hidden />
                Connect agent
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog('add')}>
                <Plus aria-hidden />
                Add claim
              </Button>
            </>
          )}
          {!isEmpty && (
            <Button variant="outline" size="sm" onClick={() => setDialog('export')}>
              <Upload aria-hidden />
              Export
            </Button>
          )}
          {isOwner &&
            (isPublic ? (
              <>
                <CopyButton text={window.location.href} label="Copy link" copied="Link copied" />
                <Button variant="outline" size="sm" onClick={() => setConfirming('private')}>
                  <Lock aria-hidden />
                  Make private
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirming('public')}>
                <Globe aria-hidden />
                Publish
              </Button>
            ))}
        </div>
      </header>

      <div className="mt-8">
        <Tally score={state.score} />
      </div>

      <div className="mt-8">
        {isEmpty && isOwner ? (
          <section aria-labelledby="connect-heading" className="border border-print bg-card">
            <div className="border-b border-rule px-5 py-4 sm:px-6">
              <h2 id="connect-heading" className="text-[1.05rem] font-semibold text-print">
                This ledger is empty. Connect your agent to fill it.
              </h2>
              <p className="mt-1 text-[0.9rem] text-pencil" role="status">
                Waiting for the first claim. This page updates on its own when it arrives.
              </p>
            </div>
            <div className="px-5 py-6 sm:px-6">
              <ConnectAgent slug={ledger.slug} />
            </div>
          </section>
        ) : isEmpty ? (
          <p className="border border-print bg-card px-6 py-10 text-center text-[0.92rem] text-pencil">
            No claims have been filed in this ledger yet.
          </p>
        ) : (
          <LedgerSheet
            claims={state.claims}
            score={state.score}
            numbers={state.numbers}
            canSign={isOwner}
            ready={state.phase === 'ready'}
          />
        )}
      </div>

      {isOwner && (
        <section aria-labelledby="delete-heading" className="mt-14 border-t border-rule pt-6">
          <h2 id="delete-heading" className="text-[0.95rem] font-semibold text-print">
            Delete this ledger
          </h2>
          <p className="mt-1 max-w-xl text-[0.88rem] leading-relaxed text-pencil">
            A claim or a verdict cannot be edited or removed on its own. Deleting the ledger
            removes all of them, for everyone, and cannot be undone.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-redpen text-redpen hover:bg-redpen hover:text-destructive-foreground"
            onClick={() => setConfirming('delete')}
          >
            <Trash2 aria-hidden className="h-4 w-4" />
            Delete ledger
          </Button>
        </section>
      )}

      {isOwner && (
        <>
          <Modal open={dialog === 'connect'} onClose={() => setDialog(null)} size="lg">
            <Modal.Header>
              <Modal.Title>Connect your agent</Modal.Title>
              <Modal.Description>
                Your agent can file claims and read them. It has no way to rule on one.
              </Modal.Description>
            </Modal.Header>
            <Modal.Body>
              <ConnectAgent slug={ledger.slug} />
            </Modal.Body>
          </Modal>

          <AddClaimDialog
            ledgerId={state.ledgerId}
            open={dialog === 'add'}
            onClose={() => setDialog(null)}
          />

          <ConfirmModal
            open={confirming === 'public'}
            onClose={() => setConfirming(null)}
            onConfirm={() => changeVisibility('public')}
            title={`Publish "${ledger.name}"?`}
            description="Anyone with the link will be able to read every claim and verdict in it, including ones added later. You can make it private again."
            confirmText="Publish"
            variant="default"
            loading={changing}
          />
          <ConfirmModal
            open={confirming === 'private'}
            onClose={() => setConfirming(null)}
            onConfirm={() => changeVisibility('private')}
            title={`Make "${ledger.name}" private?`}
            description="Only you will be able to read it. Anyone using the link will lose access."
            confirmText="Make private"
            variant="default"
            loading={changing}
          />
          <ConfirmModal
            open={confirming === 'delete'}
            onClose={() => setConfirming(null)}
            onConfirm={onDelete}
            title={`Delete "${ledger.name}"?`}
            description={`This removes the ledger, ${
              state.claims.length === 1 ? 'its 1 claim' : `its ${state.claims.length} claims`
            } and every verdict on them. It cannot be undone.`}
            confirmText="Delete ledger"
            variant="destructive"
            loading={deleting}
          />
        </>
      )}

      <ExportDialog
        ledger={ledger}
        claims={state.claims}
        open={dialog === 'export'}
        onClose={() => setDialog(null)}
      />
    </Page>
  )
}

function LedgerSkeleton() {
  return (
    <Page>
      <title>{`Ledger · ${DISPLAY_NAME}`}</title>
      <div aria-busy="true" aria-label="Loading ledger" className="animate-pulse">
        <div className="h-9 w-72 max-w-full rounded-md bg-muted" />
        <div className="mt-3 h-4 w-96 max-w-full rounded-md bg-muted" />
        <div className="mt-9 h-5 w-full max-w-xl rounded-md bg-muted" />
        <div className="mt-3 h-2.5 w-full rounded-sm bg-muted" />
        <div className="mt-10 space-y-px border border-rule">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-32 bg-card" />
          ))}
        </div>
      </div>
    </Page>
  )
}

function LedgerLeaving() {
  return (
    <Page>
      <title>{`Ledger · ${DISPLAY_NAME}`}</title>
      <p role="status" className="py-16 text-pencil">
        Deleting this ledger.
      </p>
    </Page>
  )
}

function LedgerProblem() {
  return (
    <Page>
      <title>{`Ledger · ${DISPLAY_NAME}`}</title>
      <EmptyState
        icon={<FileSearch />}
        title="This ledger could not be loaded"
        description="The connection to Signoff dropped or the request was refused. Reload to try again."
        action={{ label: 'Reload', onClick: () => window.location.reload() }}
      />
    </Page>
  )
}

function LedgerMissing({ signedIn }: { signedIn: boolean }) {
  const [showAuth, setShowAuth] = useState(false)

  return (
    <Page>
      <title>{`No ledger here · ${DISPLAY_NAME}`}</title>
      <div data-testid="ledger-missing" className="mx-auto max-w-lg py-16">
        <h1 className="text-2xl font-bold tracking-tight text-print">No ledger to show here</h1>
        <p className="mt-3 text-pencil">
          This ledger is private, was deleted, or the link is wrong. A private ledger can be read
          only by the person who keeps it.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {signedIn ? (
            <Link
              to="/home"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Go to your ledgers
            </Link>
          ) : (
            <Button onClick={() => setShowAuth(true)}>Sign in</Button>
          )}
        </div>
      </div>
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </Page>
  )
}
