// src/lib/scout/abs-desk.ts
//
// Scout §4 (ABS challenge desk, 2026) — how a club uses the automated
// ball-strike challenge system, from the per-pitch abs_challenge_log table
// (built from MLB's own game feed: every playEvent whose reviewDetails.reviewType
// is "MJ" — see scripts/fetch_abs_challenge_log.py). It is the same data behind
// Savant's ABS boards; Savant's leaderboard endpoint itself is not used because
// it is erroring, and the per-pitch log is what carries who challenged and when.
//
// What can and cannot be said:
//   · rates are per GAME — a game with zero challenges has no row in the log, so
//     the denominator comes from the schedule (completed games through the last
//     date the log covers), never from the log itself
//   · "leverage" is not published; inning group (1–3 / 4–6 / 7+) is the honest
//     proxy for a late-game tendency, and is labelled as inning, not leverage
//   · the log is refreshed by a script — `coveredThrough` is the last date it
//     holds, and games after it are reported as not-yet-counted, never guessed
//   · every share and rate carries its n; the UI gates thin ones

import { createClient } from '@supabase/supabase-js'
import { MLB_TEAMS } from '@/lib/mlb-assets'
import { buildSituations, type SitRow, type Situations } from './situations'

const MLB = 'https://statsapi.mlb.com/api/v1'
const PAGE = 1000
const ROWS_TTL_MS = 10 * 60 * 1000
export const MIN_ABS_N = 5           // fewer challenges than this → shown faded
export const MIN_RANK_CHALLENGES = 20
const RECENT_GAMES = 15
const BASE_COLS = 'game_pk, game_date, inning, challenging_team_id, challenge_side, challenger_player_id, challenger_player_name, is_overturned'
const SITUATION_COLS = 'balls, strikes, outs, base_state, bat_diff'

type Row = {
  game_pk: number; game_date: string; inning: number
  challenging_team_id: number; challenge_side: 'batting' | 'fielding'
  challenger_player_id: number | null; challenger_player_name: string | null
  is_overturned: boolean
  // situation columns (scripts/sql/add_game_situations.sql) — null on rows loaded before the backfill
  balls?: number | null; strikes?: number | null; outs?: number | null; base_state?: string | null; bat_diff?: number | null
}

type Tally = { n: number; ov: number }
const t0 = (): Tally => ({ n: 0, ov: 0 })
const add = (t: Tally, r: Row) => { t.n += 1; if (r.is_overturned) t.ov += 1 }

export type Bucket = {
  games: number
  all: Tally
  batter: Tally      // batter-initiated (challenging a called strike)
  catcher: Tally     // catcher / pitcher-initiated (challenging a called ball)
  early: Tally; mid: Tally; late: Tally   // innings 1–3 / 4–6 / 7+
}

export type ChallengerLine = { id: number; name: string; side: 'batting' | 'fielding'; n: number; ov: number }

export type LeaderRow = {
  teamId: number; abbr: string; name: string
  games: number; challenges: number; overturns: number
  batter: number   // batter-initiated challenges
  late: number     // challenges in the 7th or later
}

export type AbsSituations = { club: Situations; league: Situations; coverage: { withSituation: number; total: number } }

export type AbsClub = {
  /** All 30 clubs, season to date — for the team leaderboard. */
  leaderboard: LeaderRow[]
  /** Per-inning challenge tallies (1st … 9th+), this club vs the league. */
  innings: { club: Situations; league: Situations }
  /** Count / outs / base / margin breakdowns — null until the situation columns are backfilled. */
  situations: AbsSituations | null
  coveredThrough: string
  /** Completed club games after coveredThrough (not counted). */
  uncountedGames: number
  season: Bucket
  recent: Bucket
  league: Bucket
  rank: { rate: number; overturn: number | null; of: number }
  /** One entry per completed club game the log covers, oldest → newest. */
  perGame: { date: string; challenges: number; overturns: number }[]
  challengers: ChallengerLine[]
  profile: { label: string; summary: string; lines: string[] }
}

// ─── Log rows (cached in-process — one 7k-row pull shared by every request) ───

let rowsCache: { at: number; rows: Row[] } | null = null

export async function getAbsRows(): Promise<Row[]> {
  if (rowsCache && Date.now() - rowsCache.at < ROWS_TTL_MS) return rowsCache.rows
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
  const rows: Row[] = []
  let withSituation = true
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supa.from('abs_challenge_log')
      .select(`${BASE_COLS}${withSituation ? `, ${SITUATION_COLS}` : ''}`)
      .order('play_id').range(offset, offset + PAGE - 1) as { data: Row[] | null; error: { code?: string; message: string } | null }
    if (error && withSituation && (error.code === '42703' || /column .* does not exist/i.test(error.message))) {
      // situation columns not added yet — fall back to the base columns and start over
      withSituation = false; rows.length = 0; offset = -PAGE
      continue
    }
    if (error) { console.error('[scout] abs_challenge_log query failed:', error.message); break }
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < PAGE) break
  }
  if (rows.length > 0) rowsCache = { at: Date.now(), rows }
  return rows
}

