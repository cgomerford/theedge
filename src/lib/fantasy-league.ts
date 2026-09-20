/**
 * src/lib/fantasy-league.ts
 *
 * Grade a user-uploaded fantasy roster against real data only:
 *   - ESPN public-league ownership (fantasy_ownership snapshot)
 *   - MLB Stats API identity + season counting stats (bulk people hydrate)
 *   - Remaining regular-season schedule + announced probable pitchers
 *   - Today's Edge fantasy picks (start/sit/pickup/trade-high/buy-low)
 *
 * Expected points = this player's real 2026 per-game (hitters) or
 * per-start (starters) rates, applied to remaining scheduled games /
 * announced probable starts. That is a rate extrapolation, not a
 * Steamer/ZiPS forecast — labelled as such in the UI.
 *
 * Pitchers with no announced probable start are not projected onto a
 * guessed rotation. Reliever appearances are not on the schedule, so
 * RP expected points stay null rather than inventing appearance volume.
 *
 * Contract / free-agent year is NOT in the MLB Stats API person payload
 * (verified 2026-09-15). The Pro outlook returns `contractYear: null`
 * rather than inventing one.
 */

import { searchPeople } from '@/lib/lab'
import { getFantasyPicks, type FantasyPick } from '@/lib/fantasy'
import { getOwnershipIndex, normalizeName, type OwnershipIndexRow } from '@/lib/fantasy-ownership'
import { getBatterVenueRecord } from '@/lib/batter-venue-record'
import { getPitcherVenueRecord } from '@/lib/pitcher-venue-record'
import { getPitcherTeamRecord, type TeamRecordRow } from '@/lib/pitcher-start-trends'
import { getBatterVsPitcher, type BatterVsPitcher } from '@/lib/batter-stats'
import {
  numOrNaN,
  parseInningsPitched,
  scaleHitting,
  scalePitching,
  scoreHitting,
  scorePitching,
  singlesFromHits,
  type HittingCounting,
  type PitchingCounting,
  type ScoringPlatform,
} from '@/lib/fantasy-scoring'
import { MLB_TEAMS } from '@/lib/teams'

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const MAX_ROSTER = 40
const SEASON = new Date().getFullYear()

// ESPN baseball defaultPositionId (player position, not roster slot)
const ESPN_POS: Record<number, string> = {
  1: 'SP', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS',
  7: 'LF', 8: 'CF', 9: 'RF', 10: 'DH', 11: 'RP',
}

type MlbStatBlock = {
  group?: { displayName?: string }
  splits?: { stat?: Record<string, unknown> }[]
}

type MlbPersonJson = {
  id?: number
  fullName?: string
  primaryPosition?: { abbreviation?: string }
  currentTeam?: { id?: number; abbreviation?: string }
  stats?: MlbStatBlock[]
}

type MlbSideJson = {
  team?: { id?: number; name?: string }
  probablePitcher?: { id?: number; fullName?: string }
}

type MlbGameJson = {
  gamePk?: number
  gameType?: string
  officialDate?: string
  ifNecessary?: string
  status?: { detailedState?: string }
  venue?: { id?: number; name?: string }
  teams?: { home?: MlbSideJson; away?: MlbSideJson }
}

type MlbDateJson = {
  date?: string
  games?: MlbGameJson[]
}

type EspnLeagueJson = {
  teams?: {
    id?: number
    location?: string
    nickname?: string
    abbrev?: string
    roster?: {
      entries?: {
        playerId?: number
        playerPoolEntry?: {
          player?: {
            id?: number
            fullName?: string
            defaultPositionId?: number
          }
        }
      }[]
    }
  }[]
}

const TEAM_ABBREV = new Set(MLB_TEAMS.map(t => t.abbrev.toUpperCase()))
const POS_TOKENS = new Set([
  'C', '1B', '2B', '3B', 'SS', 'IF', 'INF', 'LF', 'CF', 'RF', 'OF', 'DH',
  'SP', 'RP', 'P', 'TWP', 'UTIL', 'UT', 'BN', 'BENCH', 'IL', 'NA',
])

export type LeaguePlatform = ScoringPlatform

export type RosterEntryIn = {
  name: string
  mlbId?: number | null
  slot?: string | null
}

export type RemainingGame = {
  gamePk: number
  date: string
  venueId: number | null
  venueName: string | null
  opponentTeamId: number
  opponentName: string
  isHome: boolean
  probablePitcherId: number | null
  probablePitcherName: string | null
}

export type ActionKind = 'START' | 'SIT' | 'PICKUP' | 'TRADE_HIGH' | 'BUY_LOW'

export type LeagueAction = {
  kind: ActionKind
  mlbId: number | null
  name: string
  reason: string
  ownership: number | null
  signal: number | null
  weekPoints: number | null
}

