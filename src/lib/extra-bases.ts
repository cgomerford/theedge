// src/lib/extra-bases.ts
//
// "Extra bases taken vs. given" — real, team-level Statcast pulls, no
// pipeline needed (matches the live-fetch + long revalidate pattern
// already used by abs-challenges.ts / batter-fielding.ts).
//
// TAKEN — Savant's baserunning-run-value leaderboard. runner_runs_XB is
// the actual metric name for "runs gained by taking extra bases on hits/
// wild pitches/etc." (curl-verified real column, per-player, team_name
// already comes back as a plain abbreviation — matches our own MLB_TEAMS
// abbrs except Arizona: Savant uses "AZ", we use "ARI").
//
// GIVEN — outfield outs_above_average from the existing outs_above_average
// leaderboard (type=Fielder; same endpoint src/lib/batter-fielding.ts
// already uses for a single player), summed across the three OF positions
// per team. display_team_name comes back as a short display name
// ("Red Sox", "D-backs") rather than an abbr, so teams are matched by
// checking which MLB_TEAMS full name ends with that string (with one
// manual override for "D-backs" -> Diamondbacks, which doesn't suffix-match).
// Negative summed OAA means the outfield is costing outs/runs — "given".

import { MLB_TEAMS } from '@/lib/mlb-assets'

const SEASON = 2026

export type ExtraBasesRow = {
  teamAbbr: string
  teamName: string
  baserunningRuns: number  // + = takes extra bases; runner_runs_tot (XB + steal value combined)
  outfieldRunsSaved: number // + = outfield saves runs (OAA); - = outfield gives runs away
}

const BASERUNNING_ABBR_ALIAS: Record<string, string> = { AZ: 'ARI' }
const DISPLAY_NAME_ALIAS: Record<string, string> = { 'D-backs': 'Diamondbacks' }

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = '' }
    else current += ch
  }
  cells.push(current.trim())
  return cells
}

async function fetchCSV(url: string): Promise<{ headers: string[]; rows: string[][] } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
      next: { revalidate: 21600 }, // 6h — same cadence as other season-aggregate Savant pulls
    })
    if (!res.ok) return null
    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return null
    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿?"|"$/g, ''))
    const rows = lines.slice(1).map(line => parseCSVLine(line).map(c => c.replace(/^"|"$/g, '')))
    return { headers, rows }
  } catch (err) {
    console.error('extra-bases fetchCSV failed:', err)
    return null
  }
}

function teamAbbrFromFullName(fullName: string): string | null {
  const team = Object.values(MLB_TEAMS).find(t => t.name === fullName)
  return team?.abbr ?? null
}

async function getBaserunningRunsByTeam(): Promise<Map<string, number>> {
  const url = `https://baseballsavant.mlb.com/leaderboard/baserunning-run-value?year=${SEASON}&team=&min=0&csv=true`
  const csv = await fetchCSV(url)
  const totals = new Map<string, number>()
  if (!csv) return totals

  const teamIdx = csv.headers.indexOf('team_name')
  const runsIdx = csv.headers.indexOf('runner_runs_tot')
  if (teamIdx === -1 || runsIdx === -1) return totals

  for (const cells of csv.rows) {
    const rawAbbr = cells[teamIdx]
    if (!rawAbbr) continue
    const abbr = BASERUNNING_ABBR_ALIAS[rawAbbr] ?? rawAbbr
    const runs = Number(cells[runsIdx])
    if (Number.isNaN(runs)) continue
    totals.set(abbr, (totals.get(abbr) ?? 0) + runs)
  }
  return totals
}

async function getOutfieldOAAByTeam(): Promise<Map<string, number>> {
  const url = `https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Fielder&startYear=${SEASON}&endYear=${SEASON}&split=no&team=&range=year&min=1&pos=&roles=&viz=hide&csv=true`
  const csv = await fetchCSV(url)
  const totals = new Map<string, number>()
  if (!csv) return totals

  const teamIdx = csv.headers.indexOf('display_team_name')
  const posIdx = csv.headers.indexOf('primary_pos_formatted')
  const oaaIdx = csv.headers.indexOf('outs_above_average')
  if (teamIdx === -1 || oaaIdx === -1) return totals

  const OF_POSITIONS = new Set(['LF', 'CF', 'RF'])

  for (const cells of csv.rows) {
    if (posIdx !== -1 && !OF_POSITIONS.has(cells[posIdx])) continue
    const displayName = DISPLAY_NAME_ALIAS[cells[teamIdx]] ?? cells[teamIdx]
    const abbr = teamAbbrFromFullName(
      Object.values(MLB_TEAMS).find(t => t.name.endsWith(displayName))?.name ?? ''
    )
    if (!abbr) continue
    const oaa = Number(cells[oaaIdx])
    if (Number.isNaN(oaa)) continue
    totals.set(abbr, (totals.get(abbr) ?? 0) + oaa)
  }
  return totals
}

export async function getExtraBasesStrip(): Promise<ExtraBasesRow[]> {
  const [baserunning, outfield] = await Promise.all([
    getBaserunningRunsByTeam(),
    getOutfieldOAAByTeam(),
  ])

  const abbrs = new Set<string>([...baserunning.keys(), ...outfield.keys()])

  const rows = [...abbrs].map((abbr): ExtraBasesRow => ({
    teamAbbr: abbr,
    teamName: Object.values(MLB_TEAMS).find(t => t.abbr === abbr)?.name ?? abbr,
    baserunningRuns: Math.round((baserunning.get(abbr) ?? 0) * 10) / 10,
    outfieldRunsSaved: Math.round((outfield.get(abbr) ?? 0) * 10) / 10,
  }))

  return rows.sort((a, b) => b.baserunningRuns - a.baserunningRuns)
}