// ─── Schedule → completed games per club ─────────────────────────────────

type SchedGame = { pk: number; date: string }
async function getClubGames(season: string, throughDate: string): Promise<Map<number, SchedGame[]>> {
  const byTeam = new Map<number, SchedGame[]>()
  const res = await fetch(
    `${MLB}/schedule?sportId=1&season=${season}&gameType=R&startDate=${season}-03-01&endDate=${throughDate}` +
      '&fields=dates,date,games,gamePk,officialDate,status,abstractGameState,teams,away,home,team,id',
    { next: { revalidate: 3600 }, signal: AbortSignal.timeout(20000) },
  )
  if (!res.ok) return byTeam
  for (const d of (await res.json()).dates ?? []) for (const g of d.games ?? []) {
    if (g.status?.abstractGameState !== 'Final') continue
    for (const side of ['away', 'home'] as const) {
      const id = g.teams?.[side]?.team?.id
      if (!id) continue
      byTeam.set(id, [...(byTeam.get(id) ?? []), { pk: g.gamePk, date: g.officialDate ?? d.date }])
    }
  }
  return byTeam
}

// ─── Tallies ─────────────────────────────────────────────────────────────

function emptyBucket(games: number): Bucket {
  return { games, all: t0(), batter: t0(), catcher: t0(), early: t0(), mid: t0(), late: t0() }
}
function tally(b: Bucket, r: Row) {
  add(b.all, r)
  add(r.challenge_side === 'batting' ? b.batter : b.catcher, r)
  add(r.inning <= 3 ? b.early : r.inning <= 6 ? b.mid : b.late, r)
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null)

// ─── Entry point ─────────────────────────────────────────────────────────

