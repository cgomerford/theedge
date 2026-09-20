// src/lib/postgame/umpires.ts
//
// Postgame §11 Umpire report — the four-man crew (boxscore.officials) and, where the data
// supports it, how the plate umpire's ball/strike calls held up tonight.
// A "take" is a pitch the batter didn't swing at (final call Ball or Called Strike). A call is
// counted as missed when
//   · it was ABS-challenged and overturned (original call wrong — see abs.ts for why the feed's
//     call is the final one), or
//   · it was NOT challenged and the tracked location sits clearly on the wrong side of that
//     batter's zone: plate half-width 0.83 ft (17-inch plate + a ball's radius) and the feed's own
//     per-pitch strikeZoneTop/Bottom widened by the same ball radius (ABS overturned a pitch 0.4"
//     below the bare bottom edge, which is what showed the radius was needed), with a 0.5-inch grace so edge-of-zone pitches aren't flagged.
// Challenged-and-upheld calls are correct by definition and never re-graded by geometry. Same
// zone definition as lib/postgame.ts (old) and lib/umpire-scouting.ts. Below MIN_TAKES graded
// pitches the zone summary is withheld and only the crew is shown.

import type { PostData } from './data'
import type { Side } from './recap'
import { pitchContexts } from './pitchlog'
import { whenOf, type Tip } from './tip'

const ZONE_HALF_WIDTH_FT = 0.83
const BALL_RADIUS_FT = 0.121    // a pitch is a strike if ANY part of the ball touches the zone, so the zone grows by a ball radius (0.708 + 0.121 = 0.83 sideways; the same applies top and bottom)
const CALL_GRACE_FT = 0.5 / 12
export const MIN_TAKES = 40

export type TakePoint = { x: number; z: number; call: 'strike' | 'ball'; missed: boolean; tip: Tip }
export type Miss = {
  inning: number; top: boolean
  batter: string; pitcher: string
  call: 'strike' | 'ball'          // the call as first made
  where: 'high' | 'low' | 'wide' | 'in the zone'   // where the pitch actually was
  inches: number                   // distance from the nearest zone edge (outside it, or how far inside it)
  helped: Side                     // a ball called a strike helps the fielding club; a strike called a ball helps the batting club
  overturned: boolean              // an ABS challenge already corrected it
}
export type PlateNight = {
  name: string
  takes: number            // takes with a location to grade
  missed: number
  accuracyPct: number
  extraStrikes: number     // balls called strikes
  lostStrikes: number      // strikes called balls
  overturned: number       // of the misses, how many an ABS challenge already corrected
  points: TakePoint[]
  misses: Miss[]
  byInning: { inning: number; takes: number; missed: number }[]
  zoneTop: number; zoneBottom: number
}
export type UmpireNight = { crew: { role: string; name: string }[]; plate: PlateNight | null }

