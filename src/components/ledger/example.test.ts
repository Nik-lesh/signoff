import { describe, expect, it } from 'vitest'
import { ledgerToMarkdown } from '@/lib/export'
import { render } from '@/prerender-entry'
import { EXAMPLE_CLAIMS, EXAMPLE_EXPORTED_AT, EXAMPLE_SUMMARY } from './example'

describe('the example ledger on the landing page', () => {
  it('shows a fix that follows the claim a person marked wrong', () => {
    const [, wrong, fix] = EXAMPLE_CLAIMS
    expect(wrong.status).toBe('wrong')
    expect(fix.follows).toBe(wrong.id)
    expect(wrong.followedBy).toEqual([fix.id])
    // The fix is a new claim, still waiting. The wrong one was not rewritten.
    expect(fix.status).toBe('new')
  })

  it('quotes the real export, whole: the app would write this summary for these rows', () => {
    const exported = ledgerToMarkdown(
      { name: 'Checkout rewrite', ownerName: 'Dana Okafor' },
      EXAMPLE_CLAIMS,
      EXAMPLE_EXPORTED_AT,
    )
    expect(exported.trimEnd()).toBe(EXAMPLE_SUMMARY)

    // The four things a reader needs kept apart, in this order.
    const headings = EXAMPLE_SUMMARY.split('\n').filter((line) => line.startsWith('## '))
    expect(headings).toEqual([
      '## Wrong (1)',
      '## Follow-ups (1)',
      '## Verified (1)',
      '## Not checked (0)',
      '## Waiting for a verdict (1)',
    ])
    expect(EXAMPLE_SUMMARY).toContain('- No. 3 follows No. 2, marked wrong. No. 3 is still waiting.')
  })

  it('is printed with fixed dates, never as a time ago, so it cannot look recent or stale', () => {
    // The landing page as prerendered, reduced to the text a reader sees.
    const text = render('/')
      .replace(/<!--.*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, ' ')
    expect(text).toContain('Filed by coding-agent on 16 Nov 2026.')
    expect(text).toMatch(/16 Nov 2026 ?, first verdict 17m after filing/)
    expect(text).not.toMatch(/\b(min|h) ago\b/)
    expect(text).not.toContain('just now')
    // The dates on the rows and the date in the summary are the same day.
    expect(text).toContain("Exported 2026-11-16 from Dana Okafor's ledger.")
  })
})
