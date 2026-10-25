// Parses a game slug ("new-york-yankees-vs-boston-red-sox-2026-09-27", optional "-game2" suffix)
// into display names and a date, for page titles, h1s and JSON-LD. Returns null when the slug
// does not name two known clubs, so callers can fall back to a plain title.
import { MLB_TEAMS } from '@/lib/teams'

const longSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const BY_LONG = new Map(MLB_TEAMS.map(t => [longSlug(t.name), t]))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type ParsedGameSlug = {
  awayName: string
  homeName: string
  awayShort: string
  homeShort: string
  awayAbbr: string
  homeAbbr: string
  date: string // YYYY-MM-DD
  dateLabel: string // "Sep 27"
}

export function parseGameSlug(slug: string): ParsedGameSlug | null {
  const m = /^(.+)-vs-(.+)-(\d{4})-(\d{2})-(\d{2})(?:-game\d+)?$/.exec(slug)
  if (!m) return null
  const away = BY_LONG.get(m[1])
  const home = BY_LONG.get(m[2])
  if (!away || !home) return null
  return {
    awayName: away.name,
    homeName: home.name,
    awayShort: away.short,
    homeShort: home.short,
    awayAbbr: away.abbrev,
    homeAbbr: home.abbrev,
    date: `${m[3]}-${m[4]}-${m[5]}`,
    dateLabel: `${MONTHS[Number(m[4]) - 1]} ${Number(m[5])}`,
  }
}

/** "{Away} vs {Home}, {Mon D}" - short club names if the full names would run past 60 characters with the site suffix. */
export function gameTitle(p: ParsedGameSlug, extra = ''): string {
  const full = `${p.awayName} vs ${p.homeName}${extra}, ${p.dateLabel}`
  return full.length + 8 <= 60 ? full : `${p.awayShort} vs ${p.homeShort}${extra}, ${p.dateLabel}`
}

/** Clamp a description to 140-160 characters: trim at a word boundary if long, append fillers if short. */
export function fitDescription(base: string, fillers: string[] = []): string {
  let d = base
  for (const f of fillers) {
    if (d.length >= 140) break
    d = `${d} ${f}`
  }
  if (d.length > 160) {
    d = d.slice(0, 157).replace(/\s+\S*$/, '') + '...'
  }
  return d
}
