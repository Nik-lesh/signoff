# Signoff

A sign-off ledger for work done by coding agents. The agent files a claim each
time it is about to say something is done or true ("all tests pass", "the
permission is enforced"). A signed-in person reads each claim, checks it, and
marks it verified, wrong or not checked. The agent has no way to record a
verdict.

Built on [DeepSpace](https://deep.space) for the applicant build exercise.

- Live app: https://signoff.app.space
- The ledger of this app's own build: https://signoff.app.space/l/1795136700421_31cwzn

## The rule

There are two ways into the server, and they are deliberately different.

| | The person's door | The agent's door |
| --- | --- | --- |
| Route | `POST /api/actions/:name` | `POST /_deepspace/agent/tools/:name` (also MCP) |
| Credential | session token from a browser sign-in | agent-scoped token minted by `npx deepspace agent invoke` |
| Can do | create a ledger, add a claim by hand, **record a verdict**, publish or unpublish, delete a ledger | list ledgers, **file a claim** (on its own, or as a follow-up to an earlier one), read claims and their verdicts |
| Refuses | agent-scoped tokens (401) | session tokens (401) |

A claim is labelled `agent` or `manual` by the door it came through, never by
what the request says about itself. Claims and verdicts are append-only: a
change of mind is a second verdict, and the first stays on the record. Nothing
can be edited or removed on its own. The one thing a keeper can delete is a
whole ledger.

## The important path

1. Sign in and create a ledger. It starts private.
2. Open **Connect agent**, copy the instructions into your agent's `AGENTS.md`,
   and let it work. Each claim it files appears on the open page without a
   reload.
3. Check a claim yourself, write what you did, and mark it. "Verified" and
   "Wrong" need a note of at least 8 characters; "Not checked" does not.
4. The tally says how much of the agent's work a person actually checked, and
   whether the high-stakes claims were among it. "A person checked 90% of
   them" reads differently next to "1 of the 3 high-stakes claims has not been
   checked."
5. The agent reads back what was marked wrong, and why, with `list_claims`.
   Its fix is a new claim that `follows` the old one. The wrong claim stays
   wrong, the fix waits for its own verdict, and each row links to the other.
   `list_claims` also says which wrong claims already have a fix on file, so
   an agent does not answer the same one twice.
6. Publish the ledger to share it read-only, or export it as Markdown. The
   export keeps four things apart: what was found wrong, which claims follow
   up on which, what was verified and how, and what nobody checked.
7. Delete the ledger when it has served its purpose, or if something was filed
   that should not have been.

## How it is built

```
worker.ts                      route registration and Durable Object classes
src/schemas/ledger-schemas.ts  ledgers, claims, verdicts and who may read them
src/server/ledger-service.ts   every write, and every ownership check
src/actions/index.ts           the person's door
src/ai/tools.ts, agent.ts      the agent's door
src/lib/                       pure logic: status, tally, follow-up links, review order, export, validation
src/hooks/useLedger.ts         three live queries behind the ledger page
src/pages/                     landing (static), ledgers list, one ledger
tests/                         Playwright suites
claims/build.json              what the agent claimed about this build
scripts/                       file those claims; record the published build ledger here
```

**Data.** Three collections in one record room.

| Collection | Holds | Changes after creation |
| --- | --- | --- |
| `ledgers` | name, slug, owner, visibility, claim count | visibility and the claim count |
| `claims` | statement, how to check it, stakes, reference, agent name, source, the claim it follows | nothing but visibility, until the ledger is deleted |
| `verdicts` | claim id, status, note, signer's name | nothing but visibility, until the ledger is deleted |

A claim's status is not stored. It is the status of its newest verdict, or
"waiting" if it has none. A follow-up is stored on the later claim only, as the
id of the claim it follows. "Followed by" on the earlier row is worked out when
the ledger is read, so linking a fix never touches the claim it fixes.

**Writes.** `create`, `update` and `delete` are `false` for every role on all
three collections, so no browser can write them over the WebSocket. The only
writer is `ledger-service.ts`, reached through a server action or an agent
tool. Those run with per-record permissions off, so the service checks
ownership itself: it loads the ledger and compares its owner with the verified
caller. Someone else's ledger gets the same "not found" as one that does not
exist.

**Reads.** Every role has `read: 'published'`: the owner, plus anyone once the
row's `visibility` is `public`. The record room applies this before it sends a
row, so a private ledger never reaches another browser. DeepSpace evaluates
read rules row by row, so each claim and verdict carries its own copy of the
ledger's visibility, and publishing updates them in batches.

## DeepSpace pieces used

| Piece | Used for |
| --- | --- |
| Auth | sign-in, and the two kinds of token the two doors tell apart |
| Records and realtime | the three collections, live queries, claims arriving on open pages |
| Record permissions | server-only writes, `published` reads, immutable columns, a roster limited to the caller |
| Server actions | the person's door |
| Agent tool routes and the `agent invoke` CLI | the agent's door |
| Static prerender | the landing page, which makes no auth request and opens no socket |
| Testing fixtures | signed-in Playwright tests with real test accounts |

**Left out, on purpose.**

- **AI integrations.** The agent using Signoff is already a model. A second
  one inside the app, judging claims, would be the thing the app exists to
  avoid: a machine vouching for a machine. The scaffold's chat routes are
  deleted.
- **Every other integration.** None improves this product. The scaffold's
  integration proxy lets any signed-in person call any integration on the app
  owner's bill unless the app says otherwise, so here it is an allowlist with
  nothing on it (`src/integrations.ts`) and answers 404.
- **Yjs, canvas, presence, cron and job rooms.** Unused, so their routes are
  not registered. The classes are still exported because the deploy manifest
  expects them.
- **Payments, file uploads, messaging.** Not needed for the path above.

## The main tradeoff

Every write goes through the server, which gives up the platform's most
convenient path: writing records straight from the browser under role
permissions, with the result echoed to every client.

What that costs: each click is a request and a wait instead of an instant
local write, publishing a large ledger takes several calls, and the code has a
service layer the scaffold does not need.

What it buys: `source` cannot be forged, because a browser has no way to
create a claim that says an agent filed it. Nothing can be edited after the
fact, and nothing can be trimmed: removing one entry means deleting the whole
ledger, so a ledger cannot be quietly curated. And the rule "only the keeper
rules on a claim" lives in one unit-tested file, instead of being spread
across permission declarations for three collections.

For a ledger whose whole value is that its entries can be trusted, that was
the right side to give up.

## What is enforced, and what is not

Enforced, with an automated test for each unless noted:

- An agent-scoped token cannot record a verdict, and there is no verdict tool.
- A session token cannot use the agent's door.
- Nobody but the keeper can read a private ledger, add to it, rule on it,
  publish it or delete it. Unpublishing takes the ledger away from pages that
  have it open.
- No browser can create, change or delete a claim, a verdict or a ledger
  directly, the keeper's included.
- What a claim or a verdict says cannot be changed, by server code either: the
  record room refuses any change to an immutable column. (The room's refusal
  was checked by hand with a temporary action, since no shipped route attempts
  such a change. The unit tests cover the service's side.) The only removal is
  deleting a whole ledger, and no agent tool does that.
- A follow-up can only point at a claim in the same ledger, kept by the same
  person. Any other id gets one and the same refusal, so the link cannot be
  used to find out whether a claim exists somewhere else.
- A signed-in person is not shown who else uses the app.
- Text that matches a known credential format (private key, GitHub, AWS,
  Stripe or Slack token, `sk-` key, JWT) is refused in claims and notes.
- 20 ledgers per person, 500 claims per ledger, 20 verdicts per claim, and
  length limits on every field.

The three promises on the landing page, and the tests that hold them to it:

| Promise | Tested by |
| --- | --- |
| An agent cannot record a verdict | `tests/ledger.spec.ts`: "an agent token can file a claim and read it back, and cannot sign or delete". `src/ai/tools.test.ts`: the agent surface is exactly three tools. `tests/api.spec.ts`: both doors refuse a missing or made-up token |
| Nobody else can read a private ledger | `tests/ledger.spec.ts`: "a ledger is private until its keeper publishes it, and read-only for everyone else" and "another person's session token opens nothing in a ledger they do not keep" |
| Nothing is rewritten | `tests/ledger.spec.ts`: "even the keeper cannot write, change or delete a claim or a verdict except through the server". `src/server/ledger-service.test.ts`: "the ledger is append-only" |

The same promises are claims in the ledger of this app's own build, where
each one carries a person's verdict or is still shown as waiting.

Not enforced. These are limits of the design, not bugs:

- **A verdict proves who signed, not that they checked.** The required note is
  a nudge. Someone can type eight characters and click "Verified".
- **The agent files claims with your login.** `agent invoke` uses your CLI
  session to mint its token. The token it gets cannot sign, but software
  running as you on your own machine could go looking for your credentials and
  act as you, here and everywhere else. Signoff limits what an agent is
  handed. It is not a sandbox for the agent.
- **The agent's name is whatever the agent says.** `agent: "coding-agent"` is
  a label on the claim, not a verified identity. So is the display name on a
  signature.
- **Stakes and follow-ups are the agent's word too.** The agent decides what
  counts as high stakes, so it can understate, and `follows` says which claim
  it is answering, not that the fix works. Only a hand-typed claim has its
  stakes set by a person, and only the agent's door files a follow-up.
- **The secret screen is a list of patterns.** An unfamiliar key format gets
  through. The only remedy then is to delete the ledger and rotate the key.
- **Whoever deploys the app runs its storage.** The app gives its owner no
  view of other people's private ledgers, but an operator can always read
  their own database by other means.
- **A deleted ledger is gone.** There is no trash and no undo, and readers of
  a public ledger are not told why the link stopped working. There is no
  account deletion flow.

## Run it

Requires Node 22.15 or newer and npm 11.6 or newer (`engines` in package.json).

```sh
npm install
npx deepspace auth login
npx deepspace app init      # mints this checkout's app id into wrangler.toml
npx deepspace dev start     # http://localhost:5173
```

## Tests

```sh
npm run test:unit                 # 152 unit tests, no network needed
npx deepspace test run            # smoke + api: signed-out pages and both doors without a key
npx deepspace test run all        # everything, including the signed-in suite
npx playwright test -c tests/live.config.ts   # smoke + api again, against the deployed app
```

The first three run against a local server that the test runner starts
itself, so stop `npx deepspace dev start` first. The last one starts nothing
and needs no account: every request it sends to the live app is read-only or
has to be refused.

The signed-in suite (`tests/ledger.spec.ts`) needs two test accounts and skips
itself, saying so, when there are fewer. Test-account emails are shared by
every DeepSpace developer, so pick two addresses nobody else will have used:

```sh
read -rs PW    # type a throwaway password of 8 or more characters, then Enter
printf %s "$PW" | npx deepspace test accounts create --email signoff-keeper-<yourname>@deepspace.test --name "Keeper" --password-stdin
printf %s "$PW" | npx deepspace test accounts create --email signoff-reader-<yourname>@deepspace.test --name "Reader" --password-stdin
```

Every ledger the suite creates is deleted when its test ends, so it can be run
any number of times against the same local data.

| Suite | What it proves |
| --- | --- |
| `src/server/ledger-service.test.ts` | every ownership rule, the limits, follow-up links, the publish cascade, append-only behaviour, deletion |
| `src/ai/tools.test.ts` | the agent surface is exactly three tools |
| `src/lib/*.test.ts` | status, tally and stakes, follow-up links, review order, export, validation, the secret screen |
| `src/components/ledger/example.test.ts` | the landing page quotes the real export and prints fixed dates |
| `tests/smoke.spec.ts` | signed-out pages, and the landing page's static contract |
| `tests/api.spec.ts` | both doors refuse a missing or made-up token; closed scaffold routes stay closed |
| `tests/ledger.spec.ts` | the important path with real accounts, and each rule above from the outside |

Two tests in the signed-in suite ask the auth service for an agent token for
the local origin. If the local setup cannot provide one, they are reported as
skipped and the agent's door has to be checked by hand, as below.

## Checking the agent's door by hand

After deploying and signing in to the app once in a browser:

```sh
npx deepspace agent tools signoff
npx deepspace agent invoke signoff list_ledgers --input '{}'
npx deepspace agent invoke signoff file_claim \
  --input '{"ledger":"<slug>","claim":"My agent can file claims","check":"See it appear on the open ledger page"}'
```

The first command must list `file_claim`, `list_claims` and `list_ledgers` and
nothing else. The claim must appear on the open ledger page without a reload.

To check a follow-up, mark that claim wrong in the browser, then:

```sh
npx deepspace agent invoke signoff list_claims --input '{"ledger":"<slug>","status":"wrong"}'
npx deepspace agent invoke signoff file_claim \
  --input '{"ledger":"<slug>","claim":"Fixed what was marked wrong","check":"Repeat the check that failed","follows":"<id from the line above>"}'
```

The new row must read "Follows No. 1, marked wrong" and the old one "Followed
by No. 2". With any other value in `follows` the claim is refused.

## Deploy

```sh
git add -A && git commit -m "Describe the change"
npx deepspace deploy
```

With DeepSpace's own cloud repository as the source, a release records the
commit it was built from and refuses a dirty worktree.

## How this was built

I built Signoff with a coding agent, working the way the app expects. The
agent wrote the code and the tests and listed what it claimed about them. I
directed the work and ran it, and my verdicts on those claims are in the
ledger.

The agent worked in a sandbox that could not reach DeepSpace. It tested
against the local worker with tokens signed by a throwaway key, and wrote its
claims about the result to `claims/build.json` instead of filing them. I filed
them unchanged with `scripts/file-claims.mjs`. They are in the public ledger
of this app's own build, where each one carries my verdict or is still shown
as waiting. The last claim in that file is the agent's own statement of what
it could not test.

Once that ledger is published, `pbpaste | node scripts/record-build-ledger.mjs`
records it in this repository: run after **Copy link**, it points the landing
page and this README at the ledger; run after **Export** and **Copy summary**,
it saves the exported summary as `SIGNOFF.md`.
