// src/lib/milb-shape/status-math.ts
//
// A minor-league pitcher's career path, as facts the finder can filter on: has he reached MLB, did he pitch there this season and how did it go, was he traded, how old is he, which
// organisation is he in. Pure functions over a PitcherStatus (built on the server from the MLB Stats API people record and the MLB results tables), so every rule is visible and tested.
// "How did it go in MLB" is MLB runs allowed per 100 pitches against the MLB average that season, shown with its pitch count; under a minimum it is "too few", never a guess.

export const MIN_MLB_PITCHES = 150      // MLB pitches this season before his MLB results are judged
export const STRUGGLE_RUNS = 0.3        // runs per 100 pitches worse (or better) than the MLB average
export const TRADE_DAYS = 365

export type PitcherStatus = {
  id: number
  age: number | null
  /** MLB debut date (YYYY-MM-DD); null = has never pitched in MLB */
  debut: string | null
  draftYear: number | null
  /** the MLB club he belongs to now (parent club for a minor-league club) and the club he is on now */
  orgId: number | null
  teamId: number | null
  /** dates (YYYY-MM-DD) of trades, newest last */
  trades: string[]
  /** optioned or sent to the minors at some point this season */
  optioned: boolean
  /** MLB pitches by season, and this season's runs allowed per 100 pitches with the pitches behind it */
  mlbPitches: Record<number, number>
  mlbRuns100: number | null
  mlbRvPitches: number
}

export type MlbHistory = 'any' | 'never' | 'before' | 'this-season' | 'sent-down'
export type MlbResults = 'any' | 'struggled' | 'good' | 'thin'
export type Moves = 'any' | 'traded-12' | 'traded-season' | 'not-traded'

/** Where he stands on reaching MLB: never pitched there, pitched there in an earlier season only, pitched there this season, or pitched there this season and was sent back down. */
export function mlbHistoryOf(s: PitcherStatus, season: number): Exclude<MlbHistory, 'any'> {
  const thisSeason = (s.mlbPitches[season] ?? 0) > 0
  if (thisSeason) return s.optioned ? 'sent-down' : 'this-season'
  const earlier = s.debut != null && s.debut < `${season}-01-01`
  return earlier || Object.entries(s.mlbPitches).some(([y, n]) => Number(y) < season && n > 0) ? 'before' : s.debut != null ? 'before' : 'never'
}

/** His MLB results this season against the MLB average: struggled (allowed 0.3+ more runs per 100), pitched well (0.3+ fewer) or thin (under 150 MLB pitches). null when he has no MLB pitches. */
export function mlbResultsOf(s: PitcherStatus, season: number, leagueRuns100: number | null): Exclude<MlbResults, 'any'> | null {
  if ((s.mlbPitches[season] ?? 0) === 0) return null
  if (s.mlbRuns100 == null || leagueRuns100 == null || s.mlbRvPitches < MIN_MLB_PITCHES) return 'thin'
  const d = s.mlbRuns100 - leagueRuns100
  return d >= STRUGGLE_RUNS ? 'struggled' : d <= -STRUGGLE_RUNS ? 'good' : null
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
/** Trades within `days` of `asOf` (YYYY-MM-DD). */
export const tradedWithin = (s: PitcherStatus, asOf: string, days: number) => s.trades.some(d => d <= asOf && dayDiff(d, asOf) <= days)
export const tradedThisSeason = (s: PitcherStatus, season: number) => s.trades.some(d => d >= `${season}-01-01` && d <= `${season}-12-31`)

export type Refine = {
  mlb: MlbHistory; results: MlbResults; moves: Moves
  ageMin: number | null; ageMax: number | null
  org: number | null
}
export const NO_REFINE: Refine = { mlb: 'any', results: 'any', moves: 'any', ageMin: null, ageMax: null, org: null }
export const isRefined = (r: Refine) => r.mlb !== 'any' || r.results !== 'any' || r.moves !== 'any' || r.ageMin != null || r.ageMax != null || r.org != null

/** Does a pitcher pass every choice? A pitcher whose status is unknown passes none of the status choices (so "never pitched in MLB" is never claimed without a record). */
export function passes(s: PitcherStatus | undefined, r: Refine, season: number, leagueRuns100: number | null, asOf: string): boolean {
  if (!isRefined(r)) return true
  if (!s) return false
  if (r.mlb !== 'any' && mlbHistoryOf(s, season) !== r.mlb) return false
  if (r.results !== 'any' && mlbResultsOf(s, season, leagueRuns100) !== r.results) return false
  if (r.moves === 'traded-12' && !tradedWithin(s, asOf, TRADE_DAYS)) return false
  if (r.moves === 'traded-season' && !tradedThisSeason(s, season)) return false
  if (r.moves === 'not-traded' && tradedWithin(s, asOf, TRADE_DAYS)) return false
  if (r.ageMin != null && (s.age == null || s.age < r.ageMin)) return false
  if (r.ageMax != null && (s.age == null || s.age > r.ageMax)) return false
  if (r.org != null && s.orgId !== r.org) return false
  return true
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthYear = (d: string) => `${MONTH[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`

/** Short facts for a list row or card header, each with its sample. */
export function statusChips(s: PitcherStatus | undefined, season: number, leagueRuns100: number | null, asOf: string): string[] {
  if (!s) return []
  const out: string[] = []
  if (s.age != null) out.push(`Age ${s.age}`)
  const h = mlbHistoryOf(s, season)
  if (h === 'never') out.push('Has not pitched in MLB')
  else if (h === 'before') out.push(s.debut ? `Debuted ${s.debut.slice(0, 4)}, none in MLB ${season}` : `Pitched in MLB before ${season}`)
  else {
    const n = s.mlbPitches[season] ?? 0
    const r = mlbResultsOf(s, season, leagueRuns100)
    const detail = r === 'thin' || s.mlbRuns100 == null || leagueRuns100 == null ? 'too few pitches to judge' : `${s.mlbRuns100 - leagueRuns100 >= 0 ? '+' : '−'}${Math.abs(s.mlbRuns100 - leagueRuns100).toFixed(2)} runs per 100 vs MLB average`
    out.push(`MLB ${season}: ${n.toLocaleString()} pitches, ${detail}${h === 'sent-down' ? ', since sent down' : ''}`)
  }
  const t = s.trades.filter(d => d <= asOf).slice(-1)[0]
  if (t && dayDiff(t, asOf) <= TRADE_DAYS) out.push(`Traded ${monthYear(t)}`)
  return out
}
