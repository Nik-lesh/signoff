/** Small, dependency-free time formatting for ledger rows. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "16 Nov 2026". A live ledger prints dates in the viewer's time zone. A
 * static example prints them in UTC, so the page reads the same wherever and
 * whenever it is rendered.
 */
export function shortDate(ms: number, zone: 'local' | 'utc' = 'local'): string {
  if (!ms) return 'unknown date'
  const date = new Date(ms)
  return zone === 'utc'
    ? `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
    : `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** "just now", "5 min ago", "3 h ago", then the date. */
export function timeAgo(ms: number, nowMs: number): string {
  if (!ms) return 'at an unknown time'
  const seconds = Math.round((nowMs - ms) / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `on ${shortDate(ms)}`
}

/** Full timestamp for a title attribute. */
export function exactTime(ms: number): string {
  return ms ? new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : ''
}
