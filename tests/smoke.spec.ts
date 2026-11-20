import { test, expect } from '@playwright/test'
import { captureConsoleErrors } from './helpers/errors'

/**
 * What a signed-out visitor sees. No test account is needed, so this suite
 * runs on a fresh checkout (`npx deepspace test run`).
 *
 * Two kinds of page are covered:
 *   - '/'      the static landing (top level of src/pages/): no providers, so
 *              no auth request and no record-room socket on load.
 *   - '/home', '/l/:id'  dynamic pages (under src/pages/(app)/): the providers
 *              mount and the record room connects, anonymously here.
 */

/** Wait for the React app shell (present on every page). */
async function waitForApp(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-testid="app-root"]', { timeout: 15000 })
}

test.describe('Signed-out pages', () => {
  test('landing loads without errors and shows a worked example of a ledger', async ({ page }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/')
    await waitForApp(page)
    const landing = page.getByTestId('static-landing')
    await expect(landing).toBeVisible()
    await expect(landing.getByRole('heading', { level: 1 })).toContainText('The agent claims.')

    // The example has both halves of the product in it: claims that carry a
    // person's verdict, and one still waiting for it.
    const rows = landing.getByTestId('claim-row')
    await expect(rows).toHaveCount(3)
    await expect(landing.getByTestId('signoff-mark').first()).toBeVisible()
    await expect(landing.getByTestId('signoff-blank')).toHaveCount(1)
    expect(errors).toEqual([])
  })

  test('landing carries one title, one description, one canonical', async ({ page }) => {
    // <Seo> (src/pages/index.tsx, values from src/seo.ts) hoists these into
    // <head>. Exactly one of each: index.html ships no static description or
    // canonical, because React 19 would not dedupe against them on mount.
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await expect(page).toHaveTitle(/Signoff/)
    expect(await page.locator('head meta[name="description"]').count()).toBe(1)
    expect(await page.locator('head link[rel="canonical"]').count()).toBe(1)
  })

  test('static contract: landing fires no auth request, opens no websocket', async ({ page }) => {
    const offenders: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/')) offenders.push(req.url())
    })
    // Only the DO room route counts — vite's own HMR socket is a dev artifact.
    page.on('websocket', (ws) => {
      if (new URL(ws.url()).pathname.startsWith('/ws/')) offenders.push(`ws: ${ws.url()}`)
    })
    await page.goto('/')
    await expect(page.getByTestId('static-landing')).toBeVisible()
    await page.waitForTimeout(1500)
    expect(offenders).toEqual([])
  })

  test('landing leads to the app', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Open your ledgers' }).first().click()
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByTestId('app-navigation')).toBeVisible({ timeout: 15000 })
  })

  test('home asks a signed-out visitor to sign in', async ({ page }) => {
    await page.goto('/home')
    await expect(page.getByTestId('nav-sign-in-button')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Sign in to start a ledger' })).toBeVisible()
    await expect(page.getByTestId('nav-user-name')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'New ledger' })).toHaveCount(0)
  })

  test('a ledger address that is private or wrong shows one calm page, not an error', async ({
    page,
  }) => {
    const errors = captureConsoleErrors(page)
    await page.goto('/l/not-a-real-ledger')
    await expect(page.getByTestId('ledger-missing')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No ledger to show here')
    // Nothing that only a keeper can do is offered here.
    await expect(page.getByRole('button', { name: 'Add claim' })).toHaveCount(0)
    await expect(page.getByTestId('signoff-form')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('unknown route shows 404', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz')
    await waitForApp(page)
    await expect(page.locator('text=404')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to your ledgers' })).toBeVisible()
  })
})
