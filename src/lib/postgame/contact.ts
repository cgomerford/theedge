// src/lib/postgame/contact.ts
//
// Postgame §7 Spray & contact — every ball put in play (Gameday hit coordinates on the live
// feed's 250×250 field grid, plus exit speed and launch angle), hard-hit % and barrel % for each
// club this game, and each club's season figures for comparison.
//   Hard-hit  exit speed ≥ 95 mph (same cut Savant uses).
//   Barrel    Savant's own flag isn't in the MLB feed, so it is rebuilt from the published definition:
//             exit speed ≥ 98 mph and launch angle between 26° and 30° at 98 mph, the window widening
//             by 1° each side per extra mph, capped at 8°–50°. Checked against Savant's is_barrel on
//             505 batted balls across 10 games (2026-09-12..18): 0 disagreements.
//   Season    Savant's small batter-team leaderboard (30 rows; ev95percent, brl_percent), fetched with
//             Next's fetch cache. The CSV starts with a UTF-8 BOM that corrupts the first header, so
//             it is stripped. A club missing from it just gets no comparison.
// Fields confirmed on game 824225: hitData.{launchSpeed,launchAngle,totalDistance,coordinates.{coordX,coordY}}.

import type { PostData } from './data'
import type { Side } from './recap'
import { pitchContexts } from './pitchlog'
import { whenOf, type Tip } from './tip'

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

export const HARD_HIT_MPH = 95
export function isBarrel(ev: number, la: number): boolean {
  if (ev < 98) return false
  const d = ev - 98
  return la >= Math.max(8, 26 - d) && la <= Math.min(50, 30 + d)
}

export type Ball = {
  x: number; y: number
  ev: number | null; la: number | null; dist: number | null
  result: string
  hit: boolean            // single / double / triple / home run
  hard: boolean; barrel: boolean
  batter: string
  tip: Tip
}
export type ContactSide = {
  side: Side
  balls: Ball[]
  bbe: number             // balls in play with a measured exit speed
  hardHit: number; barrels: number
  avgEv: number | null; maxEv: number | null
  seasonHardPct: number | null; seasonBarrelPct: number | null
}

const HIT_TYPES = new Set(['single', 'double', 'triple', 'home_run'])

async function getTeamSeason(year: number): Promise<Map<string, { hard: number; barrel: number }>> {
  const out = new Map<string, { hard: number; barrel: number }>()
  try {
    const res = await fetch(`https://baseballsavant.mlb.com/leaderboard/statcast?type=batter-team&year=${year}&position=&team=&min=1&csv=true`, { next: { revalidate: 43200 }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) { console.error('[getTeamSeason] Savant HTTP', res.status); return out }
    const text = (await res.text()).replace(/^﻿/, '')
    const [head, ...rows] = text.trim().split(/\r?\n/)
    const cols = head.split(',').map((c) => c.replace(/"/g, '').trim())
    const iTeam = cols.indexOf('team_id'), iHard = cols.indexOf('ev95percent'), iBrl = cols.indexOf('brl_percent')
    if (iTeam < 0 || iHard < 0 || iBrl < 0) { console.error('[getTeamSeason] expected columns missing:', cols.join(',')); return out }
    for (const r of rows) {
      const cells = r.split(',').map((c) => c.replace(/"/g, '').trim())
      const hard = parseFloat(cells[iHard]), barrel = parseFloat(cells[iBrl])
      if (cells[iTeam] && Number.isFinite(hard) && Number.isFinite(barrel)) out.set(cells[iTeam], { hard, barrel })
    }
  } catch (err) {
    console.error('[getTeamSeason] failed:', err instanceof Error ? err.message : err)
  }
  return out
}

export async function getContact(d: PostData, gameDate: string): Promise<ContactSide[]> {
  const balls: Record<Side, Ball[]> = { away: [], home: [] }
  const ctxs = pitchContexts(d)
  for (const play of d.feed.liveData.plays.allPlays) {
    const ev = (play.playEvents ?? []).find((e) => e.hitData?.coordinates?.coordX != null && e.hitData?.coordinates?.coordY != null)
    if (!ev?.hitData) continue
    const h = ev.hitData
    const speed = h.launchSpeed != null ? n(h.launchSpeed) : null
    const angle = h.launchAngle != null ? n(h.launchAngle) : null
    const eventType = play.result.eventType ?? ''
    balls[play.about.isTopInning ? 'away' : 'home'].push({
      x: n(h.coordinates?.coordX), y: n(h.coordinates?.coordY),
      ev: speed, la: angle, dist: h.totalDistance != null ? n(h.totalDistance) : null,
      result: play.result.event ?? eventType,
      hit: HIT_TYPES.has(eventType),
      hard: speed != null && speed >= HARD_HIT_MPH,
      barrel: speed != null && angle != null && isBarrel(speed, angle),
      batter: play.matchup.batter.fullName,
      tip: {
        pitcher: play.matchup.pitcher.fullName, batter: play.matchup.batter.fullName,
        when: whenOf(play.about.inning, play.about.isTopInning),
        outs: ctxs.get(`${play.about.atBatIndex}:${ev.index}`)?.outs ?? 0,
        count: `${n(ev.count?.balls)}-${n(ev.count?.strikes)}`,
        bases: ctxs.get(`${play.about.atBatIndex}:${ev.index}`)?.bases ?? [false, false, false],
        pitch: (ev.details?.type?.description ?? 'Pitch').replace('Four-Seam Fastball', '4-seam').replace('Two-Seam Fastball', 'Sinker'),
        velo: ev.pitchData?.startSpeed != null ? n(ev.pitchData.startSpeed) : null,
        result: play.result.event ?? eventType,
        detail: [speed != null ? `${speed.toFixed(1)} mph off the bat` : null, angle != null ? `${angle.toFixed(0)}°` : null, h.totalDistance ? `${n(h.totalDistance).toFixed(0)} ft` : null, h.trajectory ? h.trajectory.replace('_', ' ') : null].filter(Boolean).join(' · ') || undefined,
      },
    })
  }
  const gd = d.feed.gameData
  const season = await getTeamSeason(Number(gameDate.slice(0, 4)))
  return (['away', 'home'] as Side[]).map((side) => {
    const list = balls[side]
    const measured = list.filter((b) => b.ev != null)
    const evs = measured.map((b) => b.ev as number)
    const base = season.get(gd.teams[side].abbreviation ?? '')
    return {
      side, balls: list,
      bbe: measured.length,
      hardHit: measured.filter((b) => b.hard).length,
      barrels: measured.filter((b) => b.barrel).length,
      avgEv: evs.length ? evs.reduce((a, b) => a + b, 0) / evs.length : null,
      maxEv: evs.length ? Math.max(...evs) : null,
      seasonHardPct: base?.hard ?? null, seasonBarrelPct: base?.barrel ?? null,
    }
  })
}
