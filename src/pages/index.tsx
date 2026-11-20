/**
 * Design direction
 *
 * Signoff is named after a paper ledger, and the landing page is one sheet of
 * it. The paper is the pale eye-ease green of a columnar pad, the print is
 * graphite, and the only colour comes from the two pens a ledger is corrected
 * with: blue ink for a signature and red for a strike-through. There are no
 * cards, shadows or gradients; structure comes from ruled lines.
 *
 * Three typefaces each speak for one party and never swap. Public Sans is the
 * form itself: headings, labels, buttons. Monaspace Neon is the agent, used
 * for anything a machine typed. Monaspace Radon, a handwriting cut of the same
 * family, is the person, used for verdict notes and signatures. A reader can
 * tell who said what before reading a word.
 *
 * The hero is the product's own surface, not a picture of it: three ledger
 * rows split by a double rule, claims on the left and a person's findings on
 * the right. The one piece of motion on the page is the first signature being
 * written onto its line, once, on load.
 *
 * This page is static. It sits at the top level of src/pages/, mounts no
 * DeepSpace providers, makes no auth call and opens no socket, and is
 * prerendered at build. Keep it renderable without a browser.
 */

import { Link } from 'react-router-dom'
import { CodeBlock } from '../components/CodeBlock'
import { Mark } from '../components/Mark'
import { Seo } from '../components/Seo'
import { ExampleSheet } from '../components/ledger/ExampleSheet'
import { EXAMPLE_SUMMARY } from '../components/ledger/example'
import { APP_NAME, DISPLAY_NAME } from '../constants'
import { seo } from '../seo'
import { SHOWCASE_LEDGER_ID } from '../showcase'

