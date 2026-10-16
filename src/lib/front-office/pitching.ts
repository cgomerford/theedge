// src/lib/front-office/pitching.ts
//
// Reads for the Pitching Desk. Every table here is written by a cron script in scripts/fo/
// (ownership is listed in scripts/sql/create_fo_pitching_desk.sql); nothing in this file calls
// Savant or the MLB API, and nothing is estimated: a missing number is null, a failed read is
// null / [] with a prefixed console.error. Numeric columns arrive as strings, so every one goes
// through n().

import { createAdminClient } from '@/lib/supabase'

export const WINDOWS = ['season', 'l30', 'l15', 'l5'] as const
export type Win = (typeof WINDOWS)[number]
export const WIN_LABEL: Record<Win, string> = { season: 'Season', l30: 'Last 30d', l15: 'Last 15d', l5: 'Last 5 apps' }
export const SIDES = ['all', 'R', 'L'] as const
export type Side = (typeof SIDES)[number]
export const SIDE_LABEL: Record<Side, string> = { all: 'All', R: 'vs RHB', L: 'vs LHB' }

const n = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const s = (v: unknown): string | null => (v == null || v === '' ? null : String(v))

export type StaffRow = {
  teamId: number; playerId: number; season: number; win: Win; name: string; role: 'SP' | 'RP' | null; throws: 'R' | 'L' | null
  age: number | null; ip: number | null; bf: number | null; k: number | null; bb: number | null; hr: number | null
  gb: number | null; fb: number | null; bip: number | null
  era: number | null; fip: number | null; xfip: number | null; siera: number | null; xera: number | null
  kPct: number | null; bbPct: number | null; kbbPct: number | null; cswPct: number | null; whiffPct: number | null
  babip: number | null; lobPct: number | null; hrFb: number | null; fbVeloDelta: number | null
  stuffGrade: number | null; asOf: string
}

export type LeagueContext = {
  season: number; role: 'all' | 'SP' | 'RP'; kPct: number | null; bbPct: number | null; kbbPct: number | null; cswPct: number | null
  babip: number | null; lobPct: number | null; hrFb: number | null; gbPct: number | null; era: number | null; fipConstant: number | null
  sd: Record<string, number | null>
}

export type ArsenalRow = {
  playerId: number; win: Win; side: Side; pitchType: string; pitches: number; usagePct: number | null
  velo: number | null; ivb: number | null; hb: number | null; spin: number | null; activeSpinPct: number | null
  vaa: number | null; extension: number | null; armAngle: number | null; whiffPct: number | null; xwoba: number | null
  rvPer100: number | null; relX: number | null; relZ: number | null; stuffGrade: number | null
}

export type LeagueAvg = Record<string, number | null> & { pitchType: string; nPitchers: number | null }
export type PitchPoint = { hb: number; ivb: number; rel_x: number; rel_z: number }
export type PointSet = { pitchType: string; points: PitchPoint[] }

export type GameLogRow = {
  playerId: number; gamePk: number; date: string; daysRest: number | null; pitches: number | null; bf: number | null
  k: number | null; bb: number | null; csw: number | null; veloByType: Record<string, number>; armAngle: number | null; relZ: number | null
}
export type IlStint = { playerId: number; start: string; end: string | null; ilType: string | null; description: string | null }

export function parseWin(v: string | undefined): Win { return (WINDOWS as readonly string[]).includes(v ?? '') ? (v as Win) : 'season' }
export function parseSide(v: string | undefined): Side { return (SIDES as readonly string[]).includes(v ?? '') ? (v as Side) : 'all' }

/** Latest season that has staff rows for this club, or null if the cron has never run. */
export async function getStaffSeason(teamId: number): Promise<number | null> {
  const { data, error } = await createAdminClient()
    .from('fo_pitch_staff').select('season').eq('team_id', teamId).order('season', { ascending: false }).limit(1)
  if (error) { console.error('[getStaffSeason] Supabase error:', error.message); return null }
  const r = ((data ?? []) as { season: unknown }[])[0]
  return r ? n(r.season) : null
}

export async function getStaff(teamId: number, season: number, win: Win): Promise<StaffRow[]> {
  const { data, error } = await createAdminClient()
    .from('fo_pitch_staff').select('*').eq('team_id', teamId).eq('season', season).eq('win', win).limit(200)
  if (error) { console.error('[getStaff] Supabase error:', error.message); return [] }
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    teamId: Number(r.team_id), playerId: Number(r.player_id), season: Number(r.season), win: r.win as Win, name: String(r.player_name ?? r.player_id),
    role: (s(r.role) as 'SP' | 'RP' | null), throws: (s(r.throws) as 'R' | 'L' | null), age: n(r.age), ip: n(r.ip), bf: n(r.bf), k: n(r.k), bb: n(r.bb), hr: n(r.hr),
    gb: n(r.gb), fb: n(r.fb), bip: n(r.bip), era: n(r.era), fip: n(r.fip), xfip: n(r.xfip), siera: n(r.siera), xera: n(r.xera),
    kPct: n(r.k_pct), bbPct: n(r.bb_pct), kbbPct: n(r.kbb_pct), cswPct: n(r.csw_pct), whiffPct: n(r.whiff_pct),
    babip: n(r.babip), lobPct: n(r.lob_pct), hrFb: n(r.hr_fb), fbVeloDelta: n(r.fb_velo_delta),
    stuffGrade: n(r.stuff_grade), asOf: String(r.as_of),
  }))
}

