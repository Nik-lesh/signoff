# AGENTS.md

Read <https://docs.deep.space/llms.txt>, then fetch the relevant documentation
page as Markdown by appending `.md`. The installed package types and CLI
`--help` describe the exact version in this project. Use your existing HTTP,
shell, and browser tools; no skill, plugin, connector, or session restart is
required. Installing the optional skill is a separate explicit choice.

## About this project

This is **Signoff**, a **DeepSpace** app built on the
[`deepspace`](https://www.npmjs.com/package/deepspace) SDK and deployed to
Cloudflare Workers via `npx deepspace deploy`. A coding agent files claims
about its work; a signed-in person marks each one verified, wrong or not
checked. README.md explains the design.

Rules that hold this app together. Do not change them without being asked:

- Every write to `ledgers`, `claims` and `verdicts` goes through
  `src/server/ledger-service.ts`. Keep `create`, `update` and `delete` set to
  `false` for every role in `src/schemas/ledger-schemas.ts`.
- The agent's door (`src/ai/tools.ts`) has three tools. Never add one that
  records a verdict, publishes or deletes a ledger, or writes records
  generically.
- Claims and verdicts are append-only. No code changes what one says or
  removes one on its own. The two exceptions are the `visibility` copy that
  follows the ledger, and `deleteLedger`, which removes a whole ledger at its
  keeper's request.
- The app calls no integrations. `src/integrations.ts` stays empty unless the
  developer asks for one by name.
- After any change run `npm run validate` and `npm run lint`. The service
  rules are unit tested in `src/server/ledger-service.test.ts`; add a test
  there when you add a rule.

## Version control

The app's **cloud repo** on the DeepSpace platform is the default version
control; no external account is needed. The first DeepSpace push/pull/deploy
command installs its Git remote as `space`. **Don't set up GitHub (or another
git host) unless the developer explicitly asks.** With the default DeepSpace
source, commit before you deploy: the release records that commit and refuses
a dirty worktree. When the app ships from GitHub (latched from the checkout's
remote at the app's first release, permanently), deploy instead ships the
current checkout, including dirty or unpushed bytes, and records no commit
lineage for that release; use ordinary Git to decide what should be committed
and pushed. For parallel DeepSpace-source work: `workspace new -t "<task>"` →
commit → `workspace sync` → `workspace land`. Use `status`, `activity`,
`releases`, and `rollback` to recover context and inspect what is live.

## Project commands

```sh
npx deepspace auth login   # authenticate with app.space
npx deepspace dev start    # local dev server (vite + miniflare)
npx deepspace deploy       # deploy to <app>.app.space
npx deepspace push         # sync code to the app's cloud repo
npx deepspace agent tools <app> --json # discover tools and their input schemas
npx deepspace agent invoke <app> <tool> --input-file tool-input.json --json
npx deepspace add --list   # list optional features (messaging, etc.)
npx deepspace add <feature>
```

`worker.ts` exposes the tools from `src/ai/tools.ts` over HTTP and MCP, to
agent-scoped tokens only (the scaffold's browser tool surface is removed on
purpose). For local app tools, always run `agent tools` first and follow the
returned description and input schema rather than guessing arguments. `agent invoke`
reuses the current CLI login and requires no separate connection. If it reports
`not_authenticated`, run the refusal's action when present. In a
headless shell without an action, run `npx deepspace auth login --help` and use
the operator-supplied credential path it names; never invent credentials or put
a password on the command line.

## Signoff

This project keeps a ledger of its own build in the deployed app. Before you
tell the developer that something is done or true (tests pass, a bug is fixed,
a permission is enforced, an assumption you relied on), file it as a claim:

```sh
npx deepspace agent invoke signoff file_claim --input-file claim.json --json
```

`claim.json`:

```json
{
  "ledger": "signoff-build",
  "claim": "One specific, checkable statement",
  "check": "How the developer can verify it in a few minutes",
  "stakes": "low | medium | high",
  "ref": "commit, file path or https link (optional)",
  "agent": "your name (optional)",
  "follows": "id of the claim this one fixes (optional)"
}
```

File one claim per call. Never put secrets or credentials in a claim: a claim
cannot be edited or removed on its own. You cannot mark a claim verified; the
developer does that.

Before you continue work, read what was marked wrong and fix it:

```sh
npx deepspace agent invoke signoff list_claims --input '{"ledger":"signoff-build","status":"wrong"}' --json
```

When you have fixed one, file a new claim for the fix and set `follows` to the
id of the claim that was marked wrong. A claim that already lists `followedBy`
has a fix on file: skip it unless that fix was marked wrong too.

If you cannot reach the app from where you are running, append your claims to
`claims/build.json` instead and say so. `scripts/file-claims.mjs` files them.
