// src/lib/team-profile/roster.ts
//
// The people behind the team numbers: who is on the active roster, what they
// have done this season, and what the pitching staff throws.
//
// Sources (all read-only; single-writer rules are unaffected):
//   • MLB Stats API roster hydrate — ONE call per team:
//     /teams/{id}/roster?rosterType=active&hydrate=person(stats(group=[hitting,
//     pitching],type=[season])) — curl-verified: returns person.{pitchHand,
//     batSide,birthDate,birthCountry,primaryPosition} and stats[].splits[0].stat.
//   • Supabase `pitch_arsenals` (written by scripts/fetch_pitch_arsenals.py —
//     that script is the only writer; this file only reads). Rows are
//     per pitcher × pitch type with `count` (pitches), `percentage` (usage),
//     `avg_velocity`, `whiff_percent`.
//
// PITCH-MIX CAVEATS (shown in the UI, not hidden):
//   - Team mix weights each pitcher's pitch types by `count`, over the CURRENT
//     active-roster pitchers only. It is the staff as it stands today, not
//     every pitch the club threw this season.
//   - Whiff% is pitch-weighted (count × whiff_percent), because swing counts
//     are not stored. It is a comparison aid, not Savant's official team figure.
//   - Velocity is averaged only over rows that have one (about 2/3 of rows).
//   - Pro quality columns (xwOBA against, hard-hit %, put-away %, K %, BA against,
//     horizontal/vertical break) are pitch-weighted the same way, only over rows
//     that carry that column. Curl-checked populated on 2026 rows (2026-09-20).
//
// `pitch_arsenals` has ~3,900 rows a season, over PostgREST's 1,000-row cap, so
// the league baseline is paginated (CLAUDE.md gotcha) and cached in-process.

import { createAdminClient } from '@/lib/supabase'
import { ipToDecimal, num } from './league'

const MLB = 'https://statsapi.mlb.com/api/v1'

export type PitcherLine = {
  id: number; name: string; hand: 'L' | 'R' | null; age: number | null; country: string | null
  g: number; gs: number; ip: number; era: number | null; whip: number | null
  so: number; bb: number; hr: number; bf: number
  k9: number | null; bb9: number | null; kPct: number | null; bbPct: number | null
  saves: number; holds: number; role: 'SP' | 'RP'
  hbp: number; fip: number | null; kbbPct: number | null
}

export type HitterLine = {
  id: number; name: string; pos: string; bats: 'L' | 'R' | 'S' | null; age: number | null; country: string | null
  pa: number; avg: number | null; obp: number | null; slg: number | null; ops: number | null
  hr: number; rbi: number; sb: number; so: number; bb: number; iso: number | null
}

export type RosterProfile = { pitchers: PitcherLine[]; hitters: HitterLine[] }

function ageOf(birthDate: string | undefined): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate), now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--
  return a
}

