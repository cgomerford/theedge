// src/components/admin/story/pitcher/copy.ts
//
// Fixed strings + tiny formatters for the Pitcher Reel. Scouting language only
// (CLAUDE.md §1): the layout check scans rendered text for gambling/forecast words.

export const PR_KICKER = 'X9LAB · PITCHER REPORT'
export const ARS_KICKER = 'PITCH MIX'
export const ARS_HEADLINE = 'THE ARSENAL'
export const COUNTS_KICKER = 'LOCATION BY COUNT'
export const COUNTS_HEADLINE = 'COUNT BY COUNT'
export const ARM_KICKER = 'ARM ANGLE'
export const ARM_HEADLINE = 'THE ARM SLOT'
export const HITS_KICKER = 'HITS ALLOWED'
export const TTO_KICKER = 'THROUGH THE ORDER'
export const TTO_HEADLINE = 'EVERY LAP'
export const SEASON_KICKER = 'THIS START VS SEASON'
export const SEASON_HEADLINE = 'THE COMPARISON'
export const NEXT_KICKER = "WHAT'S NEXT"
export const NEXT_HEADLINE = 'NEXT START'
export const PR_CLOSE_HEADLINE = 'Every pitch, in context.'
export const PR_CLOSE_SUB = 'Full game reports on the site'
export const PR_CLOSE_URL = 'edgereportdaily.com'

/** Savant arm angle is measured up from horizontal: 0° sidearm, 90° straight over the top. */
export function armSlot(deg: number): string {
  if (deg >= 65) return 'Over the top'
  if (deg >= 45) return 'Three-quarters'
  if (deg >= 25) return 'Low three-quarters'
  return 'Sidearm'
}

export const hitsHeadline = (n: number) => `${n} ${n === 1 ? 'HIT' : 'HITS'}`

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-14" → "Wed, Oct 14" (UTC math: no timezone drift) */
export function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${MON[m - 1]} ${d}`
}

export function daysBetween(a: string, b: string): number {
  const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((t(b) - t(a)) / 86400000)
}

/** .245 style; null → "—" */
export function avg3(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? '—' : n.toFixed(3).replace(/^0\./, '.')
}

/** Box-score names arrive as "M. Fried"; the headline wants just the last name(s). */
export const lastName = (name: string) => name.trim().replace(/^\S+\s+/, '') || name

export const shortPitch = (n: string) => n.replace(/^(4|Four)-Seam Fastball$/, '4-Seam')
