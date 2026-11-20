/**
 * Theme catalog. Colour values live in styles.css (@theme); this file is
 * metadata only.
 */

export const THEMES = [
  {
    id: 'ledger',
    label: 'Ledger',
    description: 'Eye-ease green ledger paper, graphite print, blue ink, red pen.',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

/** Read the currently active theme id from <html data-theme>. */
export function getActiveTheme(): ThemeId {
  if (typeof document === 'undefined') return 'ledger'
  const id = document.documentElement.getAttribute('data-theme') as ThemeId | null
  return id ?? 'ledger'
}

/** Look up a theme entry by id, or fall back to the first theme. */
export function getTheme(id: string) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
