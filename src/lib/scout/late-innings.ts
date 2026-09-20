// src/lib/scout/late-innings.ts
//
// Scout §11, "Late innings" tab — how a club and its bullpen operate from the 7th inning
// on, and what they have done against tonight's opponent this season.
//
//   Scoring   — runs scored and allowed in the 7th / 8th / 9th / extras, from the MLB
//               schedule's linescores: all season, and only in games against tonight's
//               opponent (with the W-L in those games)
//   Arms      — who actually pitches past the 7th: per reliever, which late innings he
//               works, how often he comes in protecting a 1–3 run lead, tied or behind,
//               and his line from the 7th on. All season, and only against tonight's
//               opponent. Source: late_inning_log (scripts/fetch_game_situations.py).
//   Sample    — division rivals meet ~13 times a year, same-league clubs ~6–7, opposite
//               league 3–4, so the head-to-head half is often small. The relationship and
//               the meeting count are returned so the UI can say so plainly.
//
// Until scripts/sql/add_late_inning_log.sql has been applied and the backfill has run,
// `arms` is null and the UI shows a "not loaded yet" state instead of invented numbers.

import { createAdminClient } from '@/lib/supabase'

const MLB = 'https://statsapi.mlb.com/api/v1'
export const MIN_LATE_APPS = 3          // a reliever needs this many late appearances (season) to be listed
export const SMALL_SAMPLE_GAMES = 5     // head-to-head under this many meetings is flagged as a small sample

export type Relation = 'division' | 'league' | 'interleague'
export const LATE_LABELS = ['7th', '8th', '9th', 'Extras'] as const

export type Scoring = { games: number; w: number; l: number; scored: number[]; allowed: number[] }

export type LateArm = {
  id: number; name: string
  apps: number
  inn: [number, number, number, number]     // appearances that included the 7th / 8th / 9th / extras
  lead: number; tied: number; behind: number // margin when he first faced a batter in the 7th+
  bf: number; outs: number; hits: number; bb: number; k: number; hr: number; runs: number
}

export type LateInnings = {
  relation: Relation
  season: Scoring
  vsOpp: Scoring
  /** null until the late-inning log has been created and backfilled */
  arms: LateArm[] | null
  armsVsOpp: LateArm[] | null
  loggedThrough: string | null
}

type LogRow = {
  game_pk: number; game_date: string; pitcher_id: number; pitcher_name: string | null
  pitching_team_id: number; batting_team_id: number
  entry_margin: number | null; inn7: number; inn8: number; inn9: number; inn10p: number
  bf: number; outs: number; hits: number; bb: number; k: number; hr: number; runs: number
}

const emptyScoring = (): Scoring => ({ games: 0, w: 0, l: 0, scored: [0, 0, 0, 0], allowed: [0, 0, 0, 0] })
const bucket = (inning: number) => Math.min(inning, 10) - 7

// ─── Scoring by inning (schedule linescores) ─────────────────────────────

type SchedGame = {
  status?: { abstractGameState?: string }
  teams?: { away?: { team?: { id?: number }; isWinner?: boolean }; home?: { team?: { id?: number }; isWinner?: boolean } }
  linescore?: { innings?: { num: number; home?: { runs?: number }; away?: { runs?: number } }[] }
}

