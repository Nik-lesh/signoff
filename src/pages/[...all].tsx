import { Link } from 'react-router-dom'
import { DISPLAY_NAME } from '../constants'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-start justify-center px-6 sm:mx-auto sm:max-w-xl">
      <title>{`Page not found · ${DISPLAY_NAME}`}</title>
      <meta name="robots" content="noindex" />
      <p className="font-agent text-[0.9rem] text-pencil">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-print">
        There is no page at this address
      </h1>
      <p className="mt-3 text-pencil">
        The link may be mistyped. Ledgers live under /l/, and yours are listed on the ledgers page.
      </p>
      <Link
        to="/home"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go to your ledgers
      </Link>
    </div>
  )
}
