import { describe, expect, it } from 'vitest'
import { exactTime, shortDate, timeAgo } from './time'

const NOW = Date.parse('2026-11-16T12:00:00.000Z')

describe('timeAgo', () => {
  it.each([
    [10, 'just now'],
    [50, '1 min ago'],
    [60 * 5, '5 min ago'],
    [60 * 59, '59 min ago'],
    [60 * 60 * 3, '3 h ago'],
  ])('%i seconds back reads as %s', (secondsBack, expected) => {
    expect(timeAgo(NOW - secondsBack * 1000, NOW)).toBe(expected)
  })

  it('switches to a date after a day', () => {
    expect(timeAgo(NOW - 3 * 86_400_000, NOW)).toMatch(/^on \d{1,2} Nov 2026$/)
  })

  it('does not invent a time for a missing timestamp', () => {
    expect(timeAgo(0, NOW)).toBe('at an unknown time')
  })
})

describe('shortDate', () => {
  it('prints the UTC date for a static example, whatever zone the machine is in', () => {
    // Half an hour either side of midnight UTC: local time would disagree somewhere.
    expect(shortDate(Date.parse('2026-11-16T23:30:00.000Z'), 'utc')).toBe('16 Nov 2026')
    expect(shortDate(Date.parse('2026-11-17T00:30:00.000Z'), 'utc')).toBe('17 Nov 2026')
  })

  it('prints the local date for a live ledger', () => {
    const local = new Date(NOW)
    expect(shortDate(NOW)).toContain(String(local.getFullYear()))
    expect(shortDate(NOW)).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/)
  })

  it('does not invent a date for a missing timestamp', () => {
    expect(shortDate(0)).toBe('unknown date')
    expect(shortDate(0, 'utc')).toBe('unknown date')
  })
})

describe('exactTime', () => {
  it('prints a full UTC timestamp', () => {
    expect(exactTime(NOW)).toBe('2026-11-16 12:00:00 UTC')
    expect(exactTime(0)).toBe('')
  })
})
