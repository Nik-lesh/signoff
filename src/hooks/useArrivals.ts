import { useEffect, useRef, useState } from 'react'

/**
 * Tells which ids appeared after the list first loaded, for a short while
 * each. Used to mark a claim that has just arrived over the wire, so a person
 * watching the ledger sees where the new row landed.
 */
export function useArrivals(ids: readonly string[], ready: boolean, holdMs = 2500): Set<string> {
  const seen = useRef<Set<string> | null>(null)
  const timers = useRef<Set<number>>(new Set())
  const [arrived, setArrived] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!ready) return
    if (seen.current === null) {
      // First complete load: everything already here is old news.
      seen.current = new Set(ids)
      return
    }
    const known = seen.current
    const fresh = ids.filter((id) => !known.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) known.add(id)
    setArrived((current) => new Set([...current, ...fresh]))

    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setArrived((current) => {
        const next = new Set(current)
        for (const id of fresh) next.delete(id)
        return next
      })
    }, holdMs)
    timers.current.add(timer)
  }, [ids, ready, holdMs])

  // Timers outlive individual updates on purpose; clear them only on unmount.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending) window.clearTimeout(timer)
      pending.clear()
    }
  }, [])

  return arrived
}
