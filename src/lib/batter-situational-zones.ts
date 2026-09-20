// src/lib/batter-situational-zones.ts
//
// Batter-side mirror of pitcher-situational-zones.ts: real zone data
// broken out by count situation (first pitch / even / 2-strike / 3-ball)
// AND opposing-pitcher handedness (all/vs_lhp/vs_rhp) — one live
// per-batter Savant CSV pull (same endpoint/parsing pattern already
// proven in batter-pitch-log.ts / batter-arsenal-stats.ts), aggregated
// on the fly. Feeds the Hot Zone Overlay's per-count view.
//
// Situation bucketing (a categorization choice, not a fetched fact,
// identical to the pitcher-side file):
//   2strike     — strikes === 2 (highest leverage, checked first)
//   3ball       — balls === 3 (and strikes < 2)
//   first_pitch — balls === 0 && strikes === 0
//   even        — everything else

import type { ZoneCell } from '@/lib/hot-zones'
import { withSavantCache } from '@/lib/savant-cache'

const SEASON_FALLBACK = new Date().getFullYear()
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])
const TOTAL_BASES: Record<string, number> = { single: 1, double: 2, triple: 3, home_run: 4 }
const ALL_ZONES = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '11', '12', '13', '14'])
const AB_EVENTS = new Set([
  'single', 'double', 'triple', 'home_run', 'strikeout', 'strikeout_double_play',
  'field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'triple_play',
  'fielders_choice', 'fielders_choice_out', 'other_out',
])

export type Situation = 'first_pitch' | 'even' | '2strike' | '3ball'
export const SITUATIONS: Situation[] = ['first_pitch', 'even', '2strike', '3ball']
export const SITUATION_LABELS: Record<Situation, string> = {
  first_pitch: 'First pitch', even: 'Even count', '2strike': '2-strike', '3ball': '3-ball',
}

export type Split = 'all' | 'vs_lhp' | 'vs_rhp'

export type BatterSituationalZones = {
  batterId: number
  season: number
  totalPitches: number
  bySituation: Record<Situation, Record<Split, Record<string, ZoneCell>>>
}

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

type Accum = { pitches: number; swings: number; whiffs: number; ab: number; hits: number; totalBases: number; wobaSum: number; wobaCount: number }
function freshAccum(): Accum {
  return { pitches: 0, swings: 0, whiffs: 0, ab: 0, hits: 0, totalBases: 0, wobaSum: 0, wobaCount: 0 }
}
function reduceAccum(a: Accum): ZoneCell {
  return {
    pitches: a.pitches,
    swings: a.swings,
    whiffs: a.whiffs,
    ab: a.ab,
    ba: a.ab > 0 ? Math.round((a.hits / a.ab) * 1000) / 1000 : null,
    slg: a.ab > 0 ? Math.round((a.totalBases / a.ab) * 1000) / 1000 : null,
    xwoba: a.wobaCount > 0 ? Math.round((a.wobaSum / a.wobaCount) * 1000) / 1000 : null,
    whiff_pct: a.swings > 0 ? Math.round((a.whiffs / a.swings) * 1000) / 10 : null,
  }
}

export async function getBatterSituationalZones(batterId: number, season = SEASON_FALLBACK): Promise<BatterSituationalZones | null> {
  return withSavantCache(
    `situational-zones:${batterId}:${season}`,
    21600,
    () => fetchBatterSituationalZones(batterId, season),
  )
}