export async function getRosterProfile(teamId: number, season: number, cFIP: number): Promise<RosterProfile | null> {
  try {
    const hydrate = `person(stats(group=[hitting,pitching],type=[season],season=${season}))`
    const url = `${MLB}/teams/${teamId}/roster?rosterType=active&season=${season}&hydrate=${encodeURIComponent(hydrate)}`
    const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(12000) })
    if (!res.ok) {
      console.error('[getRosterProfile] MLB API error:', res.status)
      return null
    }
    const json = await res.json()
    const pitchers: PitcherLine[] = []
    const hitters: HitterLine[] = []

    for (const e of json.roster ?? []) {
      const p = e.person
      if (!p?.id) continue
      const pos: string = e.position?.abbreviation ?? ''
      const statOf = (group: string): Record<string, unknown> | null => {
        const block = (p.stats ?? []).find((s: any) => s.group?.displayName === group)
        return block?.splits?.[0]?.stat ?? null
      }
      const pit = statOf('pitching')
      const hit = statOf('hitting')

      if ((pos === 'P' || pos === 'TWP') && pit) {
        const g = Number(pit.gamesPlayed ?? pit.gamesPitched ?? 0), gs = Number(pit.gamesStarted ?? 0)
        const ip = ipToDecimal(pit.inningsPitched), bf = Number(pit.battersFaced ?? 0)
        const so = Number(pit.strikeOuts ?? 0), bb = Number(pit.baseOnBalls ?? 0)
        pitchers.push({
          id: p.id, name: p.fullName, hand: p.pitchHand?.code === 'L' ? 'L' : p.pitchHand?.code === 'R' ? 'R' : null,
          age: ageOf(p.birthDate), country: p.birthCountry ?? null,
          g, gs, ip, era: num(pit.era), whip: num(pit.whip), so, bb, hr: Number(pit.homeRuns ?? 0), bf,
          k9: ip > 0 ? (so * 9) / ip : null, bb9: ip > 0 ? (bb * 9) / ip : null,
          kPct: bf > 0 ? so / bf : null, bbPct: bf > 0 ? bb / bf : null,
          saves: Number(pit.saves ?? 0), holds: Number(pit.holds ?? 0),
          // Same idea as the reliever ratio used elsewhere in the app: mostly-started = starter.
          role: g > 0 && gs / g >= 0.5 ? 'SP' : 'RP',
          hbp: Number(pit.hitBatsmen ?? 0),
          // Same FIP definition as league.ts (constant from this season's league totals).
          fip: ip > 0 ? (13 * Number(pit.homeRuns ?? 0) + 3 * (bb + Number(pit.hitBatsmen ?? 0)) - 2 * so) / ip + cFIP : null,
          kbbPct: bf > 0 ? (so - bb) / bf : null,
        })
      }
      if (pos !== 'P' && hit) {
        const avg = num(hit.avg), slg = num(hit.slg)
        hitters.push({
          id: p.id, name: p.fullName, pos, bats: p.batSide?.code === 'L' || p.batSide?.code === 'R' || p.batSide?.code === 'S' ? p.batSide.code : null,
          age: ageOf(p.birthDate), country: p.birthCountry ?? null,
          pa: Number(hit.plateAppearances ?? 0), avg, obp: num(hit.obp), slg, ops: num(hit.ops),
          hr: Number(hit.homeRuns ?? 0), rbi: Number(hit.rbi ?? 0), sb: Number(hit.stolenBases ?? 0),
          so: Number(hit.strikeOuts ?? 0), bb: Number(hit.baseOnBalls ?? 0),
          iso: avg != null && slg != null ? slg - avg : null,
        })
      }
    }
    return { pitchers, hitters }
  } catch (err) {
    console.error('[getRosterProfile]', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── pitch mix ────────────────────────────────────────────────────────────

export const PITCH_NAMES: Record<string, string> = {
  FF: '4-Seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper', CU: 'Curve', CH: 'Changeup', FS: 'Splitter', SV: 'Slurve', KN: 'Knuckle',
}
export type PitchGroup = 'Fastball' | 'Breaking' | 'Offspeed'
export const PITCH_GROUP: Record<string, PitchGroup> = {
  FF: 'Fastball', SI: 'Fastball', FC: 'Fastball', SL: 'Breaking', ST: 'Breaking', CU: 'Breaking', SV: 'Breaking', CH: 'Offspeed', FS: 'Offspeed', KN: 'Offspeed',
}
export const PITCH_ORDER = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'SV', 'CH', 'FS', 'KN']

// Weighted-average columns, in one place so team and league use identical math.
const QCOLS = ['avg_velocity', 'whiff_percent', 'est_woba', 'hard_hit_percent', 'put_away_percent', 'k_percent', 'ba_against', 'avg_h_break', 'avg_v_break'] as const
type QCol = (typeof QCOLS)[number]
type ArsenalRow = { player_id: number; pitch_type: string; count: number | null } & Record<QCol, number | null>

export type PitchQuality = {
  xwoba: number | null; hardHit: number | null; putAway: number | null; kPct: number | null; ba: number | null
  hBreak: number | null; vBreak: number | null
}

export type PitchAgg = {
  type: string; name: string; group: PitchGroup
  teamPct: number; leaguePct: number      // share of pitches, 0–100
  whiff: number | null; leagueWhiff: number | null   // pitch-weighted whiff%
  velo: number | null; leagueVelo: number | null
  pitches: number
  quality: PitchQuality; leagueQuality: PitchQuality  // Pro table
}

export type PitcherPitch = { type: string; name: string; pct: number; velo: number | null; whiff: number | null; xwoba: number | null; hardHit: number | null; putAway: number | null }

export type StaffArsenal = {
  types: PitchAgg[]
  groups: { group: PitchGroup; teamPct: number; leaguePct: number }[]
  byPitcher: Record<number, PitcherPitch[]>
  pitchesSampled: number
  pitchersCovered: number
}

type Agg = { n: number; sum: Record<QCol, number>; cnt: Record<QCol, number> }
const zero = () => Object.fromEntries(QCOLS.map(c => [c, 0])) as Record<QCol, number>
const blank = (): Agg => ({ n: 0, sum: zero(), cnt: zero() })
const avgOf = (a: Agg, c: QCol): number | null => (a.cnt[c] > 0 ? a.sum[c] / a.cnt[c] : null)
const qualityOf = (a: Agg): PitchQuality => ({
  xwoba: avgOf(a, 'est_woba'), hardHit: avgOf(a, 'hard_hit_percent'), putAway: avgOf(a, 'put_away_percent'), kPct: avgOf(a, 'k_percent'),
  ba: avgOf(a, 'ba_against'), hBreak: avgOf(a, 'avg_h_break'), vBreak: avgOf(a, 'avg_v_break'),
})

function addRow(m: Map<string, Agg>, r: ArsenalRow) {
  const c = Number(r.count ?? 0)
  if (c <= 0) return
  const a = m.get(r.pitch_type) ?? blank()
  a.n += c
  for (const col of QCOLS) {
    const v = num(r[col])
    if (v != null) { a.cnt[col] += c; a.sum[col] += v * c }
  }
  m.set(r.pitch_type, a)
}

const SELECT = ['player_id', 'pitch_type', 'count', ...QCOLS].join(', ')

let leagueCache: { at: number; season: number; map: Map<string, Agg> } | null = null
const LEAGUE_TTL_MS = 6 * 3600 * 1000

async function getLeagueArsenal(season: number): Promise<Map<string, Agg> | null> {
  if (leagueCache && leagueCache.season === season && Date.now() - leagueCache.at < LEAGUE_TTL_MS) return leagueCache.map
  const supa = createAdminClient()
  const map = new Map<string, Agg>()
  const PAGE = 1000
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await supa
      .from('pitch_arsenals')
      .select(SELECT)
      .eq('season', season)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('[getLeagueArsenal] Supabase error:', error.message)
      return null
    }
    for (const r of (data ?? []) as unknown as ArsenalRow[]) addRow(map, r)
    if (!data || data.length < PAGE) break
  }
  leagueCache = { at: Date.now(), season, map }
  return map
}