async function getScoring(teamId: number, oppId: number, season: string): Promise<{ season: Scoring; vsOpp: Scoring } | null> {
  try {
    const res = await fetch(`${MLB}/schedule?sportId=1&teamId=${teamId}&season=${season}&gameType=R&hydrate=linescore`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) { console.error('[getScoring] schedule HTTP', res.status); return null }
    const dates = ((await res.json()).dates ?? []) as { games?: SchedGame[] }[]
    const out = { season: emptyScoring(), vsOpp: emptyScoring() }
    for (const g of dates.flatMap((d) => d.games ?? [])) {
      if (g.status?.abstractGameState !== 'Final') continue
      const away = g.teams?.away, home = g.teams?.home
      const mineIsAway = away?.team?.id === teamId
      const oppTeam = mineIsAway ? home?.team?.id : away?.team?.id
      const won = mineIsAway ? away?.isWinner : home?.isWinner
      const targets = oppTeam === oppId ? [out.season, out.vsOpp] : [out.season]
      for (const t of targets) { t.games += 1; if (won) t.w += 1; else t.l += 1 }
      for (const inn of g.linescore?.innings ?? []) {
        if (inn.num < 7) continue
        const mine = Number((mineIsAway ? inn.away : inn.home)?.runs ?? 0), theirs = Number((mineIsAway ? inn.home : inn.away)?.runs ?? 0)
        for (const t of targets) { t.scored[bucket(inn.num)] += mine; t.allowed[bucket(inn.num)] += theirs }
      }
    }
    return out
  } catch (err) {
    console.error('[getScoring] failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Relationship between the clubs ──────────────────────────────────────

async function getRelation(teamId: number, oppId: number, season: string): Promise<Relation> {
  try {
    const res = await fetch(`${MLB}/teams?sportId=1&season=${season}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return 'interleague'
    const teams = ((await res.json()).teams ?? []) as { id: number; division?: { id: number }; league?: { id: number } }[]
    const a = teams.find((t) => t.id === teamId), b = teams.find((t) => t.id === oppId)
    if (!a || !b) return 'interleague'
    return a.division?.id === b.division?.id ? 'division' : a.league?.id === b.league?.id ? 'league' : 'interleague'
  } catch { return 'interleague' }
}

// ─── Reliever log ────────────────────────────────────────────────────────

function fold(rows: LogRow[]): LateArm[] {
  const by = new Map<number, LateArm>()
  for (const r of rows) {
    const a = by.get(r.pitcher_id) ?? { id: r.pitcher_id, name: r.pitcher_name ?? 'Unknown', apps: 0, inn: [0, 0, 0, 0] as LateArm['inn'], lead: 0, tied: 0, behind: 0, bf: 0, outs: 0, hits: 0, bb: 0, k: 0, hr: 0, runs: 0 }
    a.apps += 1
    a.inn[0] += Number(r.inn7); a.inn[1] += Number(r.inn8); a.inn[2] += Number(r.inn9); a.inn[3] += Number(r.inn10p)
    const m = r.entry_margin == null ? null : Number(r.entry_margin)
    if (m != null) { if (m >= 1 && m <= 3) a.lead += 1; else if (m === 0) a.tied += 1; else if (m < 0) a.behind += 1 }
    a.bf += Number(r.bf); a.outs += Number(r.outs); a.hits += Number(r.hits); a.bb += Number(r.bb); a.k += Number(r.k); a.hr += Number(r.hr); a.runs += Number(r.runs)
    by.set(r.pitcher_id, a)
  }
  return [...by.values()].sort((x, y) => y.apps - x.apps || y.outs - x.outs)
}

async function getLog(teamId: number, season: string): Promise<LogRow[] | null> {
  const supa = createAdminClient()
  const rows: LogRow[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supa.from('late_inning_log')
      .select('game_pk, game_date, pitcher_id, pitcher_name, pitching_team_id, batting_team_id, entry_margin, inn7, inn8, inn9, inn10p, bf, outs, hits, bb, k, hr, runs')
      .eq('pitching_team_id', teamId).gte('game_date', `${season}-01-01`).order('game_pk').order('pitcher_id').range(offset, offset + 999)
    if (error) {
      if (error.code !== 'PGRST205') console.error('[getLateLog] Supabase error:', error.message)
      return null
    }
    rows.push(...((data ?? []) as unknown as LogRow[]))
    if (!data || data.length < 1000) break
  }
  return rows.length > 0 ? rows : null
}

// ─── Entry point ─────────────────────────────────────────────────────────

export async function getLateInnings(teamId: number, oppId: number, gameDate: string): Promise<LateInnings | null> {
  const season = gameDate.slice(0, 4)
  const [scoring, relation, log] = await Promise.all([getScoring(teamId, oppId, season), getRelation(teamId, oppId, season), getLog(teamId, season)])
  if (!scoring) return null
  const vsRows = log?.filter((r) => r.batting_team_id === oppId) ?? []
  return {
    relation, season: scoring.season, vsOpp: scoring.vsOpp,
    arms: log ? fold(log).filter((a) => a.apps >= MIN_LATE_APPS).slice(0, 10) : null,
    armsVsOpp: log ? fold(vsRows).slice(0, 8) : null,
    loggedThrough: log ? log.reduce((m, r) => (r.game_date > m ? r.game_date : m), '') : null,
  }
}