export type GradedPlayer = {
  mlbId: number
  name: string
  teamId: number | null
  teamAbbr: string | null
  mlbPos: string
  slot: string | null
  role: 'batter' | 'pitcher' | 'two-way'
  ownership: number | null
  signal: number | null
  pickType: string | null
  valueGap: number | null
  weekGames: number
  rosGames: number
  confirmedStartsWeek: number
  confirmedStartsRos: number
  weekPoints: number | null
  rosPoints: number | null
  weekBreakdown: { label: string; value: number; contribution: number }[]
  action: ActionKind | null
  actionReason: string | null
  nextOpponent: string | null
  nextProbablePitcher: string | null
}

export type LeagueGrade = {
  letter: string
  score: number
  production: number
  volume: number
  value: number | null
  weekPoints: number
  rosPoints: number | null
  meanOwnership: number | null
  nRostered: number
  nUnmatched: number
}

export type GradeResult = {
  platform: LeaguePlatform
  weekStart: string
  weekEnd: string
  rosThrough: string | null
  methodology: string
  grade: LeagueGrade
  players: GradedPlayer[]
  unmatched: { name: string; slot: string | null }[]
  actions: Record<ActionKind, LeagueAction[]>
}

export type EspnImportedTeam = {
  id: number
  name: string
  abbrev: string
  players: { name: string; mlbId: number | null; slot: string | null; espnId: number }[]
}

type HittingSeason = HittingCounting & { games: number; pa: number }
type PitchingSeason = PitchingCounting & { games: number; gamesStarted: number; gamesPitched: number }

type PersonBundle = {
  id: number
  name: string
  pos: string
  teamId: number | null
  teamAbbr: string | null
  hitting: HittingSeason | null
  pitching: PitchingSeason | null
}

function isPitcherPos(pos: string): boolean {
  return pos === 'P' || pos === 'SP' || pos === 'RP'
}

function roleFor(pos: string, hitting: HittingSeason | null, pitching: PitchingSeason | null): GradedPlayer['role'] {
  if (pos === 'TWP') return 'two-way'
  if (isPitcherPos(pos)) return 'pitcher'
  // Two-way without the TWP code: real PA and real GS in the same season.
  if (hitting && hitting.pa >= 50 && pitching && pitching.gamesStarted >= 3) return 'two-way'
  if (isPitcherPos(pos) || (pitching && pitching.gamesPitched > 0 && (!hitting || hitting.pa < 20))) return 'pitcher'
  return 'batter'
}

function starterShare(p: PitchingSeason): number {
  if (p.gamesPitched <= 0) return 0
  return p.gamesStarted / p.gamesPitched
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n))
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function nyToday(): { ymd: string; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: map[get('weekday')] ?? 1,
  }
}

export function getH2hWeekBounds(): { start: string; end: string; today: string } {
  const { ymd, weekday } = nyToday()
  const fromMonday = weekday === 0 ? 6 : weekday - 1
  const start = addDaysYmd(ymd, -fromMonday)
  return { start, end: addDaysYmd(start, 6), today: ymd }
}

/** Strip rank numbers, team abbrevs, and position codes from a pasted roster line. */
export function cleanPlayerName(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^\d+[\.\)]\s*/, '')
  s = s.replace(/\s+/g, ' ')
  // "Judge, Aaron" → "Aaron Judge"
  if (/^[^,]+,\s*[^,]+$/.test(s) && !s.includes(' Jr')) {
    const [last, first] = s.split(',').map(x => x.trim())
    if (first && last) s = `${first} ${last}`
  }
  const tokens = s.split(' ')
  const kept: string[] = []
  for (const t of tokens) {
    const u = t.replace(/[^A-Za-z]/g, '').toUpperCase()
    if (!u) continue
    if (TEAM_ABBREV.has(u) || POS_TOKENS.has(u)) continue
    kept.push(t)
  }
  return (kept.length >= 2 ? kept.join(' ') : s).trim()
}

export function parseRosterText(text: string): RosterEntryIn[] {
  const lines = text
    .split(/[\n;]+/)
    .map(l => l.trim())
    .filter(Boolean)
  const out: RosterEntryIn[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    if (/^(player|name|roster|team|pos|position)\b/i.test(line) && line.includes(',')) continue
    const parts = line.split(',').map(p => p.trim()).filter(Boolean)
    const second = parts[1]?.replace(/[^A-Za-z]/g, '').toUpperCase() ?? ''
    const csvLine = parts.length >= 3 || (parts.length === 2 && (TEAM_ABBREV.has(second) || POS_TOKENS.has(second)))
    const namePart = csvLine ? (parts[0] ?? line) : line
    const slot = csvLine
      ? (parts.find(p => POS_TOKENS.has(p.replace(/[^A-Za-z]/g, '').toUpperCase())) ?? null)
      : null
    const name = cleanPlayerName(namePart)
    if (name.length < 3) continue
    const key = normalizeName(name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, slot })
    if (out.length >= MAX_ROSTER) break
  }
  return out
}

