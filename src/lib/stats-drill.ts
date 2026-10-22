// src/lib/stats-drill.ts
//
// Lazy "expand this row" data for the stats tables (read-only, MLB Stats API):
//
//   team   → players   /stats?teamId=…        (same filters as the table; a situation filter applies)
//   player → games     /people/{id}/stats?stats=gameLog
//   game   → detail    /game/{pk}/playByPlay  batter: each plate appearance and how it ended
//                                              pitcher: every pitch (type, speed, count, call)
//
// Each level is fetched only when a row is opened, throttled (max 6 in flight) and memoised
// (finished seasons 24h, the live season 30 min) so repeated opens never re-hit MLB.

import { throttledMlbFetch } from '@/lib/mlb-fetch-limiter'
import { memo, pickTotals } from '@/lib/stats-query'
import { MLB_TEAMS } from '@/lib/teams'
import { CURRENT_SEASON, type Group, type Totals } from '@/lib/stats-query-catalog'

const MLB = 'https://statsapi.mlb.com/api/v1'

async function getJson(url: string, ms = 30_000): Promise<any> {
  const res = await throttledMlbFetch(url, { cache: 'no-store', signal: AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`MLB Stats API ${res.status}`)
  return res.json()
}

const abbrOf = (id: number | undefined) => MLB_TEAMS.find(t => t.id === id)?.abbrev ?? ''

export type DrillPlayer = { id: number; name: string; pos?: string; totals: Totals }
export type DrillGame = { gamePk: number; date: string; opp: string; isHome: boolean; isWin: boolean | null; gameType: string; totals: Totals }
/** One pitch with everything MLB's feed gives us: what it was, how it came in, where it crossed, how it was called. */
export type PitchLite = {
  no: number; type: string; speed: number | null; spin: number | null; zone: number | null
  call: string; count: string                       // count AFTER the pitch
  kind: 'ball' | 'strike' | 'foul' | 'inplay' | 'other'
  px: number | null; pz: number | null              // plate location, feet (catcher's view)
  szTop: number | null; szBot: number | null        // the batter's strike zone for that pitch
  /** the batted ball, when the pitch was put in play */
  ev: number | null; la: number | null; dist: number | null   // exit velocity (mph), launch angle (deg), distance (ft)
  bbType: string | null                                      // ground_ball / line_drive / fly_ball / popup
}
export type DrillPA = { ev: number | null; la: number | null; dist: number | null; bbType: string | null; atBat: number; inning: number; half: string; pitcher: string; batter: string; event: string; description: string; pitches: number; count: string; pitchList: PitchLite[] }
export type DrillPitch = PitchLite & { inning: number; half: string; batter: string; result: string }
export type DrillDetail = { kind: 'pa'; rows: DrillPA[] } | { kind: 'pitches'; rows: DrillPitch[] } | { kind: 'none'; rows: [] }

/** Players of one club for the same selection as the table. Seasons are summed per player. */
export async function teamPlayers(group: Group, teamId: number, gameType: string, from: number, to: number, split: string): Promise<DrillPlayer[]> {
  const acc = new Map<string, DrillPlayer>()
  for (let y = Math.min(from, to); y <= Math.max(from, to); y++) {
    const rows = await memo(`drill|tp|${group}|${teamId}|${gameType}|${y}|${split}`, y, async () => {
      const base = `${MLB}/stats?group=${group}&gameType=${gameType}&season=${y}&sportIds=1&playerPool=ALL&teamId=${teamId}&limit=200`
      const j = await getJson(split ? `${base}&stats=statSplits&sitCodes=${split}` : `${base}&stats=season`)
      return ((j?.stats?.[0]?.splits ?? []) as any[]).filter(s => s.player?.id).map(s => ({
        id: Number(s.player.id), name: String(s.player.fullName ?? ''), pos: s.position?.abbreviation as string | undefined, totals: pickTotals(group, s.stat ?? {}),
      })) as DrillPlayer[]
    })
    for (const r of rows) {
      const k = `${r.id}|${r.pos ?? ''}`
      const cur = acc.get(k)
      if (cur) for (const f of Object.keys(r.totals)) cur.totals[f] = (cur.totals[f] ?? 0) + r.totals[f]
      else acc.set(k, { ...r, totals: { ...r.totals } })
    }
  }
  const key = group === 'hitting' ? 'plateAppearances' : group === 'pitching' ? 'battersFaced' : 'chances'
  return [...acc.values()].sort((a, b) => (b.totals[key] ?? 0) - (a.totals[key] ?? 0))
}

/** One player's game log across the selected seasons, newest first. */
export async function playerGames(group: Group, playerId: number, gameType: string, from: number, to: number): Promise<DrillGame[]> {
  const out: DrillGame[] = []
  for (let y = Math.min(from, to); y <= Math.max(from, to); y++) {
    const rows = await memo(`drill|pg|${group}|${playerId}|${gameType}|${y}`, y, async () => {
      const j = await getJson(`${MLB}/people/${playerId}/stats?stats=gameLog&group=${group}&season=${y}&gameType=${gameType}`)
      return ((j?.stats?.[0]?.splits ?? []) as any[]).map(s => ({
        gamePk: Number(s.game?.gamePk), date: String(s.date ?? ''), opp: abbrOf(s.opponent?.id) || String(s.opponent?.name ?? ''),
        isHome: !!s.isHome, isWin: typeof s.isWin === 'boolean' ? s.isWin : null, gameType: String(s.gameType ?? ''),
        totals: pickTotals(group, s.stat ?? {}),
      })) as DrillGame[]
    })
    out.push(...rows)
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

/** Plate appearances (batter) or pitches (pitcher) from one game's play-by-play. */
const kindOf = (d: any): PitchLite['kind'] => {
  if (d?.isInPlay) return 'inplay'
  if (d?.isBall) return 'ball'
  if (d?.isStrike) return /foul/i.test(String(d?.description ?? '')) ? 'foul' : 'strike'
  return 'other'
}
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function pitchesOf(play: any): PitchLite[] {
  return (play.playEvents ?? []).filter((e: any) => e.isPitch).map((e: any, i: number): PitchLite => ({
    no: i + 1,
    type: String(e.details?.type?.description ?? '—'),
    speed: numOrNull(e.pitchData?.startSpeed),
    spin: numOrNull(e.pitchData?.breaks?.spinRate),
    zone: numOrNull(e.pitchData?.zone),
    call: String(e.details?.description ?? ''),
    count: `${e.count?.balls ?? 0}-${e.count?.strikes ?? 0}`,
    kind: kindOf(e.details),
    px: numOrNull(e.pitchData?.coordinates?.pX), pz: numOrNull(e.pitchData?.coordinates?.pZ),
    szTop: numOrNull(e.pitchData?.strikeZoneTop), szBot: numOrNull(e.pitchData?.strikeZoneBottom),
    ev: numOrNull(e.hitData?.launchSpeed), la: numOrNull(e.hitData?.launchAngle), dist: numOrNull(e.hitData?.totalDistance),
    bbType: typeof e.hitData?.trajectory === 'string' ? e.hitData.trajectory : null,
  }))
}

/**
 * Plate appearances (batter) or pitches (pitcher) from one game's play-by-play.
 * `atBat` is Savant's at_bat_number (= MLB's atBatIndex + 1): when given, only that one plate appearance is returned.
 */
export async function gameDetail(group: Group, gamePk: number, playerId: number, atBat?: number): Promise<DrillDetail> {
  if (group === 'fielding') return { kind: 'none', rows: [] }
  const plays: any[] = await memo(`drill|pbp|${gamePk}`, CURRENT_SEASON, async () => (await getJson(`${MLB}/game/${gamePk}/playByPlay`)).allPlays ?? [])
  const half = (p: any) => (p.about?.isTopInning ? 'Top' : 'Bot')

  if (group === 'hitting') {
    const rows: DrillPA[] = plays
      .filter(p => p.matchup?.batter?.id === playerId && p.result?.type === 'atBat' && (atBat == null || Number(p.atBatIndex) + 1 === atBat))
      .map(p => {
        const pitchList = pitchesOf(p)
        const bip = [...pitchList].reverse().find(x => x.ev != null)
        return {
          ev: bip?.ev ?? null, la: bip?.la ?? null, dist: bip?.dist ?? null, bbType: bip?.bbType ?? null,
          atBat: Number(p.atBatIndex) + 1, inning: Number(p.about?.inning), half: half(p), pitcher: String(p.matchup?.pitcher?.fullName ?? ''),
          batter: String(p.matchup?.batter?.fullName ?? ''), event: String(p.result?.event ?? ''), description: String(p.result?.description ?? ''),
          pitches: pitchList.length, count: `${p.count?.balls ?? 0}-${p.count?.strikes ?? 0}`, pitchList,
        }
      })
    return { kind: 'pa', rows }
  }

  const rows: DrillPitch[] = []
  for (const p of plays.filter(x => x.matchup?.pitcher?.id === playerId)) {
    const list = pitchesOf(p)
    list.forEach((pt, i) => rows.push({
      ...pt, inning: Number(p.about?.inning), half: half(p), batter: String(p.matchup?.batter?.fullName ?? ''),
      result: i === list.length - 1 ? String(p.result?.event ?? '') : '',
    }))
  }
  return { kind: 'pitches', rows }
}
