// src/lib/fielding-bible.ts
//
// Defensive Runs Saved (DRS) by player and season, from The Fielding Bible archive's public leaderboard (archive.fieldingbible.com/DRSLeaderboard),
// whose numbers come from Sports Info Solutions. Read on demand for the admin chart builder only, never during a public page render.
// The page is an ASP.NET form. Its default view is the newest season, every fielder, no minimum innings. An older season takes two form posts
// (the end-year list resets when the start year changes), each answered with a ~3 MB page, so the parsed rows (about 150 KB) are cached in Supabase
// (savant_fetch_cache): 6 hours for the current season, 30 days for a finished one. Attribution: The Fielding Bible / Sports Info Solutions.

import { withSavantCache } from '@/lib/savant-cache'
import { logOnce } from '@/lib/log'

const URL_ = 'https://archive.fieldingbible.com/DRSLeaderboard'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const F = 'ctl00$cphContent$'

export type DrsRow = { name: string; innings: number | null; part: number | null; sb: number | null; bunts: number | null; gfp: number | null; adjEr: number | null; strikeZone: number | null; gdp: number | null; ofArm: number | null; drs: number | null }

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const c = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(c) ? String.fromCodePoint(c) : m }
  return entities[e.toLowerCase()] ?? m
})
const cellText = (c: string) => decode(c.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
const num = (s: string): number | null => { const t = s.replace(/^\+/, '').replace(/[−–]/g, '-'); if (t === '') return null; const x = Number(t); return Number.isFinite(x) ? x : null }
/** Baseball notation: 1323.2 means 1323 and two thirds. */
export const inningsOf = (s: string): number | null => { const m = s.match(/^(\d+)(?:\.(\d))?$/); return m ? Math.round((Number(m[1]) + Number(m[2] ?? 0) / 3) * 10) / 10 : null }

/** The leaderboard rows from a page of the archive. [] when the grid is not on the page. */
export function parseDrsPage(html: string): DrsRow[] {
  const i = html.indexOf('cphContent_grdvwDRSLeaderboard')
  if (i < 0) return []
  const end = html.indexOf('</table>', i)
  const rows = [...html.slice(i, end < 0 ? undefined : end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => cellText(c[1])))
  const out: DrsRow[] = []
  for (const c of rows) {
    if (c.length < 11 || c[0] === 'Name' || !c[0]) continue
    out.push({ name: c[0], innings: inningsOf(c[1]), part: num(c[2]), sb: num(c[3]), bunts: num(c[4]), gfp: num(c[5]), adjEr: num(c[6]), strikeZone: num(c[7]), gdp: num(c[8]), ofArm: num(c[9]), drs: num(c[10]) })
  }
  return out
}

const hidden = (html: string, name: string) => { const m = html.match(new RegExp(`name="${name.replace(/[$]/g, '\\$')}"[^>]*value="([^"]*)"`)) ?? html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`)); return m ? decode(m[1]) : '' }
const years = (html: string) => [...(html.match(/name="ctl00\$cphContent\$ddlStartYear"[\s\S]*?<\/select>/)?.[0] ?? '').matchAll(/value="(\d{4})"/g)].map(m => Number(m[1]))

async function post(html: string, target: string, year: number): Promise<string> {
  const body = new URLSearchParams({
    __EVENTTARGET: target, __EVENTARGUMENT: '', __VIEWSTATE: hidden(html, '__VIEWSTATE'), __VIEWSTATEGENERATOR: hidden(html, '__VIEWSTATEGENERATOR'), __EVENTVALIDATION: hidden(html, '__EVENTVALIDATION'),
    [`${F}ddlPosition`]: '-123456789', [`${F}ddlStartYear`]: String(year), [`${F}ddlEndYear`]: String(year), [`${F}ddlTeam`]: '-1', [`${F}txbMinInnings`]: '0',
  })
  const res = await fetch(URL_, { method: 'POST', body, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, cache: 'no-store', signal: AbortSignal.timeout(40000) })
  if (!res.ok) throw new Error(`Fielding Bible answered ${res.status}`)
  return res.text()
}

async function fetchSeason(season: number): Promise<DrsRow[]> {
  try {
    const res = await fetch(URL_, { headers: { 'User-Agent': UA }, cache: 'no-store', signal: AbortSignal.timeout(40000) })
    if (!res.ok) throw new Error(`Fielding Bible answered ${res.status}`)
    const first = await res.text()
    const avail = years(first)
    if (!avail.includes(season)) return []
    if (season === avail[0]) return parseDrsPage(first)
    // An older season: set the start year, then the end year on the page that comes back.
    const second = await post(first, `${F}ddlStartYear`, season)
    return parseDrsPage(await post(second, `${F}ddlEndYear`, season))
  } catch (e) {
    logOnce(`fielding-bible:${season}`, 'fielding-bible', `DRS ${season} fetch failed`, e)
    return []
  }
}

/** DRS rows for one season (every fielder, any innings). Cached in Supabase; [] when the archive does not answer. */
export async function getDrs(season: number): Promise<DrsRow[]> {
  const current = season >= new Date().getFullYear()
  return withSavantCache(`fieldingbible_drs_${season}`, current ? 6 * 3600 : 30 * 86400, () => fetchSeason(season))
}