async function fetchPeople(ids: number[]): Promise<Map<number, PersonBundle>> {
  const result = new Map<number, PersonBundle>()
  if (ids.length === 0) return result
  const unique = [...new Set(ids)].slice(0, MAX_ROSTER)
  const hydrate = `currentTeam,stats(group=[hitting,pitching],type=season,season=${SEASON})`
  const url = `${MLB_API}/people?personIds=${unique.join(',')}&hydrate=${encodeURIComponent(hydrate)}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return result
  const json = await res.json() as { people?: MlbPersonJson[] }
  for (const p of json.people ?? []) {
    const id = Number(p.id)
    if (!Number.isFinite(id)) continue
    let hitting: HittingSeason | null = null
    let pitching: PitchingSeason | null = null
    for (const block of p.stats ?? []) {
      const group = String(block.group?.displayName ?? '').toLowerCase()
      const st = block.splits?.[0]?.stat
      if (!st) continue
      if (group === 'hitting') {
        const games = numOrNaN(st.gamesPlayed)
        const hits = numOrNaN(st.hits)
        const doubles = numOrNaN(st.doubles)
        const triples = numOrNaN(st.triples)
        const hr = numOrNaN(st.homeRuns)
        if (![games, hits, doubles, triples, hr].every(Number.isFinite) || games <= 0) continue
        hitting = {
          games,
          pa: numOrNaN(st.plateAppearances),
          singles: singlesFromHits(hits, doubles, triples, hr),
          doubles, triples, hr,
          r: numOrNaN(st.runs),
          rbi: numOrNaN(st.rbi),
          bb: numOrNaN(st.baseOnBalls),
          k: numOrNaN(st.strikeOuts),
          sb: numOrNaN(st.stolenBases),
          hbp: numOrNaN(st.hitByPitch),
          cs: numOrNaN(st.caughtStealing),
        }
      }
      if (group === 'pitching') {
        const gamesPitched = numOrNaN(st.gamesPitched ?? st.gamesPlayed)
        const ip = parseInningsPitched(st.inningsPitched)
        if (!Number.isFinite(gamesPitched) || gamesPitched <= 0 || !Number.isFinite(ip)) continue
        pitching = {
          games: gamesPitched,
          gamesPitched,
          gamesStarted: numOrNaN(st.gamesStarted) || 0,
          ip,
          k: numOrNaN(st.strikeOuts),
          er: numOrNaN(st.earnedRuns),
          bb: numOrNaN(st.baseOnBalls),
          h: numOrNaN(st.hits),
          w: numOrNaN(st.wins) || 0,
          sv: numOrNaN(st.saves) || 0,
          hld: numOrNaN(st.holds) || 0,
        }
      }
    }
    const teamId = p.currentTeam?.id != null ? Number(p.currentTeam.id) : null
    const team = teamId != null ? MLB_TEAMS.find(t => t.id === teamId) : undefined
    result.set(id, {
      id,
      name: p.fullName ?? `#${id}`,
      pos: p.primaryPosition?.abbreviation ?? '',
      teamId,
      teamAbbr: team?.abbrev ?? p.currentTeam?.abbreviation ?? null,
      hitting,
      pitching,
    })
  }
  return result
}

type ScheduleGame = {
  gamePk: number
  date: string
  venueId: number | null
  venueName: string | null
  homeTeamId: number
  awayTeamId: number
  homeName: string
  awayName: string
  homeProbableId: number | null
  homeProbableName: string | null
  awayProbableId: number | null
  awayProbableName: string | null
}

