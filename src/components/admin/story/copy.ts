// src/components/admin/story/copy.ts
//
// Every fixed user-visible string for the story, plus tiny formatters.
// Content rules (CLAUDE.md §1): scouting language only. A vitest scan fails
// the build if any export here uses gambling or forecasting vocabulary.

export const BRAND_KICKER = 'X9LAB · SCOUT REPORT'
export const POST_KICKER = 'X9LAB · POSTSEASON SCOUT REPORT'
export const HOOK_FALLBACK = "Pitchers, bullpens, defense and form, tonight's scout report"

export const SP_KICKER = 'PROBABLE PITCHERS'
export const SP_HEADLINE = 'THE DUEL'
export const SP_LABEL_L3 = 'last 3 starts'


export const DEFENSE_HEADLINE = 'THE ALIGNMENT'
export const defenseKicker = (abbr: string) => `${abbr} DEFENSE`
export const defenseFooter = (confirmed: boolean) =>
  `Outs Above Average · 2026 season · ${confirmed ? 'Confirmed lineup' : 'Projected lineup'}`

export const STREAK_KICKER = 'STREAK WATCH'
export const STREAK_HEADLINE = 'STILL GOING'

export const FORM_KICKER = 'FORM · L15 GAMES'
export const FORM_HEATING = 'HEATING UP'
export const FORM_COOLING = 'COOLING OFF'
export const FORM_TREND_LABEL = 'last 8 rolling windows'

export const CLOSE_HEADLINE = 'Read the game like an analyst. Or a GM.'
export const CLOSE_SUB = 'Full scout report on the site'
export const CLOSE_URL_BASE = 'edgereportdaily.com/mlb'

export const scoutPill = (dateLabel: string) => `SCOUT REPORT · ${dateLabel}`
export const seriesPill = (label: string, game: number, of: number, dateLabel: string) =>
  `${label} · GAME ${game}${of > game || of > 1 ? ` OF ${of}` : ''} · ${dateLabel}`

// ── formatters ──────────────────────────────────────────────────────────
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 0.745 → ".745"; 1.012 → "1.012"; null → "—" */
export function fmt3(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(3).replace(/^(-?)0\./, '$1.')
}

export function fmtFixed(n: number | null | undefined, d = 2): string {
  return n == null || Number.isNaN(n) ? '—' : n.toFixed(d)
}

/** "2026-10-07" → "Oct 7" */
export function fmtShortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${MON[m - 1]} ${d}`
}

/** ["2026-10-04","2026-10-05","2026-10-06"] → "Oct 4–6"; across months "Sep 30–Oct 2" */
export function fmtDateRange(dates: string[]): string {
  if (dates.length === 0) return ''
  const first = dates[0], last = dates[dates.length - 1]
  if (first === last) return fmtShortDate(first)
  const [, m1] = first.split('-').map(Number)
  const [, m2, d2] = last.split('-').map(Number)
  return m1 === m2 ? `${fmtShortDate(first)}–${d2}` : `${fmtShortDate(first)}–${fmtShortDate(last)}`
}

export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')

// ── optional scout-desk segments ────────────────────────────────────────
export const TTO_KICKER = 'STARTING PITCHERS'
export const TTO_HEADLINE = 'THE ORDER FLIPS'
export const TTO_CAPTION = 'wOBA allowed, by time through the order'
export const TTO_CAPTION_AVG = 'Batting average allowed'
export const TTO_ROWS = ['1st time', '2nd time', '3rd time'] as const

export const lineupKicker = (abbr: string) => `${abbr} LINEUP`
export const LINEUP_HEADLINE = 'THE BATTING ORDER'
export const lineupFooter = (confirmed: boolean) => `Season AVG / OPS / RBI · ${confirmed ? 'Confirmed lineup' : 'Projected lineup'}`

export const LATE_KICKER = 'LATE & CLOSE'
export const LATE_HEADLINE = 'HOW THEY FINISH'
export const LATE_DIFF_CAPTION = 'Run differential by inning'
export const lateFoot = (games: number) => `OPS by split (under 60 PA left out) · run diff (RS − RA) in the 7th–9th, ${games} reg. season games`

export const RUN_KICKER = 'CATCHERS'
export const RUN_HEADLINE = 'BEHIND THE PLATE'
export const runFoot = (n: number, thru: string | null) =>
  `Bars vs catchers with 500+ inn${thru ? ` · framing/blocking/throwing data thru ${thru}` : ''} · pop time: Savant, min ${n} throws`

export const ABS_KICKER = 'CHALLENGES'
export const ABS_HEADLINE = 'ABS'
export const ABS_FOOT = '2026 reg. season · overturn rate = challenges won'

export const CLUB_KICKER = 'CLUB STATUS'
export const CLUB_HEADLINE = 'WHO IS OUT'
export const CLUB_FOOT = 'Injured list and day-to-day · 7-day moves'

export const ARS_KICKER = 'STARTING PITCHERS'
export const ARS_HEADLINE = 'THE ARSENAL'
export const ARS_FOOT = 'Usage = share of pitches · 2026 reg. season'

export const AVAIL_KICKER = 'BULLPEN'
export const AVAIL_HEADLINE = "WHO'S AVAILABLE"
