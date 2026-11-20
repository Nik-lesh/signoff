#!/usr/bin/env node
/**
 * Files the claims in a JSON file into a Signoff ledger, through the agent's
 * door: `npx deepspace agent invoke <app> file_claim`.
 *
 *   node scripts/file-claims.mjs --app signoff --ledger signoff-build
 *   node scripts/file-claims.mjs --app http://localhost:5173 --ledger signoff-build --dry-run
 *
 * Options:
 *   --app      app name on app.space, or a full URL (required)
 *   --ledger   the ledger's slug, shown in its Connect agent dialog (required)
 *   --file     claims file (default: claims/build.json)
 *   --agent    name recorded on each claim (default: coding-agent)
 *   --dry-run  show what would be filed and file nothing
 *
 * Why this exists: the agent that built Signoff worked in a sandbox that could
 * not reach DeepSpace, so it wrote its claims to claims/build.json instead of
 * filing them itself. This script files them unchanged, using your CLI login.
 *
 * It is safe to run twice. A claim cannot be deleted once filed, so before
 * filing anything the script reads the ledger and skips every claim whose text
 * is already there.
 *
 * A claim in the file can follow up on an earlier one, for example the fix for
 * a claim that was marked wrong: give it "followsClaim" with the earlier
 * claim's exact text. The ledger links claims by id, so the script looks the
 * id up and sends it as `follows`.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) fail(`--${name} needs a value.`)
  return value
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const app = option('app')
const ledger = option('ledger')
const file = resolve(option('file', 'claims/build.json'))
const agent = option('agent', 'coding-agent')
const dryRun = process.argv.includes('--dry-run')

if (!app || !ledger) {
  fail('Usage: node scripts/file-claims.mjs --app <name or URL> --ledger <slug> [--file claims/build.json] [--dry-run]')
}

/** Run one agent tool through the DeepSpace CLI and return its result. */
function invoke(tool, input) {
  const run = spawnSync(
    'npx',
    ['deepspace', 'agent', 'invoke', app, tool, '--input-file', '-', '--json'],
    { input: JSON.stringify(input), encoding: 'utf8' },
  )
  if (run.error) return { ok: false, error: `could not run npx: ${run.error.message}` }

  // With --json the CLI prints one JSON line: { ok: true, result } on success,
  // { ok: false, code, error } on refusal.
  const lines = run.stdout.split('\n').filter((line) => line.trim().startsWith('{'))
  for (const line of lines.reverse()) {
    try {
      const reply = JSON.parse(line)
      if (typeof reply.ok === 'boolean') {
        return reply.ok
          ? { ok: true, result: reply.result }
          : { ok: false, error: reply.error ?? reply.code ?? 'refused' }
      }
    } catch {
      // Not the result line; keep looking.
    }
  }
  return { ok: false, error: (run.stderr || run.stdout || `exit ${run.status}`).trim().slice(0, 400) }
}

let claims
try {
  claims = JSON.parse(readFileSync(file, 'utf8'))
} catch (error) {
  fail(`Could not read ${file}: ${error instanceof Error ? error.message : error}`)
}
if (!Array.isArray(claims) || claims.length === 0) fail(`${file} holds no claims.`)

// What is already in the ledger. `list_claims` returns up to 100 claims; with
// more than that the script cannot rule out duplicates, so it stops.
const existing = invoke('list_claims', { ledger })
if (!existing.ok) {
  fail(
    `Could not read the ledger "${ledger}" on ${app}: ${existing.error}\n` +
      'Check that you are logged in (npx deepspace auth whoami), that you have signed in to the app in a browser once, ' +
      'and that the slug matches the ledger\'s Connect agent dialog.',
  )
}
const listed = existing.result ?? {}
if (Number(listed.total ?? 0) > Number(listed.shown ?? 0)) {
  fail(`The ledger "${ledger}" has more claims than one page shows, so duplicates cannot be ruled out. Nothing was filed.`)
}
const already = new Set((listed.claims ?? []).map((claim) => claim.claim))
/** Claim text to claim id, for "followsClaim". Grows as this run files claims. */
const idOf = new Map((listed.claims ?? []).map((claim) => [claim.claim, claim.id]))

const pause = (ms) => new Promise((done) => setTimeout(done, ms))

let filed = 0
let skipped = 0
let failed = 0
for (const { followsClaim, ...claim } of claims) {
  const label = String(claim.claim).slice(0, 72)
  if (already.has(claim.claim)) {
    skipped += 1
    console.log(`already there  ${label}`)
    continue
  }
  if (followsClaim) {
    const earlier = idOf.get(followsClaim)
    if (!earlier && !dryRun) {
      failed += 1
      console.log(`NOT FILED      ${label}\n               the claim it follows is not in the ledger`)
      continue
    }
    claim.follows = earlier
  }
  if (dryRun) {
    console.log(`would file     ${label}${followsClaim ? '  (a follow-up)' : ''}`)
    continue
  }
  // Each call asks the auth service for a fresh agent token, so go gently, and
  // give a rate limit one chance to clear. A claim that still fails is simply
  // picked up by the next run.
  await pause(300)
  let reply = invoke('file_claim', { ...claim, ledger, agent })
  if (!reply.ok && /rate|too many|429/i.test(String(reply.error))) {
    await pause(8000)
    reply = invoke('file_claim', { ...claim, ledger, agent })
  }
  if (reply.ok) {
    filed += 1
    if (reply.result?.id) idOf.set(claim.claim, reply.result.id)
    console.log(`filed          ${label}${followsClaim ? '  (a follow-up)' : ''}`)
  } else {
    failed += 1
    console.log(`REFUSED        ${label}\n               ${reply.error}`)
  }
}

console.log(
  dryRun
    ? `\nDry run: ${claims.length - skipped} to file, ${skipped} already in "${ledger}".`
    : `\n${filed} filed, ${skipped} already there, ${failed} refused.`,
)
process.exit(failed > 0 ? 1 : 0)