async function fetchRemainingSchedule(today: string): Promise<ScheduleGame[]> {
  const end = `${SEASON}-10-15`
  const url =
    `${MLB_API}/schedule?sportId=1&startDate=${today}&endDate=${end}` +
    `&hydrate=${encodeURIComponent('probablePitcher,venue,team')}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return []
  const json = await res.json() as { dates?: MlbDateJson[] }
  const games: ScheduleGame[] = []
  for (const d of json.dates ?? []) {
    for (const g of d.games ?? []) {
      if (g.gameType !== 'R') continue
      const state = String(g.status?.detailedState ?? '')
      if (/cancel|postpone/i.test(state)) continue
      if (g.ifNecessary === 'Y') continue
      const home = g.teams?.home
      const away = g.teams?.away
      const homeTeamId = Number(home?.team?.id)
      const awayTeamId = Number(away?.team?.id)
      if (!Number.isFinite(homeTeamId) || !Number.isFinite(awayTeamId)) continue
      games.push({
        gamePk: Number(g.gamePk),
        date: String(d.date ?? g.officialDate),
        venueId: g.venue?.id != null ? Number(g.venue.id) : null,
        venueName: g.venue?.name ?? null,
        homeTeamId,
        awayTeamId,
        homeName: home?.team?.name ?? 'Home',
        awayName: away?.team?.name ?? 'Away',
        homeProbableId: home?.probablePitcher?.id != null ? Number(home.probablePitcher.id) : null,
        homeProbableName: home?.probablePitcher?.fullName ?? null,
        awayProbableId: away?.probablePitcher?.id != null ? Number(away.probablePitcher.id) : null,
        awayProbableName: away?.probablePitcher?.fullName ?? null,
      })
    }
  }
  return games
}

function gamesForTeam(all: ScheduleGame[], teamId: number, from: string, to: string): RemainingGame[] {
  const out: RemainingGame[] = []
  for (const g of all) {
    if (g.date < from || g.date > to) continue
    const isHome = g.homeTeamId === teamId
    if (!isHome && g.awayTeamId !== teamId) continue
    out.push({
      gamePk: g.gamePk,
      date: g.date,
      venueId: g.venueId,
      venueName: g.venueName,
      opponentTeamId: isHome ? g.awayTeamId : g.homeTeamId,
      opponentName: isHome ? g.awayName : g.homeName,
      isHome,
      probablePitcherId: isHome ? g.awayProbableId : g.homeProbableId,
      probablePitcherName: isHome ? g.awayProbableName : g.homeProbableName,
    })
  }
  return out
}

function confirmedStarts(all: ScheduleGame[], pitcherId: number, from: string, to: string): RemainingGame[] {
  const out: RemainingGame[] = []
  for (const g of all) {
    if (g.date < from || g.date > to) continue
    const asHome = g.homeProbableId === pitcherId
    const asAway = g.awayProbableId === pitcherId
    if (!asHome && !asAway) continue
    out.push({
      gamePk: g.gamePk,
      date: g.date,
      venueId: g.venueId,
      venueName: g.venueName,
      opponentTeamId: asHome ? g.awayTeamId : g.homeTeamId,
      opponentName: asHome ? g.awayName : g.homeName,
      isHome: asHome,
      probablePitcherId: pitcherId,
      probablePitcherName: asHome ? g.homeProbableName : g.awayProbableName,
    })
  }
  return out
}

function perGameHitting(s: HittingSeason): HittingCounting {
  const g = s.games
  return {
    singles: s.singles / g,
    doubles: s.doubles / g,
    triples: s.triples / g,
    hr: s.hr / g,
    r: s.r / g,
    rbi: s.rbi / g,
    bb: s.bb / g,
    k: s.k / g,
    sb: s.sb / g,
    hbp: Number.isFinite(s.hbp) ? s.hbp / g : 0,
    cs: Number.isFinite(s.cs) ? s.cs / g : 0,
  }
}

function perStartPitching(s: PitchingSeason): PitchingCounting | null {
  const n = s.gamesStarted > 0 ? s.gamesStarted : 0
  if (n <= 0) return null
  return {
    ip: s.ip / n,
    k: s.k / n,
    er: s.er / n,
    bb: s.bb / n,
    h: s.h / n,
    w: s.w / n,
    sv: 0,
    hld: 0,
  }
}

async function resolveEntries(
  entries: RosterEntryIn[],
  ownership: { byMlbId: Map<number, OwnershipIndexRow>; byName: Map<string, OwnershipIndexRow> },
): Promise<{ resolved: { mlbId: number; name: string; slot: string | null }[]; unmatched: { name: string; slot: string | null }[] }> {
  const resolved: { mlbId: number; name: string; slot: string | null }[] = []
  const unmatched: { name: string; slot: string | null }[] = []
  const used = new Set<number>()

  for (const e of entries.slice(0, MAX_ROSTER)) {
    const slot = e.slot ?? null
    if (e.mlbId && Number.isFinite(e.mlbId)) {
      if (!used.has(e.mlbId)) {
        used.add(e.mlbId)
        resolved.push({ mlbId: e.mlbId, name: e.name, slot })
      }
      continue
    }
    const cleaned = cleanPlayerName(e.name)
    const own = ownership.byName.get(normalizeName(cleaned))
    if (own?.mlb_player_id && !used.has(own.mlb_player_id)) {
      used.add(own.mlb_player_id)
      resolved.push({ mlbId: own.mlb_player_id, name: own.full_name || cleaned, slot })
      continue
    }
    const people = (await searchPeople(cleaned)) as { id: number; fullName: string; primaryPosition: string }[]
    const exact = people.filter(p => normalizeName(p.fullName) === normalizeName(cleaned))
    const hit = exact.length === 1 ? exact[0] : (people.length === 1 ? people[0] : null)
    if (hit && !used.has(hit.id)) {
      used.add(hit.id)
      resolved.push({ mlbId: hit.id, name: hit.fullName, slot })
      continue
    }
    unmatched.push({ name: cleaned, slot })
  }
  return { resolved, unmatched }
}

function letterFor(score: number): string {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B+'
  if (score >= 60) return 'B'
  if (score >= 50) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export async function gradeRoster(opts: {
  entries: RosterEntryIn[]
  platform: LeaguePlatform
  includeRos: boolean
}): Promise<GradeResult> {
  const platform = opts.platform
  const week = getH2hWeekBounds()
  const ownership = await getOwnershipIndex()
  const { resolved, unmatched } = await resolveEntries(opts.entries, ownership)
  const [people, schedule, picksBundle] = await Promise.all([
    fetchPeople(resolved.map(r => r.mlbId)),
    fetchRemainingSchedule(week.today),
    getFantasyPicks(),
  ])

  const rosThrough = schedule.length ? schedule.reduce((m, g) => (g.date > m ? g.date : m), schedule[0].date) : null

  const pickByMlb = new Map<number, FantasyPick>()
  for (const list of Object.values(picksBundle.picks)) {
    for (const p of list as FantasyPick[]) {
      if (p.player_id != null) pickByMlb.set(p.player_id, p)
    }
  }

  const players: GradedPlayer[] = []
  const rosterIds = new Set(resolved.map(r => r.mlbId))

  for (const r of resolved) {
    const person = people.get(r.mlbId)
    if (!person) {
      unmatched.push({ name: r.name, slot: r.slot })
      continue
    }
    const own = ownership.byMlbId.get(r.mlbId)
      ?? ownership.byName.get(normalizeName(person.name))
    const pick = pickByMlb.get(r.mlbId)
    const role = roleFor(person.pos, person.hitting, person.pitching)
    const teamGamesWeek = person.teamId != null ? gamesForTeam(schedule, person.teamId, week.start, week.end) : []
    const teamGamesRos = person.teamId != null && rosThrough
      ? gamesForTeam(schedule, person.teamId, week.today, rosThrough)
      : []
    const startsWeek = confirmedStarts(schedule, r.mlbId, week.start, week.end)
    const startsRos = rosThrough ? confirmedStarts(schedule, r.mlbId, week.today, rosThrough) : []

    let weekPoints: number | null = null
    let rosPoints: number | null = null
    const weekBreakdown: GradedPlayer['weekBreakdown'] = []

    const addPts = (pts: number, breakdown: { label: string; value: number; contribution: number }[], into: 'week' | 'ros') => {
      if (into === 'week') {
        weekPoints = (weekPoints ?? 0) + pts
        if (weekBreakdown.length === 0) weekBreakdown.push(...breakdown)
      } else {
        rosPoints = (rosPoints ?? 0) + pts
      }
    }

    if ((role === 'batter' || role === 'two-way') && person.hitting && person.hitting.games > 0) {
      const rate = perGameHitting(person.hitting)
      if (teamGamesWeek.length > 0) {
        const scored = scoreHitting(platform, scaleHitting(rate, teamGamesWeek.length))
        addPts(scored.points, scored.breakdown, 'week')
      } else {
        weekPoints = weekPoints ?? 0
      }
      if (opts.includeRos && teamGamesRos.length > 0) {
        const scored = scoreHitting(platform, scaleHitting(rate, teamGamesRos.length))
        addPts(scored.points, scored.breakdown, 'ros')
      }
    }

    if (role === 'pitcher' || role === 'two-way') {
      const pitching = person.pitching
      if (pitching) {
        const isStarter = starterShare(pitching) >= 0.5
        if (isStarter) {
          const rate = perStartPitching(pitching)
          if (rate && startsWeek.length > 0) {
            const scored = scorePitching(platform, scalePitching(rate, startsWeek.length))
            addPts(scored.points, scored.breakdown, 'week')
          } else if (startsWeek.length === 0) {
            weekPoints = weekPoints ?? 0
          }
          if (opts.includeRos && rate && startsRos.length > 0) {
            const scored = scorePitching(platform, scalePitching(rate, startsRos.length))
            addPts(scored.points, scored.breakdown, 'ros')
          }
        } else {
          // Reliever appearances are not on the MLB probable-pitcher
          // schedule. Do not multiply per-appearance rates by remaining
          // team games — that invents volume. Week/ROS points stay null.
        }
      }
    }

    const ownershipPct = own?.percent_owned ?? null
    const signal = pick?.signal_score ?? null
    const valueGap = ownershipPct != null && signal != null ? Math.round(signal - ownershipPct) : null

    const nextG = teamGamesWeek[0] ?? teamGamesRos[0] ?? null
    const nextStart = startsWeek[0] ?? startsRos[0] ?? null

    players.push({
      mlbId: r.mlbId,
      name: person.name,
      teamId: person.teamId,
      teamAbbr: person.teamAbbr,
      mlbPos: person.pos || (r.slot ?? ''),
      slot: r.slot,
      role,
      ownership: ownershipPct,
      signal,
      pickType: pick?.pick_type ?? null,
      valueGap,
      weekGames: teamGamesWeek.length,
      rosGames: teamGamesRos.length,
      confirmedStartsWeek: startsWeek.length,
      confirmedStartsRos: startsRos.length,
      weekPoints: weekPoints != null ? Math.round(weekPoints * 10) / 10 : null,
      rosPoints: rosPoints != null ? Math.round(rosPoints * 10) / 10 : null,
      weekBreakdown,
      action: null,
      actionReason: null,
      nextOpponent: (nextStart ?? nextG)?.opponentName ?? null,
      nextProbablePitcher: nextG?.probablePitcherName ?? null,
    })
  }

  // Actions against THIS roster
  const actions: Record<ActionKind, LeagueAction[]> = {
    START: [], SIT: [], PICKUP: [], TRADE_HIGH: [], BUY_LOW: [],
  }

  for (const p of players) {
    const cooler = p.pickType === 'cooler' || p.pickType === 'faller'
    const riser = p.pickType === 'riser'
    const pitching = people.get(p.mlbId)?.pitching
    const isStarter = pitching != null && starterShare(pitching) >= 0.5
    if (p.role === 'pitcher' && isStarter) {
      if (p.confirmedStartsWeek > 0) {
        p.action = 'START'
        p.actionReason = `Confirmed start this week${p.nextOpponent ? ` vs ${p.nextOpponent}` : ''}.`
        actions.START.push(toAction(p))
        if (riser) {
          actions.TRADE_HIGH.push({ ...toAction(p), kind: 'TRADE_HIGH', reason: 'Riser with a confirmed start — highest perceived value right now.' })
        }
      } else {
        p.action = 'SIT'
        p.actionReason = 'No confirmed probable start this week — we do not guess the rotation.'
        actions.SIT.push(toAction(p))
      }
    } else if (cooler) {
      p.action = 'SIT'
      p.actionReason = p.pickType === 'cooler' ? 'Cooling vs his own baseline on today\'s slate.' : 'Falling on today\'s slate.'
      actions.SIT.push(toAction(p))
    } else if (riser) {
      p.action = 'START'
      p.actionReason = 'Heating up vs his own baseline.'
      actions.START.push(toAction(p))
      actions.TRADE_HIGH.push({ ...toAction(p), kind: 'TRADE_HIGH', reason: 'Riser — highest perceived value right now.' })
    } else if ((p.weekGames > 0 || p.confirmedStartsWeek > 0) && (p.weekPoints ?? 0) > 0) {
      p.action = 'START'
      p.actionReason = p.weekGames > 0
        ? `${p.weekGames} scheduled game${p.weekGames === 1 ? '' : 's'} this week.`
        : 'On the slate this week.'
      actions.START.push(toAction(p))
    }
  }

  const waiverCats = new Set(['streamer', 'sleeper', 'riser', 'mover'])
  for (const list of Object.values(picksBundle.picks)) {
    for (const pick of list as FantasyPick[]) {
      if (pick.player_id != null && rosterIds.has(pick.player_id)) continue
      const own = pick.player_id != null ? ownership.byMlbId.get(pick.player_id)?.percent_owned ?? null : ownership.byName.get(normalizeName(pick.player_name))?.percent_owned ?? null
      const signal = pick.signal_score
      if (waiverCats.has(pick.pick_type) && (signal ?? 0) >= 55 && (own == null || own < 40)) {
        actions.PICKUP.push({
          kind: 'PICKUP',
          mlbId: pick.player_id,
          name: pick.player_name,
          reason: pick.one_liner || `${pick.pick_type} · under 40% owned`,
          ownership: own,
          signal,
          weekPoints: null,
        })
      }
      if ((pick.pick_type === 'faller' || pick.pick_type === 'cooler') && own != null && own >= 40) {
        actions.BUY_LOW.push({
          kind: 'BUY_LOW',
          mlbId: pick.player_id,
          name: pick.player_name,
          reason: pick.one_liner || 'Performing below baseline — buy-low if the owner is panicking.',
          ownership: own,
          signal,
          weekPoints: null,
        })
      }
    }
  }

  const cap = (arr: LeagueAction[], n: number) => arr
    .sort((a, b) => (b.signal ?? 0) - (a.signal ?? 0))
    .slice(0, n)
  actions.START = cap(actions.START, 12)
  actions.SIT = cap(actions.SIT, 12)
  actions.PICKUP = cap(actions.PICKUP, 10)
  actions.TRADE_HIGH = cap(actions.TRADE_HIGH, 8)
  actions.BUY_LOW = cap(actions.BUY_LOW, 8)

  const n = players.length
  const weekTotal = players.reduce((s, p) => s + (p.weekPoints ?? 0), 0)
  const rosTotal = players.reduce((s, p) => s + (p.rosPoints ?? 0), 0)
  const owned = players.map(p => p.ownership).filter((x): x is number => x != null)
  const meanOwnership = owned.length ? owned.reduce((a, b) => a + b, 0) / owned.length : null
  const avgWeek = n > 0 ? weekTotal / n : 0
  // 12 pts/player/week is a strong H2H points roster in a 12-team league.
  const production = clamp((avgWeek / 12) * 100)
  const usable = players.filter(p => (p.weekGames > 0 && p.role !== 'pitcher') || p.confirmedStartsWeek > 0 || (p.role === 'pitcher' && (p.weekPoints ?? 0) > 0)).length
  const volume = n > 0 ? clamp((usable / n) * 100) : 0
  const gaps = players.map(p => p.valueGap).filter((x): x is number => x != null)
  const value = gaps.length ? clamp(50 + gaps.reduce((a, b) => a + b, 0) / gaps.length) : null
  const score = value != null
    ? Math.round(production * 0.5 + volume * 0.25 + value * 0.25)
    : Math.round(production * 0.65 + volume * 0.35)

  return {
    platform,
    weekStart: week.start,
    weekEnd: week.end,
    rosThrough,
    methodology:
      'Expected points = this player\'s real 2026 per-game (hitters) or per-start (announced starters) rates, run through standard platform scoring, applied only to remaining scheduled regular-season games / confirmed probable starts. Reliever appearances are not on the schedule, so RP expected points stay blank rather than guessed. Not a Steamer/ZiPS forecast. ESPN QS points omitted (MLB season split has no qualityStarts). Contract year is not in the MLB Stats API.',
    grade: {
      letter: letterFor(score),
      score,
      production: Math.round(production),
      volume: Math.round(volume),
      value: value != null ? Math.round(value) : null,
      weekPoints: Math.round(weekTotal * 10) / 10,
      rosPoints: opts.includeRos ? Math.round(rosTotal * 10) / 10 : null,
      meanOwnership: meanOwnership != null ? Math.round(meanOwnership * 10) / 10 : null,
      nRostered: n,
      nUnmatched: unmatched.length,
    },
    players,
    unmatched,
    actions,
  }
}

function toAction(p: GradedPlayer): LeagueAction {
  return {
    kind: p.action ?? 'START',
    mlbId: p.mlbId,
    name: p.name,
    reason: p.actionReason ?? '',
    ownership: p.ownership,
    signal: p.signal,
    weekPoints: p.weekPoints,
  }
}

export async function importEspnLeague(leagueId: number): Promise<{
  ok: true
  season: number
  teams: EspnImportedTeam[]
} | { ok: false; status: number; error: string }> {
  if (!Number.isFinite(leagueId) || leagueId <= 0) {
    return { ok: false, status: 400, error: 'Need a numeric ESPN league ID.' }
  }
  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/${SEASON}/segments/0/leagues/${leagueId}` +
    `?view=mTeam&view=mRoster&view=mSettings`
  const res = await fetch(url, { next: { revalidate: 300 }, headers: { Accept: 'application/json' } })
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      status: res.status,
      error: 'That ESPN league is private. Public leagues import here; for private ones, paste the roster instead.',
    }
  }
  if (res.status === 404) {
    return { ok: false, status: 404, error: 'No ESPN fantasy baseball league with that ID for this season.' }
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: `ESPN returned ${res.status}. Paste the roster instead.` }
  }
  const json = await res.json() as EspnLeagueJson
  const ownership = await getOwnershipIndex()
  const teams: EspnImportedTeam[] = []
  for (const t of json.teams ?? []) {
    const players: EspnImportedTeam['players'] = []
    for (const entry of t.roster?.entries ?? []) {
      const player = entry.playerPoolEntry?.player
      if (!player?.fullName) continue
      const espnId = Number(player.id ?? entry.playerId)
      const posId = Number(player.defaultPositionId)
      const slot = Number.isFinite(posId) ? (ESPN_POS[posId] ?? null) : null
      const own = Number.isFinite(espnId)
        ? ownership.byEspnId.get(espnId) ?? ownership.byName.get(normalizeName(player.fullName))
        : ownership.byName.get(normalizeName(player.fullName))
      players.push({
        name: player.fullName,
        mlbId: own?.mlb_player_id ?? null,
        slot,
        espnId: Number.isFinite(espnId) ? espnId : 0,
      })
    }
    teams.push({
      id: Number(t.id),
      name: [t.location, t.nickname].filter(Boolean).join(' ').trim() || t.abbrev || `Team ${t.id}`,
      abbrev: t.abbrev ?? '',
      players,
    })
  }
  if (teams.length === 0) {
    return { ok: false, status: 422, error: 'ESPN returned the league but no rosters. Paste the roster instead.' }
  }
  return { ok: true, season: SEASON, teams }
}