export async function getAbsDesk(teamId: number, abbr: string, gameDate: string): Promise<AbsClub | null> {
  try {
    const rows = await getAbsRows()
    if (rows.length === 0) return null
    const coveredThrough = rows.reduce((m, r) => (r.game_date > m ? r.game_date : m), '')
    const season = gameDate.slice(0, 4)
    const yesterday = new Date(`${gameDate}T12:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const clubGames = await getClubGames(season, yesterday.toISOString().slice(0, 10))

    const myAll = clubGames.get(teamId) ?? []
    const covered = myAll.filter((g) => g.date <= coveredThrough)
    if (covered.length === 0) return null
    const recentGames = covered.slice(-RECENT_GAMES)
    const recentPks = new Set(recentGames.map((g) => g.pk))
    const coveredPks = new Set(covered.map((g) => g.pk))

    // Per-team season buckets (all 30 clubs) — for the league line and the ranks.
    const teamBuckets = new Map<number, Bucket>()
    for (const [id, games] of clubGames) teamBuckets.set(id, emptyBucket(games.filter((g) => g.date <= coveredThrough).length))
    const league = emptyBucket([...teamBuckets.values()].reduce((a, b) => a + b.games, 0))
    const season_ = teamBuckets.get(teamId) ?? emptyBucket(covered.length)
    const recent = emptyBucket(recentGames.length)
    const perGameMap = new Map<number, { challenges: number; overturns: number }>()
    const byPlayer = new Map<number, ChallengerLine>()

    for (const r of rows) {
      const tb = teamBuckets.get(r.challenging_team_id)
      if (tb) tally(tb, r)
      tally(league, r)
      if (r.challenging_team_id !== teamId) continue
      if (coveredPks.has(r.game_pk)) {
        const g = perGameMap.get(r.game_pk) ?? { challenges: 0, overturns: 0 }
        g.challenges += 1; if (r.is_overturned) g.overturns += 1
        perGameMap.set(r.game_pk, g)
      }
      if (recentPks.has(r.game_pk)) tally(recent, r)
      if (r.challenger_player_id != null && r.challenger_player_name) {
        const p = byPlayer.get(r.challenger_player_id) ?? { id: r.challenger_player_id, name: r.challenger_player_name, side: r.challenge_side, n: 0, ov: 0 }
        p.n += 1; if (r.is_overturned) p.ov += 1
        byPlayer.set(r.challenger_player_id, p)
      }
    }

    // ranks: challenge rate (1 = most per game), overturn rate (1 = highest, min sample)
    const ranked = [...teamBuckets.entries()].filter(([, b]) => b.games > 0)
    const byRate = [...ranked].sort((a, b) => b[1].all.n / b[1].games - a[1].all.n / a[1].games).map(([id]) => id)
    const byOv = ranked.filter(([, b]) => b.all.n >= MIN_RANK_CHALLENGES)
      .sort((a, b) => b[1].all.ov / b[1].all.n - a[1].all.ov / a[1].all.n).map(([id]) => id)
    const rank = { rate: byRate.indexOf(teamId) + 1, overturn: byOv.includes(teamId) ? byOv.indexOf(teamId) + 1 : null, of: ranked.length }

    const perGame = covered.map((g) => ({ date: g.date, ...(perGameMap.get(g.pk) ?? { challenges: 0, overturns: 0 }) }))
    const challengers = [...byPlayer.values()].sort((a, b) => b.n - a.n)
    const uncountedGames = myAll.filter((g) => g.date > coveredThrough).length

    const toSit = (r: Row): SitRow => {
      const bs = r.base_state ?? null
      return {
        balls: r.balls ?? null, strikes: r.strikes ?? null, outs: r.outs ?? null, inning: r.inning,
        margin: r.bat_diff == null ? null : r.challenge_side === 'batting' ? r.bat_diff : -r.bat_diff,
        kind: bs == null ? null : bs === '000' ? 'empty' : bs[1] === '1' || bs[2] === '1' ? 'risp' : 'on',
        ok: r.is_overturned,
      }
    }
    const clubSit = buildSituations(rows.filter((r) => r.challenging_team_id === teamId).map(toSit))
    const leagueSit = buildSituations(rows.map(toSit))
    const leaderboard: LeaderRow[] = [...teamBuckets.entries()].map(([id, b]) => ({
      teamId: id, abbr: MLB_TEAMS[id]?.abbr ?? String(id), name: MLB_TEAMS[id]?.name ?? String(id),
      games: b.games, challenges: b.all.n, overturns: b.all.ov, batter: b.batter.n, late: b.late.n,
    })).filter((r) => r.games > 0)

    return {
      leaderboard, innings: { club: clubSit, league: leagueSit },
      situations: clubSit.withSituation > 0 ? { club: clubSit, league: leagueSit, coverage: { withSituation: leagueSit.withSituation, total: leagueSit.total.n } } : null,
      coveredThrough, uncountedGames, season: season_, recent, league, rank, perGame, challengers,
      profile: buildProfile(abbr, season_, recent, league, rank),
    }
  } catch (err) {
    console.error('[scout] abs desk failed:', abbr, err)
    return null
  }
}

// ─── Plain-language profile — information, not advice ────────────────────

function buildProfile(abbr: string, s: Bucket, recent: Bucket, lg: Bucket, rank: AbsClub['rank']): AbsClub['profile'] {
  const rate = s.games > 0 ? s.all.n / s.games : 0
  const lgRate = lg.games > 0 ? lg.all.n / lg.games : 0
  const ratio = lgRate > 0 ? rate / lgRate : 1
  const ov = s.all.n > 0 ? s.all.ov / s.all.n : null
  const lgOv = lg.all.n > 0 ? lg.all.ov / lg.all.n : null

  const label = s.all.n < 30 ? 'Too few challenges to profile'
    : ratio >= 1.2 ? 'Aggressive — challenges more than the league'
    : ratio <= 0.8 ? 'Conserves — challenges less than the league'
    : 'Near the league rate'

  const lines: string[] = []
  lines.push(`${abbr} challenges ${rate.toFixed(2)} times a game (${s.all.n} in ${s.games} games; league ${lgRate.toFixed(2)}) — ${rank.rate}${ord(rank.rate)} most of ${rank.of}.`)
  if (ov != null) lines.push(`${Math.round(ov * 100)}% are overturned${lgOv != null ? ` (league ${Math.round(lgOv * 100)}%)` : ''}${rank.overturn ? ` — ${rank.overturn}${ord(rank.overturn)} best of ${rank.of}` : ''}.`)
  const bShare = pct(s.batter.n, s.all.n), lgB = pct(lg.batter.n, lg.all.n)
  if (bShare != null) lines.push(`Batters start ${bShare}% of the club's challenges and the catcher/pitcher ${100 - bShare}% (league ${lgB}/${lgB != null ? 100 - lgB : '—'}). Batters succeed ${pct(s.batter.ov, s.batter.n) ?? '—'}% (n=${s.batter.n}), catchers ${pct(s.catcher.ov, s.catcher.n) ?? '—'}% (n=${s.catcher.n}).`)
  const late = pct(s.late.n, s.all.n), lgLate = pct(lg.late.n, lg.all.n)
  if (late != null) lines.push(`${late}% of challenges come in the 7th or later (league ${lgLate}%); ${pct(s.late.ov, s.late.n) ?? '—'}% of those are overturned (n=${s.late.n}).`)
  if (recent.all.n > 0 && recent.games > 0) lines.push(`Last ${recent.games} games: ${(recent.all.n / recent.games).toFixed(2)} a game, ${pct(recent.all.ov, recent.all.n)}% overturned (n=${recent.all.n}).`)

  const summary = s.all.n < 30 ? `${abbr} has only ${s.all.n} logged challenges — too few to call a pattern.`
    : `${abbr} challenges at ${ratio.toFixed(2)}× the league rate${ov != null && lgOv != null ? `, ${ov >= lgOv + 0.05 ? 'and more of its challenges succeed than the league average' : ov <= lgOv - 0.05 ? 'and fewer of its challenges succeed than the league average' : 'with about the league-average success rate'}` : ''}.`
  return { label, summary, lines }
}

function ord(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
}