export async function getLeagueContext(season: number): Promise<LeagueContext[]> {
  const { data, error } = await createAdminClient().from('fo_league_pitch_context').select('*').eq('season', season)
  if (error) { console.error('[getLeagueContext] Supabase error:', error.message); return [] }
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    season: Number(r.season), role: r.role as LeagueContext['role'], kPct: n(r.k_pct), bbPct: n(r.bb_pct), kbbPct: n(r.kbb_pct), cswPct: n(r.csw_pct),
    babip: n(r.babip), lobPct: n(r.lob_pct), hrFb: n(r.hr_fb), gbPct: n(r.gb_pct), era: n(r.era), fipConstant: n(r.fip_constant),
    sd: Object.fromEntries(Object.entries((r.sd ?? {}) as Record<string, unknown>).map(([k, v]) => [k, n(v)])),
  }))
}

export async function getArsenal(playerId: number, season: number, win: Win, side: Side): Promise<ArsenalRow[]> {
  const { data, error } = await createAdminClient()
    .from('fo_pitch_arsenal').select('*').eq('player_id', playerId).eq('season', season).eq('win', win).eq('side', side)
    .order('pitches', { ascending: false }).limit(30)
  if (error) { console.error('[getArsenal] Supabase error:', error.message); return [] }
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    playerId: Number(r.player_id), win: r.win as Win, side: r.side as Side, pitchType: String(r.pitch_type), pitches: Number(r.pitches) || 0,
    usagePct: n(r.usage_pct), velo: n(r.velo), ivb: n(r.ivb), hb: n(r.hb), spin: n(r.spin), activeSpinPct: n(r.active_spin_pct),
    vaa: n(r.vaa), extension: n(r.extension), armAngle: n(r.arm_angle), whiffPct: n(r.whiff_pct), xwoba: n(r.xwoba),
    rvPer100: n(r.rv_per_100), relX: n(r.rel_x), relZ: n(r.rel_z), stuffGrade: n(r.stuff_grade),
  }))
}

export async function getLeagueAvg(season: number): Promise<LeagueAvg[]> {
  const { data, error } = await createAdminClient().from('fo_pitch_league_avg').select('*').eq('season', season).limit(50)
  if (error) { console.error('[getLeagueAvg] Supabase error:', error.message); return [] }
  return ((data ?? []) as Record<string, unknown>[]).map(r => {
    const out: Record<string, number | null | string> = { pitchType: String(r.pitch_type), nPitchers: n(r.n_pitchers) }
    for (const [k, v] of Object.entries(r)) if (k !== 'pitch_type' && k !== 'season' && k !== 'as_of' && k !== 'n_pitchers') out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = n(v)
    return out as LeagueAvg
  })
}

export async function getPoints(playerId: number, season: number, win: Win): Promise<PointSet[]> {
  const { data, error } = await createAdminClient()
    .from('fo_pitch_points').select('pitch_type, points').eq('player_id', playerId).eq('season', season).eq('win', win).limit(30)
  if (error) { console.error('[getPoints] Supabase error:', error.message); return [] }
  return ((data ?? []) as { pitch_type: string; points: unknown }[]).map(r => ({
    pitchType: String(r.pitch_type),
    points: ((r.points ?? []) as Record<string, unknown>[]).map(p => ({ hb: Number(p.hb), ivb: Number(p.ivb), rel_x: Number(p.rel_x), rel_z: Number(p.rel_z) })),
  }))
}

export async function getGameLog(playerId: number, season: number): Promise<GameLogRow[]> {
  const { data, error } = await createAdminClient()
    .from('fo_pitch_game_log').select('*').eq('player_id', playerId).eq('season', season).order('game_date', { ascending: true }).limit(200)
  if (error) { console.error('[getGameLog] Supabase error:', error.message); return [] }
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    playerId: Number(r.player_id), gamePk: Number(r.game_pk), date: String(r.game_date), daysRest: n(r.days_rest), pitches: n(r.pitches), bf: n(r.bf),
    k: n(r.k), bb: n(r.bb), csw: n(r.csw), armAngle: n(r.arm_angle), relZ: n(r.rel_z),
    veloByType: Object.fromEntries(Object.entries((r.velo_by_type ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v as number))),
  }))
}

export async function getIlStints(playerId: number, season: number): Promise<IlStint[]> {
  const { data, error } = await createAdminClient()
    .from('fo_pitch_il_stints').select('player_id, start_date, end_date, il_type, description')
    .eq('player_id', playerId).gte('start_date', `${season}-01-01`).order('start_date', { ascending: true }).limit(50)
  if (error) { console.error('[getIlStints] Supabase error:', error.message); return [] }
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    playerId: Number(r.player_id), start: String(r.start_date), end: s(r.end_date), ilType: s(r.il_type), description: s(r.description),
  }))
}
