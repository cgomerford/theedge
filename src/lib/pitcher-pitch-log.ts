// src/lib/pitcher-pitch-log.ts
//
// Raw per-pitch plate location (plate_x, plate_z — real Statcast columns,
// the actual crossing-the-plate coordinates, not the bucketed 1-9/11-14
// zone code) for one pitcher's whole season, live from the same Savant
// CSV endpoint already proven in pitcher-statcast-profile.ts /
// pitcher-situational-zones.ts / pitcher-start-trends.ts. Returned as a
// flat per-pitch list (date + pitch type + coordinates) rather than
// pre-aggregated, so the client can bucket by game/week/month/season
// interactively without another round trip — a season's worth of pitches
// (a few thousand rows, a dozen small fields each) is small enough as JSON.
//
// This is the raw material for a continuous density heatmap (binned +
// smoothed client-side in PitchDensityHeatmap.tsx) — genuinely different
// from the discrete 13-zone grid everywhere else in the Pitching Lab,
// which reads off Statcast's own pre-bucketed `zone` column instead.
//
// 2026-09-14: extended with velo/result/count/inning/batter so the
// per-pitch scatter view can show a real hover readout, not just a dot.
// Batter is a numeric Statcast id in the raw CSV — resolved to a name via
// ONE bulk MLB people lookup for every unique batter faced that season
// (same real /people endpoint the rest of this app already uses),
// instead of one request per pitch.
//
// 2026-09-14 (later): added isHit (real events value against the same
// HIT_EVENTS set used elsewhere in this codebase — pitcher-statcast-
// profile.ts) and onBase — real on_1b/on_2b/on_3b columns, each holding
// the runner's Statcast id when occupied. Presence only (not who), per
// what was asked — no extra lookup needed for that.
//
// 2026-09-14 (later still): extended to a general-purpose raw pitch log —
// zone/game_pk/at_bat_number/pitch_number (for the Sequencing tab's real
// prev→next pitch explorer, which needs pitches in their true thrown
// order within each at-bat) and release_pos_x/z, arm_angle,
// release_spin_rate, release_extension (for Arsenal's arm-angle/release
// chart and the Stuff & Movement tab) — all confirmed real columns on
// this same CSV (verified against a live pull before building on them;
// an earlier turn wrongly assumed release point/spin weren't available
// anywhere in this app's pipeline — they are, just hadn't been checked
// against the raw CSV rather than the narrower TS parsers already
// written). One raw per-pitch fetch, four consumers.

const SEASON_FALLBACK = new Date().getFullYear()
const MLB_API = 'https://statsapi.mlb.com/api/v1'
const HIT_EVENTS = new Set(['single', 'double', 'triple', 'home_run'])

export type RawPitch = {
  date: string
  pitchType: string
  plateX: number
  plateZ: number
  zone: string | null // Statcast's own pre-bucketed 1-9/11-14 zone code, as a string key matching ZONE_LABELS elsewhere
  velo: number | null
  result: string | null // real events value (e.g. "single", "strikeout") when the pitch ended the PA, else the pitch description (e.g. "called_strike", "ball", "foul")
  description: string | null // real Statcast `description` column, ALWAYS the pitch-level call (ball/called_strike/swinging_strike/foul/hit_into_play/...) even on a PA-ending pitch, where `result` above is overwritten by the event instead
  isHit: boolean // events is single/double/triple/home_run
  balls: number | null
  strikes: number | null
  inning: number | null
  batterId: number | null
  onBase: { first: boolean; second: boolean; third: boolean }
  gamePk: number | null
  atBatNumber: number | null
  pitchNumber: number | null // order within the at-bat — 1 = first pitch of the PA
  releasePosX: number | null
  releasePosZ: number | null
  armAngle: number | null
  spinRate: number | null
  extension: number | null
  effectiveSpeed: number | null // real Savant field — release speed adjusted for extension (and a small batter-perceived-distance factor), i.e. "how fast it actually plays" to the hitter, not just the radar-gun number
}

