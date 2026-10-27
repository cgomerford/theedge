// src/lib/lab-log.ts
//
// One shape for the Pitching Lab and Batting Lab views. The lab components (Location, Sequencing, Trends, the overlay and H2H) were built
// on a pitcher's per-pitch log (PitcherPitchLog). A batter's log (BatterPitchLog) holds the same pitches seen from the other side, so
// `batterAsPitchLog` re-labels it to that shape and the same components serve both labs:
//   pitchType, location, speed, spin, break, flight and result carry over unchanged;
//   `stand` holds the PITCHER's throwing hand (the side the views filter by), and `batterId` holds the PITCHER's id (the opponent);
//   `batterNames` holds the pitchers' names; `launchAngle`, `batSpeed` and `swingLength` are filled in.
// Safe to import in the browser. Pure functions plus one fetch helper.
import type { BatterPitchLog, RawBatterPitch } from '@/lib/batter-pitch-log'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'

export type LabRole = 'pitcher' | 'batter'

function asPitch(b: RawBatterPitch): RawPitch {
  return {
    date: b.date, pitchType: b.pitchType, plateX: b.plateX, plateZ: b.plateZ, zone: b.zone, velo: b.releaseSpeed,
    result: b.result, description: b.description, isHit: b.isHit, balls: b.balls, strikes: b.strikes, inning: b.inning,
    batterId: b.pitcherId, onBase: b.onBase, gamePk: b.gamePk, atBatNumber: b.atBatNumber, pitchNumber: b.pitchNumber,
    releasePosX: b.releasePosX, releasePosZ: b.releasePosZ, armAngle: b.armAngle, spinRate: b.spinRate, extension: b.extension,
    effectiveSpeed: null, traj: b.traj, pfx: b.pfxX != null && b.pfxZ != null ? [b.pfxX, b.pfxZ] : null,
    topBot: b.topBot, stand: b.pitcherThrows, woba: b.woba, xwoba: b.xwoba, wobaDen: b.wobaDen, exitVelo: b.launchSpeed,
    launchAngle: b.launchAngle, batSpeed: b.batSpeed, swingLength: b.swingLength,
  }
}

/** The hand most of the pitches came from: used for the flight and spin drawings, which need one throwing side. */
export function majorityHand(pitches: RawBatterPitch[]): 'L' | 'R' | null {
  let l = 0, r = 0
  for (const p of pitches) { if (p.pitcherThrows === 'L') l++; else if (p.pitcherThrows === 'R') r++ }
  return l === 0 && r === 0 ? null : l > r ? 'L' : 'R'
}

export function batterAsPitchLog(log: BatterPitchLog): PitcherPitchLog {
  return {
    pitcherId: log.batterId, season: log.season, throws: majorityHand(log.pitches),
    pitches: log.pitches.map(asPitch), pitchNames: log.pitchNames, batterNames: log.pitcherNames, batterActive: {},
  }
}

/** The same log, only the pitches from one throwing hand (flight paths average release points, which differ by hand). */
export function onlyHand(log: PitcherPitchLog, hand: 'L' | 'R' | null): PitcherPitchLog {
  return hand ? { ...log, throws: hand, pitches: log.pitches.filter(p => p.stand === hand) } : log
}

/** One season of a lab player's pitches in the shared shape; null when there is none or it is not open to this viewer. */
export async function fetchLabLog(role: LabRole, id: number, season: number, extra = ''): Promise<PitcherPitchLog | null> {
  try {
    const url = role === 'pitcher' ? `/api/mlb/pitch-log?playerId=${id}&season=${season}${extra}` : `/api/mlb/batter-pitch-log?batterId=${id}&season=${season}${extra}`
    const r = await fetch(url)
    const j = await r.json()
    if (!r.ok || j.error) return null
    return role === 'pitcher' ? (j as PitcherPitchLog) : batterAsPitchLog(j as BatterPitchLog)
  } catch { return null }
}