const FILE_CLAIM_COMMAND = `npx deepspace agent invoke ${APP_NAME} file_claim --input '{
  "claim": "All 41 unit tests pass",
  "check": "Run npm run test:unit and read the summary line",
  "stakes": "medium"
}'`

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-background text-print">
        <header className="border-b border-print">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-8">
            <span className="flex items-center gap-2 text-[1.1rem] font-bold tracking-tight">
              <Mark />
              {DISPLAY_NAME}
            </span>
            <Link
              to="/home"
              className="text-[0.92rem] font-medium text-print underline underline-offset-4 hover:text-ink"
            >
              Open your ledgers
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 sm:px-8">
          <section className="pb-10 pt-14 sm:pt-20">
            <h1 className="max-w-3xl text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.03em]">
              The agent claims.
              <br />A person signs.
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-[1.1rem] leading-relaxed text-pencil">
              Signoff is a ledger for work done with coding agents. Your agent files each thing it
              says is done. You mark it verified, wrong, or not checked, and the ledger keeps both.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                to="/home"
                className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-[0.95rem] font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Open your ledgers
              </Link>
              {SHOWCASE_LEDGER_ID && (
                <Link
                  to={`/l/${SHOWCASE_LEDGER_ID}`}
                  className="text-[0.95rem] font-medium underline underline-offset-4 hover:text-ink"
                >
                  Read the ledger for this app&apos;s own build
                </Link>
              )}
            </div>
          </section>

          <section aria-label="What a ledger looks like" className="landing-hero pb-16">
            <ExampleSheet />
          </section>

          <section aria-labelledby="how-heading" className="border-t border-print py-16">
            <h2 id="how-heading" className="text-[1.75rem] font-bold tracking-tight">
              How a claim becomes a signature
            </h2>
            <ol className="mt-8 grid gap-x-12 gap-y-10 md:grid-cols-2">
              <li className="min-w-0">
                <h3 className="text-[1.05rem] font-semibold">1. The agent files it</h3>
                <p className="mt-2 leading-relaxed text-pencil">
                  When your agent is about to tell you something is done, it runs one command
                  first. A claim is refused unless it says how you can check it.
                </p>
                <CodeBlock className="mt-4">{FILE_CLAIM_COMMAND}</CodeBlock>
              </li>
              <li className="min-w-0">
                <h3 className="text-[1.05rem] font-semibold">2. It lands in your ledger</h3>
                <p className="mt-2 leading-relaxed text-pencil">
                  The claim appears left of the double rule while you watch, with no reload. The
                  right side stays blank, because nothing an agent sends can be written there.
                </p>
              </li>
              <li className="min-w-0">
                <h3 className="text-[1.05rem] font-semibold">3. You check it and sign</h3>
                <p className="mt-2 leading-relaxed text-pencil">
                  Run the test. Open the page. Then write down what you did. Verified goes in as
                  blue ink, wrong strikes the claim through in red, and not checked is recorded as
                  exactly that.
                </p>
              </li>
              <li className="min-w-0">
                <h3 className="text-[1.05rem] font-semibold">4. The ledger speaks for itself</h3>
                <p className="mt-2 leading-relaxed text-pencil">
                  Export it as a summary for a pull request or a write-up. Your agent reads what
                  you marked wrong and files its fix as a new claim, which waits for a verdict of
                  its own.
                </p>
              </li>
            </ol>
          </section>

          <section aria-labelledby="summary-heading" className="border-t border-print py-16">
            <h2 id="summary-heading" className="text-[1.75rem] font-bold tracking-tight">
              The summary you hand over
            </h2>
            <div className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div>
                <p className="leading-relaxed text-pencil">
                  This is the export of the example ledger at the top of this page, exactly as
                  the app writes it. It is built from the records alone, so it says what the
                  ledger says and nothing more. It keeps four things apart.
                </p>
                <dl className="mt-6 space-y-5">
                  <div>
                    <dt className="font-semibold">Wrong</dt>
                    <dd className="mt-1 leading-relaxed text-pencil">
                      What a person found to be false, in their own words.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Follow-ups</dt>
                    <dd className="mt-1 leading-relaxed text-pencil">
                      Which later claim answers which earlier one, and whether that fix has been
                      checked yet.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Verified</dt>
                    <dd className="mt-1 leading-relaxed text-pencil">
                      What a person checked, with what they did to check it.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Not checked, and waiting</dt>
                    <dd className="mt-1 leading-relaxed text-pencil">
                      What nobody verified, listed as exactly that.
                    </dd>
                  </div>
                </dl>
              </div>
              <CodeBlock className="max-h-[32rem] self-start overflow-y-auto md:max-h-none">
                {EXAMPLE_SUMMARY}
              </CodeBlock>
            </div>
          </section>

          <section aria-labelledby="why-heading" className="border-t border-print py-16">
            <h2 id="why-heading" className="text-[1.75rem] font-bold tracking-tight">
              Why an agent cannot sign for you
            </h2>
            <dl className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-2">
              <div>
                <dt className="font-semibold">It holds a different kind of token</dt>
                <dd className="mt-1.5 leading-relaxed text-pencil">
                  The DeepSpace CLI gives your agent a token scoped to this app&apos;s agent tools.
                  Verdicts are recorded by a route that accepts a signed-in person&apos;s session
                  and refuses that token.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">There is no tool for it</dt>
                <dd className="mt-1.5 leading-relaxed text-pencil">
                  An agent has three tools here:{' '}
                  <span className="font-agent text-[0.88em] text-print">list_ledgers</span>,{' '}
                  <span className="font-agent text-[0.88em] text-print">file_claim</span> and{' '}
                  <span className="font-agent text-[0.88em] text-print">list_claims</span>. It can
                  read what you marked wrong and file its fix as a new claim that follows the old
                  one. It cannot mark anything itself.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Nothing is rewritten</dt>
                <dd className="mt-1.5 leading-relaxed text-pencil">
                  Signoff has no way to edit a claim or a verdict, or to remove one on its own, for
                  you or for anyone. Changing your mind adds a new verdict and the earlier one stays
                  in the row&apos;s history. The only thing a keeper can delete is a whole ledger.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Private until you publish</dt>
                <dd className="mt-1.5 leading-relaxed text-pencil">
                  Only you can read a ledger until you publish it. After that, anyone with the link
                  can watch it live, and still nobody but you can write a verdict.
                </dd>
              </div>
            </dl>
            {SHOWCASE_LEDGER_ID && (
              <p className="mt-10 max-w-2xl leading-relaxed text-pencil">
                Each of these is a claim in the ledger of this app&apos;s own build, with the test
                or the steps that check it and what a person found.{' '}
                <Link
                  to={`/l/${SHOWCASE_LEDGER_ID}`}
                  className="font-medium text-print underline underline-offset-4 hover:text-ink"
                >
                  Read that ledger
                </Link>
                .
              </p>
            )}
          </section>
        </main>

        <footer className="border-t border-print">
          <div className="mx-auto max-w-6xl px-4 py-6 text-[0.85rem] text-pencil sm:px-8">
            {DISPLAY_NAME} runs on DeepSpace.
          </div>
        </footer>
      </div>
    </>
  )
}
