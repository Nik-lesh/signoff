import { defineConfig } from '@playwright/test'
import { chromiumLaunchOptions } from 'deepspace/testing'

/**
 * Runs the two suites that need no account against the deployed app instead
 * of a local server:
 *
 *   npx playwright test -c tests/live.config.ts
 *   SIGNOFF_URL=https://<another-copy> npx playwright test -c tests/live.config.ts
 *
 * smoke.spec.ts loads the signed-out pages. api.spec.ts tries both doors with
 * no token and with a made-up one, the integration proxy, and the socket
 * routes. Every request they send is either read-only or has to be refused,
 * so a passing run writes nothing to the live app.
 *
 * The signed-in suite (ledger.spec.ts) is not run here: it signs test accounts
 * in through the local test server, which `npx deepspace test run all` owns.
 */
const BASE_URL = (process.env.SIGNOFF_URL ?? 'https://signoff.app.space').replace(/\/+$/, '')

export default defineConfig({
  testDir: '.',
  testMatch: ['smoke.spec.ts', 'api.spec.ts'],
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
    launchOptions: chromiumLaunchOptions(),
  },
})
