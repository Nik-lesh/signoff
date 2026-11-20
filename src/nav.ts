/**
 * Navigation Config
 *
 * One entry per nav item. Routes are handled by generouted (file-based routing
 * in src/pages/); this only controls what appears in the navigation bar.
 */

import type { Role } from './constants'

export interface NavItem {
  path: string
  label: string
  roles?: Role[]
  devOnly?: boolean
}

export const nav: NavItem[] = [{ path: '/home', label: 'Ledgers' }]
