// src/lib/scout/run-lab.ts
//
// Scout Report → Base running tab (lab layout). Adds to run-game.ts (catcher pop time / exchange / arm, pitcher steal record, club running, runner sprint speed) and
// situations.ts (the steal attempt log by base, count, outs and score) the Statcast running leaderboards, verified live 2026-10-27 (one CSV each, `csv=true`):
//   basestealing-run-value   per runner: runs stolen on the running act, chances (n_init), SB / CS / pickoffs / balks, primary and secondary lead in feet
//   pitcher-running-game     per pitcher: runs prevented, chances faced, SB / CS / pickoffs / balks, primary and secondary lead he allows in feet
//   baserunning-run-value    per runner: runs on extra bases taken (first to third, scoring from second...), by swipe / snipe / freeze
//   running_splits           per runner: seconds from contact to each 5 feet; the 90 ft time is the home-to-first split
// The four CSVs are parsed down to the fields below and cached together in savant_fetch_cache (12 h), as run-game.ts does. Leads are what Statcast measures for a runner
// on first base before the pitch (primary) and as the ball is delivered (secondary). Nothing here is a steal probability: every number is a count or a measurement.

import { withSavantCache } from '@/lib/savant-cache'
import { getRunGame, getSprintMap, type RunGame } from './run-game'
import { getSbSituations, type SbSituations, type Situations } from './situations'

const SAVANT = 'https://baseballsavant.mlb.com'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0'
export const MIN_LEAD_CHANCES = 100        // a runner / pitcher needs this many Statcast chances before his lead is read against the league

export type RunnerBoard = { chances: number; sb: number; cs: number; pk: number; bk: number; runs: number | null; primary: number | null; secondary: number | null }
export type PitcherBoard = { chances: number; sb: number; cs: number; pk: number; bk: number; runsPrevented: number | null; primary: number | null; secondary: number | null }
export type ExtraBases = { runs: number | null; taken: number; swipe: number | null; snipe: number | null; freeze: number | null }
export type RunBoards = {
  runner: Record<string, RunnerBoard>
  pitcher: Record<string, PitcherBoard>
  xb: Record<string, ExtraBases>
  split90: Record<string, number>
  league: { primary: number | null; secondary: number | null; pPrimary: number | null; pSecondary: number | null; split90: number | null }
}

function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = '', q = false
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = '' } else cur += ch }
  out.push(cur); return out
}
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const h = splitCsv(lines[0]).map(x => x.trim())
  return lines.slice(1).map(l => { const c = splitCsv(l); const o: Record<string, string> = {}; h.forEach((k, i) => { o[k] = (c[i] ?? '').trim() }); return o })
}
const num = (v: string | undefined) => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? null : x }
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

async function csv(path: string): Promise<Record<string, string>[]> {
  try {
    const res = await fetch(`${SAVANT}/${path}`, { cache: 'no-store', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) { console.error('[run-lab] Savant HTTP', res.status, path); return [] }
    return parseCsv(await res.text())
  } catch (err) { console.error('[run-lab] Savant fetch failed:', path, err instanceof Error ? err.message : err); return [] }
}

export async function getRunBoards(season: string): Promise<RunBoards | null> {
  return withSavantCache<RunBoards | null>(`scout-runlab:v1:${season}`, 12 * 3600, async () => {
    const [bsr, prg, brr, rs] = await Promise.all([
      csv(`leaderboard/basestealing-run-value?year=${season}&csv=true`), csv(`leaderboard/pitcher-running-game?year=${season}&csv=true`),
      csv(`leaderboard/baserunning-run-value?year=${season}&csv=true`), csv(`leaderboard/running_splits?year=${season}&csv=true`),
    ])
    if (bsr.length === 0 && prg.length === 0) return null
    const runner: RunBoards['runner'] = {}, pitcher: RunBoards['pitcher'] = {}, xb: RunBoards['xb'] = {}, split90: RunBoards['split90'] = {}
    for (const r of bsr.filter(r => r.key_target_base === 'All')) runner[r.player_id] = { chances: Number(r.n_init) || 0, sb: Number(r.n_sb) || 0, cs: Number(r.n_cs) || 0, pk: Number(r.n_pk) || 0, bk: Number(r.n_bk) || 0, runs: num(r.runs_stolen_on_running_act), primary: num(r.r_primary_lead), secondary: num(r.r_secondary_lead) }
    for (const r of prg.filter(r => r.key_target_base === 'All')) pitcher[r.player_id] = { chances: Number(r.n_init) || 0, sb: Number(r.n_sb) || 0, cs: Number(r.n_cs) || 0, pk: Number(r.n_pk) || 0, bk: Number(r.n_bk) || 0, runsPrevented: num(r.runs_prevented_on_running_attr), primary: num(r.r_primary_lead), secondary: num(r.r_secondary_lead) }
    for (const r of brr) xb[r.player_id] = { runs: num(r.runner_runs_XB), taken: Number(r.N_runner_moved_XB) || 0, swipe: num(r.runner_runs_XB_swipe), snipe: num(r.runner_runs_XB_snipe), freeze: num(r.runner_runs_XB_freeze) }
    for (const r of rs) { const t = num(r.seconds_since_hit_090); if (t != null && t > 0) split90[r.player_id] = t }
    const enough = <T extends { chances: number }>(o: Record<string, T>) => Object.values(o).filter(x => x.chances >= MIN_LEAD_CHANCES)
    const pick = <T,>(xs: T[], f: (x: T) => number | null) => xs.map(f).filter((v): v is number => v != null)
    return {
      runner, pitcher, xb, split90,
      league: {
        primary: mean(pick(enough(runner), x => x.primary)), secondary: mean(pick(enough(runner), x => x.secondary)),
        pPrimary: mean(pick(enough(pitcher), x => x.primary)), pSecondary: mean(pick(enough(pitcher), x => x.secondary)),
        split90: (() => { const v = Object.values(split90); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null })(),
      },
    }
  })
}

export type RunLabSide = {
  rg: RunGame | null
  sit: SbSituations | null
  /** steal attempts against the DEFENSE's club this season (its pitchers and catchers together) */
  against: Situations | null
  boards: RunBoards | null
  sprint: Record<string, number>
  /** every sprint speed in the league, sorted ascending, to place a runner */
  sprintField: number[]
}

/** One OFFENSE running against one DEFENSIVE battery. */
export async function getRunLab(offenseId: number, defenseId: number, gameDate: string, gamePk: number, defenseProbableId: number | null): Promise<RunLabSide> {
  const season = gameDate.slice(0, 4)
  const [rg, sit, defSit, boards, sprint] = await Promise.all([
    getRunGame(offenseId, defenseId, gameDate, gamePk, defenseProbableId).catch(() => null),
    getSbSituations(offenseId).catch(() => null),
    getSbSituations(defenseId).catch(() => null),
    getRunBoards(season).catch(() => null),
    getSprintMap(season).catch(() => ({} as Record<string, number>)),
  ])
  return { rg, sit, against: defSit?.against ?? null, boards, sprint, sprintField: Object.values(sprint).sort((a, b) => a - b) }
}