export async function getStaffArsenal(pitcherIds: number[], season: number): Promise<StaffArsenal | null> {
  if (pitcherIds.length === 0) return null
  const supa = createAdminClient()
  const [teamRes, league] = await Promise.all([
    supa.from('pitch_arsenals').select(SELECT).eq('season', season).in('player_id', pitcherIds),
    getLeagueArsenal(season),
  ])
  if (teamRes.error) {
    console.error('[getStaffArsenal] Supabase error:', teamRes.error.message)
    return null
  }
  if (!league) return null

  const rows = (teamRes.data ?? []) as unknown as ArsenalRow[]
  const team = new Map<string, Agg>()
  const per = new Map<number, ArsenalRow[]>()
  for (const r of rows) {
    addRow(team, r)
    if (!per.has(r.player_id)) per.set(r.player_id, [])
    per.get(r.player_id)!.push(r)
  }
  const teamTotal = [...team.values()].reduce((a, x) => a + x.n, 0)
  const leagueTotal = [...league.values()].reduce((a, x) => a + x.n, 0)
  if (teamTotal === 0 || leagueTotal === 0) return null

  const types: PitchAgg[] = PITCH_ORDER
    .filter(t => (team.get(t)?.n ?? 0) > 0 || (league.get(t)?.n ?? 0) > 0)
    .map(t => {
      const a = team.get(t) ?? blank(), l = league.get(t) ?? blank()
      return {
        type: t, name: PITCH_NAMES[t] ?? t, group: PITCH_GROUP[t] ?? 'Offspeed',
        teamPct: (a.n / teamTotal) * 100, leaguePct: (l.n / leagueTotal) * 100,
        whiff: avgOf(a, 'whiff_percent'), leagueWhiff: avgOf(l, 'whiff_percent'),
        velo: avgOf(a, 'avg_velocity'), leagueVelo: avgOf(l, 'avg_velocity'),
        pitches: a.n, quality: qualityOf(a), leagueQuality: qualityOf(l),
      }
    })

  const groups = (['Fastball', 'Breaking', 'Offspeed'] as PitchGroup[]).map(g => ({
    group: g,
    teamPct: types.filter(t => t.group === g).reduce((a, t) => a + t.teamPct, 0),
    leaguePct: types.filter(t => t.group === g).reduce((a, t) => a + t.leaguePct, 0),
  }))

  const byPitcher: Record<number, PitcherPitch[]> = {}
  for (const [id, rs] of per) {
    const tot = rs.reduce((a, r) => a + Number(r.count ?? 0), 0)
    if (tot <= 0) continue
    byPitcher[id] = rs
      .filter(r => Number(r.count ?? 0) > 0)
      .map(r => ({
        type: r.pitch_type, name: PITCH_NAMES[r.pitch_type] ?? r.pitch_type, pct: (Number(r.count) / tot) * 100,
        velo: num(r.avg_velocity), whiff: num(r.whiff_percent), xwoba: num(r.est_woba), hardHit: num(r.hard_hit_percent), putAway: num(r.put_away_percent),
      }))
      .sort((a, b) => b.pct - a.pct)
  }

  return { types, groups, byPitcher, pitchesSampled: teamTotal, pitchersCovered: per.size }
}