async function fetchBatterSituationalZones(batterId: number, season: number): Promise<BatterSituationalZones | null> {
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${season}%7C&player_type=batter`,
    `&batters_lookup%5B%5D=${batterId}`,
    `&game_date_gt=${season}-01-01&game_date_lt=${season}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc&type=details',
  ].join('')

  let text: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
      next: { revalidate: 21600 },
    })
    if (!res.ok) return null
    text = await res.text()
  } catch {
    return null
  }

  const lines = text.trim().split('\n')
  if (lines.length < 2) return null

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿?"|"$/g, ''))
  const idx = (name: string) => headers.indexOf(name)
  const iBalls = idx('balls')
  const iStrikes = idx('strikes')
  const iZone = idx('zone')
  const iPThrows = idx('p_throws')
  const iDesc = idx('description')
  const iEvents = idx('events')
  const iType = idx('type')
  const iEstWoba = idx('estimated_woba_using_speedangle')

  if (iBalls === -1 || iStrikes === -1 || iZone === -1) return null

  const bySituation: Record<Situation, Record<Split, Map<string, Accum>>> = {
    first_pitch: { all: new Map(), vs_lhp: new Map(), vs_rhp: new Map() },
    even:        { all: new Map(), vs_lhp: new Map(), vs_rhp: new Map() },
    '2strike':   { all: new Map(), vs_lhp: new Map(), vs_rhp: new Map() },
    '3ball':     { all: new Map(), vs_lhp: new Map(), vs_rhp: new Map() },
  }

  let totalPitches = 0

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, ''))
    const balls = Number(cells[iBalls])
    const strikes = Number(cells[iStrikes])
    const zone = String(Math.trunc(Number(cells[iZone])))
    if (Number.isNaN(balls) || Number.isNaN(strikes) || !ALL_ZONES.has(zone)) continue

    totalPitches++

    const situation: Situation = strikes === 2 ? '2strike' : balls === 3 ? '3ball' : (balls === 0 && strikes === 0) ? 'first_pitch' : 'even'
    const pThrows = iPThrows !== -1 ? cells[iPThrows] : ''
    const splits: Split[] = pThrows === 'L' ? ['all', 'vs_lhp'] : pThrows === 'R' ? ['all', 'vs_rhp'] : ['all']

    const desc = iDesc !== -1 ? cells[iDesc].toLowerCase() : ''
    const isSwing = ['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'].includes(desc)
    const isWhiff = ['swinging_strike', 'swinging_strike_blocked', 'swinging_pitchout'].includes(desc)
    const eventName = iEvents !== -1 ? cells[iEvents] : ''
    const typeCode = iType !== -1 ? cells[iType] : ''
    const isBattedBall = typeCode === 'X'
    const wobaVal = iEstWoba !== -1 ? Number(cells[iEstWoba]) : NaN

    for (const split of splits) {
      const m = bySituation[situation][split]
      if (!m.has(zone)) m.set(zone, freshAccum())
      const accum = m.get(zone)!
      accum.pitches++
      if (isSwing) accum.swings++
      if (isWhiff) accum.whiffs++
      if (eventName && AB_EVENTS.has(eventName)) {
        accum.ab++
        if (HIT_EVENTS.has(eventName)) { accum.hits++; accum.totalBases += TOTAL_BASES[eventName] ?? 0 }
      }
      // estimated_woba_using_speedangle is only real on a batted ball —
      // Savant's CSV fills it with literal '0' (not blank) on every other
      // pitch, which would dilute the average toward zero if counted
      // unconditionally (same real bug already fixed on the pitcher side).
      if (isBattedBall && !Number.isNaN(wobaVal)) { accum.wobaSum += wobaVal; accum.wobaCount++ }
    }
  }

  if (totalPitches === 0) return null

  const outBySituation: BatterSituationalZones['bySituation'] = {
    first_pitch: { all: {}, vs_lhp: {}, vs_rhp: {} },
    even: { all: {}, vs_lhp: {}, vs_rhp: {} },
    '2strike': { all: {}, vs_lhp: {}, vs_rhp: {} },
    '3ball': { all: {}, vs_lhp: {}, vs_rhp: {} },
  }
  for (const situation of SITUATIONS) {
    for (const split of ['all', 'vs_lhp', 'vs_rhp'] as Split[]) {
      const out: Record<string, ZoneCell> = {}
      for (const [zone, accum] of bySituation[situation][split]) out[zone] = reduceAccum(accum)
      outBySituation[situation][split] = out
    }
  }

  return { batterId, season, totalPitches, bySituation: outBySituation }
}
