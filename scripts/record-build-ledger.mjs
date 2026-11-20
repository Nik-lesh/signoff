#!/usr/bin/env node
/**
 * Records this app's own build ledger in the repository, from the clipboard.
 *
 *   pbpaste | node scripts/record-build-ledger.mjs
 *
 * (On macOS, run with nothing piped in, it reads the clipboard itself.)
 *
 * Run it twice, each time right after a click on the published ledger's page:
 *
 *   1. "Copy link"                 points the landing page (src/showcase.ts)
 *                                  and README.md at the ledger.
 *   2. Export, then "Copy summary" saves the exported summary as SIGNOFF.md
 *                                  and lists it at the top of README.md.
 *
 * The script works out which of the two it was given and refuses anything
 * else, so a stale clipboard cannot end up in the repository. Running either
 * step again just writes the same thing.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const SHOWCASE = 'src/showcase.ts'
const README = 'README.md'
const SUMMARY = 'SIGNOFF.md'

function fail(message) {
  console.error(message)
  process.exit(1)
}

/** `https://<host>/l/<id>` with nothing after it but an optional query or fragment. */
function ledgerLink(text) {
  const match = /^(https:\/\/[a-z0-9.-]+\/l\/([A-Za-z0-9_-]{1,64}))(?:[?#]\S*)?$/.exec(text.trim())
  return match ? { url: match[1], id: match[2] } : null
}

/** True for text the app's Export wrote: its title line, a tally, and all five sections. */
function looksLikeSummary(text) {
  return (
    text.startsWith('# Signoff ledger: ') &&
    /^\d+ claims?: \d+ verified, \d+ wrong, \d+ not checked, \d+ waiting\./m.test(text) &&
    ['## Wrong (', '## Follow-ups (', '## Verified (', '## Not checked (', '## Waiting for a verdict ('].every(
      (heading) => text.includes(`\n${heading}`),
    )
  )
}

const LEDGER_BULLET = /^- The ledger of this app's own build.*(?:\n {2}.*)*$/m
const SUMMARY_BULLET = `- What the agent claimed about this build and what a person found, as exported from that ledger: [${SUMMARY}](./${SUMMARY})`

function recordLink({ url, id }) {
  const showcase = readFileSync(SHOWCASE, 'utf8')
  const assignment = /export const SHOWCASE_LEDGER_ID = '[^']*'/
  if (!assignment.test(showcase)) fail(`${SHOWCASE} has no SHOWCASE_LEDGER_ID to set.`)
  writeFileSync(SHOWCASE, showcase.replace(assignment, `export const SHOWCASE_LEDGER_ID = '${id}'`))

  const readme = readFileSync(README, 'utf8')
  if (!LEDGER_BULLET.test(readme)) fail(`${README} has no "The ledger of this app's own build" line to update.`)
  writeFileSync(README, readme.replace(LEDGER_BULLET, `- The ledger of this app's own build: ${url}`))

  console.log(`Linked ${url}\n  ${SHOWCASE}: SHOWCASE_LEDGER_ID = '${id}'\n  ${README}: build ledger link`)
}

function recordSummary(text) {
  writeFileSync(SUMMARY, text.trimEnd() + '\n')

  const readme = readFileSync(README, 'utf8')
  if (!readme.includes(`(./${SUMMARY})`)) {
    if (!LEDGER_BULLET.test(readme)) fail(`${README} has no "The ledger of this app's own build" line to add to.`)
    writeFileSync(README, readme.replace(LEDGER_BULLET, (bullet) => `${bullet}\n${SUMMARY_BULLET}`))
  }
  const tally = text.split('\n').find((line) => /^\d+ claims?: /.test(line)) ?? ''
  console.log(`Saved the exported summary as ${SUMMARY}\n  ${tally}\n  ${README}: lists ${SUMMARY}`)
}

/**
 * What was piped in, or the macOS clipboard when nothing was. The pipe is read
 * as a stream: a single read at startup can come before `pbpaste` has written
 * anything, and macOS answers that with EAGAIN.
 */
async function clipboardText() {
  if (process.stdin.isTTY) {
    const paste = spawnSync('pbpaste', { encoding: 'utf8' })
    if (paste.error || paste.status !== 0) {
      fail('Pipe the clipboard in:\n  pbpaste | node scripts/record-build-ledger.mjs')
    }
    return paste.stdout
  }
  let piped = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) piped += chunk
  return piped
}

const text = (await clipboardText()).replace(/\r\n/g, '\n').trim()
const link = ledgerLink(text)
if (link) recordLink(link)
else if (looksLikeSummary(text)) recordSummary(text)
else {
  fail(
    'The clipboard holds neither a ledger link nor an exported summary.\n' +
      'On the published ledger, click "Copy link" (or open Export and click "Copy summary"), then run this again:\n' +
      '  pbpaste | node scripts/record-build-ledger.mjs',
  )
}