export function buildUmpires(d: PostData): UmpireNight {
  const officials = d.feed.liveData.boxscore.officials ?? []
  const crew = officials.map((o) => ({ role: o.officialType, name: o.official.fullName }))
  const hp = crew.find((c) => c.role === 'Home Plate')
  const points: TakePoint[] = []
  const ctxs = pitchContexts(d)
  const abbr = { away: d.feed.gameData.teams.away.abbreviation ?? 'AWAY', home: d.feed.gameData.teams.home.abbreviation ?? 'HOME' }
  const misses: Miss[] = []
  const inn = new Map<number, { takes: number; missed: number }>()
  let missed = 0, extraStrikes = 0, lostStrikes = 0, overturned = 0, tops = 0, bottoms = 0, zn = 0
  for (const play of d.feed.liveData.plays.allPlays) {
    for (const e of play.playEvents ?? []) {
      if (!e.isPitch) continue
      const code = e.details?.call?.code
      if (code !== 'B' && code !== 'C') continue
      const pd = e.pitchData
      const x = pd?.coordinates?.pX, z = pd?.coordinates?.pZ
      const top = pd?.strikeZoneTop != null ? pd.strikeZoneTop + BALL_RADIUS_FT : undefined, bottom = pd?.strikeZoneBottom != null ? pd.strikeZoneBottom - BALL_RADIUS_FT : undefined
      if (x == null || z == null || top == null || bottom == null) continue   // can't grade without a location
      const rv = e.reviewDetails?.reviewType === 'MJ' ? e.reviewDetails : null
      let miss: boolean
      if (rv) miss = rv.isOverturned === true
      else {
        const outside = Math.abs(x) > ZONE_HALF_WIDTH_FT + CALL_GRACE_FT || z < bottom - CALL_GRACE_FT || z > top + CALL_GRACE_FT
        const inside = Math.abs(x) <= ZONE_HALF_WIDTH_FT - CALL_GRACE_FT && z >= bottom + CALL_GRACE_FT && z <= top - CALL_GRACE_FT
        miss = (code === 'C' && outside) || (code === 'B' && inside)
      }
      tops += top; bottoms += bottom; zn += 1
      // the call as first made: an overturned challenge flipped it
      const original = rv?.isOverturned ? (code === 'C' ? 'ball' : 'strike') : (code === 'C' ? 'strike' : 'ball')
      const ctx = ctxs.get(`${play.about.atBatIndex}:${e.index}`)
      const tip: Tip = {
        pitcher: play.matchup.pitcher.fullName, batter: play.matchup.batter.fullName, when: whenOf(play.about.inning, play.about.isTopInning),
        outs: ctx?.outs ?? 0, count: `${Math.max(0, (e.count?.balls ?? 0) - (code === 'B' ? 1 : 0))}-${Math.max(0, (e.count?.strikes ?? 0) - (code === 'C' ? 1 : 0))}`,
        bases: ctx?.bases ?? [false, false, false],
        pitch: (e.details?.type?.description ?? 'Pitch').replace('Four-Seam Fastball', '4-seam').replace('Two-Seam Fastball', 'Sinker'),
        velo: pd?.startSpeed ?? null,
        result: rv?.isOverturned ? `${original === 'strike' ? 'Called strike' : 'Ball'} → overturned by ABS challenge` : (code === 'C' ? 'Called strike' : 'Ball') + (rv ? ' (challenge: call stood)' : ''),
      }
      points.push({ x, z, call: original, missed: miss, tip })
      const row = inn.get(play.about.inning) ?? { takes: 0, missed: 0 }
      row.takes += 1; if (miss) row.missed += 1
      inn.set(play.about.inning, row)
      if (miss) {
        missed += 1
        if (original === 'strike') extraStrikes += 1; else lostStrikes += 1
        if (rv) overturned += 1
        // distance from the nearest zone edge, in inches: outside it for a ball called a strike, inside it for a strike called a ball
        const dx = Math.abs(x) - ZONE_HALF_WIDTH_FT, dzTop = z - top, dzBot = bottom - z
        const outsideFt = Math.max(dx, dzTop, dzBot)
        const inches = Math.abs(outsideFt) * 12
        const where: Miss['where'] = outsideFt <= 0 ? 'in the zone' : dzTop === outsideFt ? 'high' : dzBot === outsideFt ? 'low' : 'wide'
        const fielding: Side = play.about.isTopInning ? 'home' : 'away'
        const helpedSide: Side = original === 'strike' ? fielding : fielding === 'home' ? 'away' : 'home'
        tip.flag = `MISSED CALL: ${original === 'strike' ? 'ball called a strike' : 'strike called a ball'}, ${inches.toFixed(1)}″ ${where === 'in the zone' ? 'inside the zone' : where === 'wide' ? 'off the plate' : where === 'high' ? 'above the zone' : 'below the zone'} — helped ${abbr[helpedSide]}${rv ? ' (ABS fixed it)' : ''}`
        misses.push({
          inning: play.about.inning, top: play.about.isTopInning,
          batter: play.matchup.batter.fullName, pitcher: play.matchup.pitcher.fullName,
          call: original, where, inches: Number(inches.toFixed(1)),
          helped: original === 'strike' ? fielding : fielding === 'home' ? 'away' : 'home',
          overturned: !!rv,
        })
      }
    }
  }
  if (!hp || zn < MIN_TAKES) return { crew, plate: null }
  return {
    crew,
    plate: {
      name: hp.name, takes: zn, missed, accuracyPct: ((zn - missed) / zn) * 100,
      extraStrikes, lostStrikes, overturned, points,
      misses, byInning: [...inn.entries()].sort((a, b) => a[0] - b[0]).map(([inning, r]) => ({ inning, ...r })),
      zoneTop: tops / zn, zoneBottom: bottoms / zn,
    },
  }
}
