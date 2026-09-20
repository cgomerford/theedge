// src/lib/batter-pitch-log.ts
//
// General-purpose raw per-pitch log for one batter's whole season — the
// batter-side mirror of pitcher-pitch-log.ts, same live Savant CSV
// endpoint, same real columns, just batters_lookup[] instead of
// pitchers_lookup[]. One raw fetch, reused by the Location Lab swing
// heatmap, the EV/launch-angle trend, and the Reaction Window's real
// swing-time estimate — no separate fetch per feature.
//
// Confirmed live (curl-verified before building on it): bat_speed and
// swing_length are only populated on pitches the batter actually swung
// at (~45% of pitches in a spot-check) — real tracking coverage, not a
// bug. launch_speed/launch_angle are only populated on balls actually
// put in play (type === 'X').
//
// 2026-09-14: extended with inning/onBase (real on_1b/on_2b/on_3b
// presence, same technique as pitcher-pitch-log.ts) and pitcher name
// resolution (one bulk /people?personIds= lookup for every unique
// pitcher faced, mirroring resolveBatters on the pitcher side) so the
// Location Lab's per-pitch hover can show real situational context.

import { withSavantCache } from '@/lib/savant-cache'

const SEASON_FALLBACK = new Date().getFullYear()
const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type RawBatterPitch = {
  date: string
  pitchType: string
  releaseSpeed: number | null // pitch velocity out of the pitcher's hand — NOT launchSpeed (that's exit velo off the bat)
  plateX: number
  plateZ: number
  zone: string | null // Statcast's own pre-bucketed 1-9/11-14 zone code, as a string key matching ZONE_LABELS elsewhere
  description: string | null // real Statcast description — ball/called_strike/swinging_strike/foul/hit_into_play/...
  result: string | null // real events value if this pitch ended the PA, else the description
  pitcherId: number | null
  pitcherThrows: 'L' | 'R' | null
  launchSpeed: number | null // real exit velo, only on balls in play
  launchAngle: number | null // real launch angle, only on balls in play
  batSpeed: number | null // real, only on swings
  swingLength: number | null // real feet, only on swings — Savant's own definition: sweet-spot travel distance, downswing start to contact
  isHit: boolean
  balls: number | null
  strikes: number | null
  inning: number | null
  onBase: { first: boolean; second: boolean; third: boolean }
  gamePk: number | null
  atBatNumber: number | null
  pitchNumber: number | null // order within the at-bat — needed to reconstruct true pitch sequence, same as pitcher-pitch-log.ts
}

export type BatterPitchLog = {
  batterId: number
  season: number
  pitches: RawBatterPitch[]
  pitchNames: Record<string, string>
  pitcherNames: Record<number, string> // real MLB names for every pitcher faced, resolved once in bulk
}

const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])