export type PitcherPitchLog = {
  pitcherId: number
  season: number
  pitches: RawPitch[]
  pitchNames: Record<string, string>
  batterNames: Record<number, string>
  // Real MLB people-endpoint `active` flag per batter faced — lets a
  // consumer split "all-time vs currently-active players" without a
  // second lookup (used by TopBattersFaced's active/retired toggle).
  batterActive: Record<number, boolean>
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

async function resolveBatters(ids: number[]): Promise<{ names: Record<number, string>; active: Record<number, boolean> }> {
  if (ids.length === 0) return { names: {}, active: {} }
  try {
    // MLB's /people endpoint caps how many ids one request handles well —
    // chunk to stay safe for career-long batter lists (a full Statcast-era
    // career log can face 400+ unique batters).
    const chunks: number[][] = []
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
    const names: Record<number, string> = {}
    const active: Record<number, boolean> = {}
    for (const chunk of chunks) {
      const res = await fetch(`${MLB_API}/people?personIds=${chunk.join(',')}`, { next: { revalidate: 86400 } })
      if (!res.ok) continue
      const json = await res.json()
      for (const p of json.people ?? []) {
        names[p.id] = p.fullName ?? `#${p.id}`
        active[p.id] = p.active === true
      }
    }
    return { names, active }
  } catch {
    return { names: {}, active: {} }
  }
}

// First full season of pitch-level Statcast tracking — the real floor for
// any "career" pull, regardless of how much earlier a pitcher debuted.
const STATCAST_FIRST_SEASON = 2015

export async function getPitcherPitchLog(pitcherId: number, season = SEASON_FALLBACK, range: 'season' | 'career' = 'season'): Promise<PitcherPitchLog | null> {
  const isCareer = range === 'career'
  const fromYear = isCareer ? STATCAST_FIRST_SEASON : season
  const toYear = season
  const hfSea = isCareer
    ? Array.from({ length: toYear - fromYear + 1 }, (_, i) => `${fromYear + i}%7C`).join('')
    : `${season}%7C`

  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${hfSea}&player_type=pitcher`,
    `&pitchers_lookup%5B%5D=${pitcherId}`,
    `&game_date_gt=${fromYear}-01-01&game_date_lt=${toYear}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc&type=details',
  ].join('')

  let text: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
      // Career pulls span seasons that are done and won't change — safe to
      // cache longer than the current-season 6h window.
      next: { revalidate: isCareer ? 86400 : 21600 },
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
  const iPlateX = idx('plate_x'), iPlateZ = idx('plate_z'), iZone = idx('zone')
  const iVelo = idx('release_speed'), iDesc = idx('description'), iEvents = idx('events')
  const iEffSpeed = idx('effective_speed')
  const iBalls = idx('balls'), iStrikes = idx('strikes'), iInning = idx('inning'), iBatter = idx('batter')
  const iOn1b = idx('on_1b'), iOn2b = idx('on_2b'), iOn3b = idx('on_3b')
  const iGamePk = idx('game_pk'), iAtBat = idx('at_bat_number'), iPitchNum = idx('pitch_number')
  const iRelX = idx('release_pos_x'), iRelZ = idx('release_pos_z'), iArm = idx('arm_angle')
  const iSpin = idx('release_spin_rate'), iExt = idx('release_extension')
  if (iDate === -1 || iPitchType === -1 || iPlateX === -1 || iPlateZ === -1) return null

  const pitches: RawPitch[] = []
  const pitchNames: Record<string, string> = {}
  const batterIds = new Set<number>()

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, ''))
    const date = cells[iDate]
    const pitchType = cells[iPitchType]
    const plateX = Number(cells[iPlateX])
    const plateZ = Number(cells[iPlateZ])
    if (!date || !pitchType || Number.isNaN(plateX) || Number.isNaN(plateZ)) continue
    if (iPitchName !== -1 && cells[iPitchName] && !pitchNames[pitchType]) pitchNames[pitchType] = cells[iPitchName]

    const velo = iVelo !== -1 ? Number(cells[iVelo]) : NaN
    const eventsVal = iEvents !== -1 ? cells[iEvents] : ''
    const descVal = iDesc !== -1 ? cells[iDesc] : ''
    const balls = iBalls !== -1 ? Number(cells[iBalls]) : NaN
    const strikes = iStrikes !== -1 ? Number(cells[iStrikes]) : NaN
    const inning = iInning !== -1 ? Number(cells[iInning]) : NaN
    const batterId = iBatter !== -1 ? Number(cells[iBatter]) : NaN
    if (!Number.isNaN(batterId)) batterIds.add(batterId)

    const zoneRaw = iZone !== -1 ? Number(cells[iZone]) : NaN
    const gamePk = iGamePk !== -1 ? Number(cells[iGamePk]) : NaN
    const atBatNumber = iAtBat !== -1 ? Number(cells[iAtBat]) : NaN
    const pitchNumber = iPitchNum !== -1 ? Number(cells[iPitchNum]) : NaN
    const releasePosX = iRelX !== -1 ? Number(cells[iRelX]) : NaN
    const releasePosZ = iRelZ !== -1 ? Number(cells[iRelZ]) : NaN
    const armAngle = iArm !== -1 ? Number(cells[iArm]) : NaN
    const spinRate = iSpin !== -1 ? Number(cells[iSpin]) : NaN
    const extension = iExt !== -1 ? Number(cells[iExt]) : NaN
    const effectiveSpeed = iEffSpeed !== -1 ? Number(cells[iEffSpeed]) : NaN

    pitches.push({
      date, pitchType, plateX, plateZ,
      zone: Number.isNaN(zoneRaw) ? null : String(Math.trunc(zoneRaw)),
      velo: Number.isNaN(velo) ? null : velo,
      result: eventsVal || descVal || null,
      description: descVal || null,
      isHit: HIT_EVENTS.has(eventsVal),
      balls: Number.isNaN(balls) ? null : balls,
      strikes: Number.isNaN(strikes) ? null : strikes,
      inning: Number.isNaN(inning) ? null : inning,
      batterId: Number.isNaN(batterId) ? null : batterId,
      onBase: {
        first: iOn1b !== -1 && cells[iOn1b] !== '',
        second: iOn2b !== -1 && cells[iOn2b] !== '',
        third: iOn3b !== -1 && cells[iOn3b] !== '',
      },
      gamePk: Number.isNaN(gamePk) ? null : gamePk,
      atBatNumber: Number.isNaN(atBatNumber) ? null : atBatNumber,
      pitchNumber: Number.isNaN(pitchNumber) ? null : pitchNumber,
      releasePosX: Number.isNaN(releasePosX) ? null : releasePosX,
      releasePosZ: Number.isNaN(releasePosZ) ? null : releasePosZ,
      armAngle: Number.isNaN(armAngle) ? null : armAngle,
      spinRate: Number.isNaN(spinRate) ? null : spinRate,
      extension: Number.isNaN(extension) ? null : extension,
      effectiveSpeed: Number.isNaN(effectiveSpeed) ? null : effectiveSpeed,
    })
  }

  if (pitches.length === 0) return null
  const { names: batterNames, active: batterActive } = await resolveBatters([...batterIds])
  return { pitcherId, season, pitches, pitchNames, batterNames, batterActive }
}
