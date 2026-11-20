/**
 * Top bar: the wordmark, the one nav link, and the account menu.
 *
 * The data-testid hooks (`app-navigation`, `nav-sign-in-button`,
 * `nav-user-name`, `nav-user-email`) are what the test suites look for.
 */

import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, signOut } from 'deepspace'
import { ChevronDown, LogOut } from 'lucide-react'
import { DISPLAY_NAME } from '../constants'
import type { Role } from '../constants'
import { nav } from '../nav'
import { cn } from '../lib/utils'
import { Mark } from './Mark'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui'

export default function Navigation() {
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const location = useLocation()
  const [showAuthModal, setShowAuthModal] = useState(false)

  const profileReady = !isSignedIn || (!userLoading && !!user)
  const userRole = (user?.role ?? 'anonymous') as Role | 'anonymous'

  const visibleNav = nav.filter((item) => {
    if (item.devOnly && !import.meta.env.DEV) return false
    if (!item.roles) return true
    if (!profileReady) return false
    if (userRole === 'admin') return true
    return item.roles.includes(userRole as Role)
  })

  return (
    <>
      <nav data-testid="app-navigation" className="border-b border-print bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4 sm:px-8">
          <Link
            to="/home"
            className="flex items-center gap-2 text-[1.1rem] font-bold tracking-tight text-print"
          >
            <Mark />
            {DISPLAY_NAME}
          </Link>

          <div className="flex items-center">
            {visibleNav.map((item) => {
              const active = location.pathname.startsWith(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'px-2 py-1.5 text-[0.92rem]',
                    active
                      ? 'font-semibold text-print underline decoration-2 underline-offset-[6px]'
                      : 'text-pencil hover:text-print',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>

          <div className="flex-1" />

          {!isLoaded ? null : isSignedIn && !profileReady ? (
            /* Signed in, profile still loading: a placeholder, never the Sign
               in button (that would offer sign-in to a signed-in person). */
            <div className="flex items-center gap-2 py-1">
              <div className="h-7 w-7 animate-pulse rounded-full bg-muted" />
              <div className="hidden h-4 w-24 animate-pulse rounded-md bg-muted sm:block" />
            </div>
          ) : isSignedIn && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    aria-label="Account menu"
                    className="group flex items-center gap-2 rounded-md py-1 pl-1 pr-2 text-[0.92rem] hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Avatar className="h-7 w-7 border border-print">
                      <AvatarImage src={user.imageUrl ?? undefined} referrerPolicy="no-referrer" />
                      <AvatarFallback className="text-[0.75rem]">
                        {(user.name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      data-testid="nav-user-name"
                      className="hidden max-w-[160px] truncate text-print sm:inline"
                    >
                      {user.name || user.email}
                    </span>
                    <ChevronDown
                      className="h-3.5 w-3.5 text-pencil transition-transform duration-150 group-data-[popup-open]:rotate-180"
                      aria-hidden
                    />
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <div className="truncate font-medium text-foreground">
                    {user.name || 'Signed in'}
                  </div>
                  <div
                    data-testid="nav-user-email"
                    className="truncate text-xs font-normal text-muted-foreground"
                  >
                    {user.email}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              data-testid="nav-sign-in-button"
              onClick={() => setShowAuthModal(true)}
            >
              Sign in
            </Button>
          )}
        </div>
      </nav>

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </>
  )
}