async function resolvePitcherNames(ids: number[]): Promise<Record<number, string>> {
  if (ids.length === 0) return {}
  try {
    const chunks: number[][] = []
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
    const names: Record<number, string> = {}
    for (const chunk of chunks) {
      const res = await fetch(`${MLB_API}/people?personIds=${chunk.join(',')}`, { next: { revalidate: 86400 } })
      if (!res.ok) continue
      const json = await res.json()
      for (const p of json.people ?? []) names[p.id] = p.fullName ?? `#${p.id}`
    }
    return names
  } catch {
    return {}
  }
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

// `Number('')` is 0, not NaN — a blank real CSV cell (the normal case for
// sparse fields like launch_speed/bat_speed, which Savant only populates
// on balls in play/swings) was silently becoming a phantom 0 instead of
// staying null, dragging averages like "exit velo by game" down toward
// single digits. Every optional numeric field must go through this.
function numOrNaN(s: string): number {
  return s === '' ? NaN : Number(s)
}

export async function getBatterPitchLog(batterId: number, season = SEASON_FALLBACK): Promise<BatterPitchLog | null> {
  return withSavantCache(
    `pitch-log:${batterId}:${season}`,
    21600,
    () => fetchBatterPitchLog(batterId, season),
  )
}

async function fetchBatterPitchLog(batterId: number, season: number): Promise<BatterPitchLog | null> {
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
  const idx = (n: string) => headers.indexOf(n)
  const iDate = idx('game_date'), iPitchType = idx('pitch_type'), iPitchName = idx('pitch_name')
  const iReleaseSpeed = idx('release_speed')
  const iPlateX = idx('plate_x'), iPlateZ = idx('plate_z')
  const iDesc = idx('description'), iEvents = idx('events')
  const iPitcher = idx('pitcher'), iPThrows = idx('p_throws')
  const iLS = idx('launch_speed'), iLA = idx('launch_angle')
  const iBatSpeed = idx('bat_speed'), iSwingLen = idx('swing_length')
  const iZone = idx('zone')
  const iBalls = idx('balls'), iStrikes = idx('strikes'), iInning = idx('inning')
  const iOn1b = idx('on_1b'), iOn2b = idx('on_2b'), iOn3b = idx('on_3b')
  const iGamePk = idx('game_pk'), iAtBat = idx('at_bat_number'), iPitchNum = idx('pitch_number')
  if (iDate === -1 || iPitchType === -1 || iPlateX === -1 || iPlateZ === -1) return null

  const pitches: RawBatterPitch[] = []
  const pitchNames: Record<string, string> = {}
  const pitcherIds = new Set<number>()

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, ''))
    const date = cells[iDate]
    const pitchType = cells[iPitchType]
    const plateX = Number(cells[iPlateX])
    const plateZ = Number(cells[iPlateZ])
    if (!date || !pitchType || Number.isNaN(plateX) || Number.isNaN(plateZ)) continue
    if (iPitchName !== -1 && cells[iPitchName] && !pitchNames[pitchType]) pitchNames[pitchType] = cells[iPitchName]

    const releaseSpeed = iReleaseSpeed !== -1 ? numOrNaN(cells[iReleaseSpeed]) : NaN
    const zoneRaw = iZone !== -1 ? Number(cells[iZone]) : NaN
    const eventsVal = iEvents !== -1 ? cells[iEvents] : ''
    const descVal = iDesc !== -1 ? cells[iDesc] : ''
    const pitcherId = iPitcher !== -1 ? Number(cells[iPitcher]) : NaN
    const pThrows = iPThrows !== -1 ? cells[iPThrows] : ''
    const launchSpeed = iLS !== -1 ? numOrNaN(cells[iLS]) : NaN
    const launchAngle = iLA !== -1 ? numOrNaN(cells[iLA]) : NaN
    const batSpeed = iBatSpeed !== -1 ? numOrNaN(cells[iBatSpeed]) : NaN
    const swingLength = iSwingLen !== -1 ? numOrNaN(cells[iSwingLen]) : NaN
    const balls = iBalls !== -1 ? numOrNaN(cells[iBalls]) : NaN
    const strikes = iStrikes !== -1 ? numOrNaN(cells[iStrikes]) : NaN
    const inning = iInning !== -1 ? numOrNaN(cells[iInning]) : NaN
    const gamePk = iGamePk !== -1 ? numOrNaN(cells[iGamePk]) : NaN
    const atBatNumber = iAtBat !== -1 ? numOrNaN(cells[iAtBat]) : NaN
    const pitchNumber = iPitchNum !== -1 ? numOrNaN(cells[iPitchNum]) : NaN
    if (!Number.isNaN(pitcherId)) pitcherIds.add(pitcherId)

    pitches.push({
      date, pitchType, releaseSpeed: Number.isNaN(releaseSpeed) ? null : releaseSpeed, plateX, plateZ,
      zone: Number.isNaN(zoneRaw) ? null : String(Math.trunc(zoneRaw)),
      description: descVal || null,
      result: eventsVal || descVal || null,
      pitcherId: Number.isNaN(pitcherId) ? null : pitcherId,
      pitcherThrows: pThrows === 'L' || pThrows === 'R' ? pThrows : null,
      launchSpeed: Number.isNaN(launchSpeed) ? null : launchSpeed,
      launchAngle: Number.isNaN(launchAngle) ? null : launchAngle,
      batSpeed: Number.isNaN(batSpeed) ? null : batSpeed,
      swingLength: Number.isNaN(swingLength) ? null : swingLength,
      isHit: HIT_EVENTS.has(eventsVal),
      balls: Number.isNaN(balls) ? null : balls,
      strikes: Number.isNaN(strikes) ? null : strikes,
      inning: Number.isNaN(inning) ? null : inning,
      onBase: {
        first: iOn1b !== -1 && cells[iOn1b] !== '',
        second: iOn2b !== -1 && cells[iOn2b] !== '',
        third: iOn3b !== -1 && cells[iOn3b] !== '',
      },
      gamePk: Number.isNaN(gamePk) ? null : gamePk,
      atBatNumber: Number.isNaN(atBatNumber) ? null : atBatNumber,
      pitchNumber: Number.isNaN(pitchNumber) ? null : pitchNumber,
    })
  }

  if (pitches.length === 0) return null
  const pitcherNames = await resolvePitcherNames([...pitcherIds])
  return { batterId, season, pitches, pitchNames, pitcherNames }
}

// Real Statcast description vocabulary for "did he swing" — same
// classification used elsewhere in this app (SequenceExplorer.tsx,
// EdgePlusGameCard.tsx), batter side.
export type SwingCall = 'ball' | 'called_strike' | 'whiff' | 'foul' | 'in_play'
export function classifySwingCall(description: string | null): SwingCall | null {
  switch (description) {
    case 'ball': case 'blocked_ball': case 'pitchout': return 'ball'
    case 'called_strike': return 'called_strike'
    case 'swinging_strike': case 'swinging_strike_blocked': case 'missed_bunt': return 'whiff'
    case 'foul': case 'foul_tip': case 'foul_bunt': return 'foul'
    case 'hit_into_play': return 'in_play'
    default: return null
  }
}
export function isSwingCall(call: SwingCall | null): boolean {
  return call === 'whiff' || call === 'foul' || call === 'in_play'
}