export type PlayerOutlook = {
  mlbId: number
  name: string
  role: GradedPlayer['role']
  remainingGames: RemainingGame[]
  confirmedStarts: RemainingGame[]
  parks: {
    venueId: number | null
    venueName: string
    remaining: number
    seasonOps?: string | null
    seasonEra?: number | null
    seasonGames?: number
    note: string
  }[]
  vsAnnouncedPitchers: {
    pitcherId: number
    pitcherName: string
    date: string
    h2h: BatterVsPitcher | null
    sample: 'career' | 'none'
  }[]
  vsAnnouncedOpponents: {
    opponentId: number
    opponentName: string
    date: string
    record: TeamRecordRow | null
  }[]
  contractYear: null
  contractNote: string
}

export async function getPlayerOutlook(mlbId: number): Promise<PlayerOutlook | null> {
  const week = getH2hWeekBounds()
  const [people, schedule] = await Promise.all([
    fetchPeople([mlbId]),
    fetchRemainingSchedule(week.today),
  ])
  const person = people.get(mlbId)
  if (!person) return null
  const role = roleFor(person.pos, person.hitting, person.pitching)
  const rosThrough = schedule.length ? schedule.reduce((m, g) => (g.date > m ? g.date : m), schedule[0].date) : week.end
  const remainingGames = person.teamId != null ? gamesForTeam(schedule, person.teamId, week.today, rosThrough) : []
  const starts = confirmedStarts(schedule, mlbId, week.today, rosThrough)

  const parkCounts = new Map<string, { venueId: number | null; venueName: string; remaining: number }>()
  for (const g of remainingGames) {
    const key = g.venueId != null ? String(g.venueId) : g.venueName ?? 'unknown'
    const cur = parkCounts.get(key) ?? { venueId: g.venueId, venueName: g.venueName ?? 'Unknown park', remaining: 0 }
    cur.remaining++
    parkCounts.set(key, cur)
  }

  const parks: PlayerOutlook['parks'] = []
  if (role !== 'pitcher') {
    const venueRows = await getBatterVenueRecord(mlbId, SEASON, 'season')
    const byId = new Map(venueRows.filter(v => v.venueId != null).map(v => [v.venueId as number, v]))
    const byName = new Map(venueRows.map(v => [v.venue.toLowerCase(), v]))
    for (const p of parkCounts.values()) {
      const row = (p.venueId != null ? byId.get(p.venueId) : undefined) ?? byName.get(p.venueName.toLowerCase())
      parks.push({
        venueId: p.venueId,
        venueName: p.venueName,
        remaining: p.remaining,
        seasonOps: row?.ops ?? null,
        seasonGames: row?.games,
        note: row
          ? `${row.games} game${row.games === 1 ? '' : 's'} there this season · ${row.avg}/${row.obp}/${row.slg}`
          : 'No season games at this park yet.',
      })
    }
  } else {
    const venueRows = await getPitcherVenueRecord(mlbId, SEASON, 'season')
    const byId = new Map(venueRows.filter(v => v.venueId != null).map(v => [v.venueId as number, v]))
    const byName = new Map(venueRows.map(v => [v.venue.toLowerCase(), v]))
    const startParks = new Map<string, { venueId: number | null; venueName: string; remaining: number }>()
    for (const g of starts) {
      const key = g.venueId != null ? String(g.venueId) : g.venueName ?? 'unknown'
      const cur = startParks.get(key) ?? { venueId: g.venueId, venueName: g.venueName ?? 'Unknown park', remaining: 0 }
      cur.remaining++
      startParks.set(key, cur)
    }
    for (const p of (startParks.size ? startParks : parkCounts).values()) {
      const row = (p.venueId != null ? byId.get(p.venueId) : undefined) ?? byName.get(p.venueName.toLowerCase())
      parks.push({
        venueId: p.venueId,
        venueName: p.venueName,
        remaining: p.remaining,
        seasonEra: row?.era ?? null,
        seasonGames: row?.starts,
        note: row
          ? `${row.starts} start${row.starts === 1 ? '' : 's'} there this season · ${row.wins}-${row.losses}${row.era != null ? ` · ${row.era.toFixed(2)} ERA` : ''}`
          : 'No season starts at this park yet.',
      })
    }
  }

  const vsAnnouncedPitchers: PlayerOutlook['vsAnnouncedPitchers'] = []
  if (role !== 'pitcher') {
    const seen = new Set<number>()
    for (const g of remainingGames) {
      if (g.probablePitcherId == null || seen.has(g.probablePitcherId)) continue
      seen.add(g.probablePitcherId)
      const h2h = await getBatterVsPitcher(mlbId, g.probablePitcherId)
      const hasSample = h2h != null && h2h.ab > 0
      vsAnnouncedPitchers.push({
        pitcherId: g.probablePitcherId,
        pitcherName: g.probablePitcherName ?? `#${g.probablePitcherId}`,
        date: g.date,
        h2h: hasSample ? h2h : null,
        sample: hasSample ? 'career' : 'none',
      })
      if (vsAnnouncedPitchers.length >= 6) break
    }
  }

  const vsAnnouncedOpponents: PlayerOutlook['vsAnnouncedOpponents'] = []
  if (role !== 'batter') {
    const records = await getPitcherTeamRecord(mlbId, SEASON, 'season')
    const seen = new Set<number>()
    for (const g of starts) {
      if (seen.has(g.opponentTeamId)) continue
      seen.add(g.opponentTeamId)
      const rec = records.find(r => r.opponentId === g.opponentTeamId) ?? null
      vsAnnouncedOpponents.push({
        opponentId: g.opponentTeamId,
        opponentName: g.opponentName,
        date: g.date,
        record: rec,
      })
    }
  }

  return {
    mlbId,
    name: person.name,
    role,
    remainingGames: remainingGames.slice(0, 20),
    confirmedStarts: starts,
    parks,
    vsAnnouncedPitchers,
    vsAnnouncedOpponents,
    contractYear: null,
    contractNote:
      'MLB Stats API people payloads have no free-agent / contract year (verified). We will not invent one. Keeper/dynasty contract outlook stays locked until a verified source is wired.',
  }
}
