// src/lib/mlb-recap.ts

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export type Grade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F'

export type BatterPerformance = {
  personId: number
  name: string
  teamAbbr: string
  headshot: string
  line: string
  score: number
  grade: Grade
  seasonAVG: string | null
  seasonOPS: string | null
  seasonHR: number | null
  seasonRBI: number | null
  gameHits: number
  gameAB: number
  gameTB: number
  gameBB: number
  gameHBP: number
  gameSF: number
  gamePA: number
}

export type PitcherPerformance = {
  personId: number
  name: string
  teamAbbr: string
  headshot: string
  line: string
  score: number
  grade: Grade
  seasonERA: string | null
  seasonWHIP: string | null
  seasonK: number | null
  gameER: number
  gameIP: string
  gameHits: number
  gameBB: number
}

export type BlownSave = {
  personId: number
  name: string
  teamAbbr: string
  headshot: string
  line: string
  opponentAbbr: string
}

export type RecapResult<T> =
  | { available: true; items: T[] }
  | { available: false; reason: string }

function batterScore(b: { totalBases: number; rbi: number; runs: number; stolenBases: number; baseOnBalls: number; strikeOuts: number }): number {
  return b.totalBases + b.rbi + b.runs + (1.5 * b.stolenBases) + (0.5 * b.baseOnBalls) - (0.5 * b.strikeOuts)
}

function gradeBatter(score: number): Grade {
  if (score >= 12) return 'A+'
  if (score >= 8) return 'A'
  if (score >= 5) return 'B+'
  if (score >= 3) return 'B'
  if (score >= 1.5) return 'C+'
  if (score >= 0) return 'C'
  if (score >= -1.5) return 'D'
  return 'F'
}

function pitcherGameScore(p: {
  outs: number; earnedRuns: number; runs: number; strikeOuts: number; hits: number;
  baseOnBalls: number; saves: number; holds: number; blownSaves: number
}): number {
  const inningsCompleted = Math.floor(p.outs / 3)
  const inningsPastFour = Math.max(0, inningsCompleted - 4)
  const unearnedRuns = Math.max(0, p.runs - p.earnedRuns)
  let score = 50 + p.outs + (2 * inningsPastFour) + p.strikeOuts
    - (2 * p.hits) - (4 * p.earnedRuns) - (2 * unearnedRuns) - p.baseOnBalls
  if (p.saves > 0) score += 3
  if (p.holds > 0) score += 2
  if (p.blownSaves > 0) score -= 5
  return score
}

function gradePitcher(score: number): Grade {
  if (score >= 80) return 'A+'
  if (score >= 65) return 'A'
  if (score >= 55) return 'B+'
  if (score >= 45) return 'B'
  if (score >= 35) return 'C+'
  if (score >= 25) return 'C'
  if (score >= 15) return 'D'
  return 'F'
}

function headshotUrl(personId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${personId}/headshot/67/current`
}

async function getYesterdaysGamePks(dateStr: string): Promise<{ gamePk: number; awayAbbr: string; homeAbbr: string }[]> {
  const url = `${MLB_API}/schedule?sportId=1&date=${dateStr}`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    const games: any[] = data.dates?.[0]?.games ?? []
    return games
      .filter(g => g.status?.abstractGameState === 'Final')
      .map(g => ({ gamePk: g.gamePk, awayAbbr: g.teams?.away?.team?.abbreviation ?? '—', homeAbbr: g.teams?.home?.team?.abbreviation ?? '—' }))
  } catch (e) { console.error('getYesterdaysGamePks error:', e); return [] }
}

async function getBoxscore(gamePk: number): Promise<any | null> {
  const url = `${MLB_API}/game/${gamePk}/boxscore`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    return await res.json()
  } catch (e) { console.error(`getBoxscore(${gamePk}) error:`, e); return null }
}

export async function getYesterdaysPerformers(
  dateStr: string, limit = 5
): Promise<{ batters: RecapResult<BatterPerformance>; pitchers: RecapResult<PitcherPerformance> }> {
  const games = await getYesterdaysGamePks(dateStr)
  console.log(`[mlb-recap] getYesterdaysPerformers(${dateStr}): found ${games.length} final games —`, games.map(g => g.gamePk))
  if (games.length === 0) {
    const r = { available: false as const, reason: `No completed games found for ${dateStr}.` }
    return { batters: r, pitchers: r }
  }
  const batters: BatterPerformance[] = []
  const pitchers: PitcherPerformance[] = []

  for (const game of games) {
    const box = await getBoxscore(game.gamePk)
    if (!box) { console.error(`[mlb-recap] boxscore null for gamePk ${game.gamePk}`); continue }
    for (const side of ['away', 'home'] as const) {
      const players = box.teams?.[side]?.players ?? {}
      const teamAbbr = side === 'away' ? game.awayAbbr : game.homeAbbr
      for (const p of Object.values(players) as any[]) {
        const bat = p.stats?.batting
        const sBat = p.seasonStats?.batting
        if (bat && bat.atBats > 0) {
          const sc = batterScore({ totalBases: bat.totalBases ?? 0, rbi: bat.rbi ?? 0, runs: bat.runs ?? 0, stolenBases: bat.stolenBases ?? 0, baseOnBalls: bat.baseOnBalls ?? 0, strikeOuts: bat.strikeOuts ?? 0 })
          const parts = [`${bat.hits ?? 0}-${bat.atBats ?? 0}`]
          if (bat.homeRuns) parts.push(`${bat.homeRuns} HR`)
          if (bat.rbi) parts.push(`${bat.rbi} RBI`)
          if (bat.runs) parts.push(`${bat.runs} R`)
          if (bat.stolenBases) parts.push(`${bat.stolenBases} SB`)
          batters.push({
            personId: p.person?.id ?? 0, name: p.person?.fullName ?? '—', teamAbbr,
            headshot: headshotUrl(p.person?.id ?? 0), line: parts.join(', '),
            score: sc, grade: gradeBatter(sc),
            seasonAVG: sBat?.avg ?? null, seasonOPS: sBat?.ops ?? null,
            seasonHR: sBat?.homeRuns != null ? Number(sBat.homeRuns) : null,
            seasonRBI: sBat?.rbi != null ? Number(sBat.rbi) : null,
            gameHits: Number(bat.hits ?? 0), gameAB: Number(bat.atBats ?? 0),
            gameTB: Number(bat.totalBases ?? 0), gameBB: Number(bat.baseOnBalls ?? 0),
            gameHBP: Number(bat.hitByPitch ?? 0), gameSF: Number(bat.sacFlies ?? 0),
            gamePA: Number(bat.plateAppearances ?? 0),
          })
        }
        const pit = p.stats?.pitching
        const sPit = p.seasonStats?.pitching
        if (pit && (pit.outs ?? 0) > 0) {
          const sc = pitcherGameScore({ outs: pit.outs ?? 0, earnedRuns: pit.earnedRuns ?? 0, runs: pit.runs ?? 0, strikeOuts: pit.strikeOuts ?? 0, hits: pit.hits ?? 0, baseOnBalls: pit.baseOnBalls ?? 0, saves: pit.saves ?? 0, holds: pit.holds ?? 0, blownSaves: pit.blownSaves ?? 0 })
          pitchers.push({
            personId: p.person?.id ?? 0, name: p.person?.fullName ?? '—', teamAbbr,
            headshot: headshotUrl(p.person?.id ?? 0),
            line: `${pit.inningsPitched ?? '0.0'} IP, ${pit.earnedRuns ?? 0} ER, ${pit.strikeOuts ?? 0} K, ${pit.baseOnBalls ?? 0} BB`,
            score: sc, grade: gradePitcher(sc),
            seasonERA: sPit?.era ?? null, seasonWHIP: sPit?.whip ?? null,
            seasonK: sPit?.strikeOuts != null ? Number(sPit.strikeOuts) : null,
            gameER: Number(pit.earnedRuns ?? 0), gameIP: pit.inningsPitched ?? '0.0',
            gameHits: Number(pit.hits ?? 0), gameBB: Number(pit.baseOnBalls ?? 0),
          })
        }
      }
    }
  }
  batters.sort((a, b) => b.score - a.score)
  pitchers.sort((a, b) => b.score - a.score)
  console.log(`[mlb-recap] getYesterdaysPerformers(${dateStr}): ${batters.length} batter perfs, ${pitchers.length} pitcher perfs before slicing to limit=${limit}`)
  return {
    batters: batters.length > 0 ? { available: true, items: batters.slice(0, limit) } : { available: false, reason: 'No qualifying batting performances found.' },
    pitchers: pitchers.length > 0 ? { available: true, items: pitchers.slice(0, limit) } : { available: false, reason: 'No qualifying pitching performances found.' },
  }
}

export async function getYesterdaysBlownSaves(dateStr: string): Promise<RecapResult<BlownSave>> {
  const games = await getYesterdaysGamePks(dateStr)
  if (games.length === 0) return { available: false, reason: `No completed games found for ${dateStr}.` }
  const blownSaves: BlownSave[] = []
  for (const game of games) {
    const box = await getBoxscore(game.gamePk)
    if (!box) continue
    for (const side of ['away', 'home'] as const) {
      const players = box.teams?.[side]?.players ?? {}
      const teamAbbr = side === 'away' ? game.awayAbbr : game.homeAbbr
      const oppAbbr = side === 'away' ? game.homeAbbr : game.awayAbbr
      for (const p of Object.values(players) as any[]) {
        const pit = p.stats?.pitching
        if (pit && (pit.blownSaves ?? 0) > 0) {
          blownSaves.push({ personId: p.person?.id ?? 0, name: p.person?.fullName ?? '—', teamAbbr, headshot: headshotUrl(p.person?.id ?? 0), line: `${pit.inningsPitched ?? '0.0'} IP, ${pit.earnedRuns ?? 0} ER vs ${oppAbbr}`, opponentAbbr: oppAbbr })
        }
      }
    }
  }
  return blownSaves.length > 0 ? { available: true, items: blownSaves } : { available: false, reason: 'No blown saves yesterday.' }
}

// ═══════════════════════════════════════════════════════════════════════
// ENRICHMENT
// ═══════════════════════════════════════════════════════════════════════

export type PitchSeen = {
  code: string; description: string; pX: number; pZ: number; velocity: number;
  zone: number; isStrike: boolean; isBall: boolean; isInPlay: boolean;
  isSwinging: boolean; isWhiff: boolean; isCalledStrike: boolean;
  exitVelo: number | null; launchAngle: number | null
}

export type LongestAB = { pitchCount: number; inning: number; result: string }

export type EnrichedPerformerData = {
  pitchesSeen: PitchSeen[]
  pitchTypeCounts: Record<string, { code: string; description: string; count: number }>
  totalPitches: number
  avgExitVelo: number | null; maxExitVelo: number | null; hardHitRate: number | null
  chaseRate: number | null; whiffRate: number | null
  swStrRate: number | null; cswRate: number | null
  firstPitchStrikeRate: number | null; zoneRate: number | null
  avgVeloByPitch: Record<string, number>
  strikeZoneTop: number; strikeZoneBottom: number
  longestAB: LongestAB | null
}

export type EnrichedBatterPerformance = BatterPerformance & { pitchData: EnrichedPerformerData }
export type EnrichedPitcherPerformance = PitcherPerformance & { pitchData: EnrichedPerformerData }

const SWINGING_CALLS = new Set(['Swinging Strike', 'Swinging Strike (Blocked)', 'Foul Tip', 'Foul', 'Foul Bunt', 'In play, no out', 'In play, out(s)', 'In play, run(s)', 'Missed Bunt'])
const WHIFF_CALLS = new Set(['Swinging Strike', 'Swinging Strike (Blocked)', 'Missed Bunt'])
const IN_ZONE = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9])

async function getGameFeed(gamePk: number): Promise<any | null> {
  const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) {
      // DIAGNOSTIC: this branch was previously silent — a 404/429/5xx here
      // would produce exactly "missing stats/pitch locations" with zero
      // trace in the logs. Confirm via this line whether it's firing.
      console.error(`[mlb-recap] getGameFeed(${gamePk}) NOT OK — status ${res.status} ${res.statusText}`)
      return null
    }
    const json = await res.json()
    const playCount = json?.liveData?.plays?.allPlays?.length ?? 0
    console.log(`[mlb-recap] getGameFeed(${gamePk}) OK — ${playCount} plays, gameState=${json?.gameData?.status?.abstractGameState}`)
    return json
  } catch (e) { console.error(`[mlb-recap] getGameFeed(${gamePk}) THREW:`, e); return null }
}

type PAInfo = { pitchCount: number; inning: number; result: string }

function extractPitchesForPlayer(feed: any, personId: number, role: 'batter' | 'pitcher'): {
  pitches: PitchSeen[]; strikeZoneTop: number; strikeZoneBottom: number; plateAppearances: PAInfo[]
} {
  const plays: any[] = feed?.liveData?.plays?.allPlays ?? []
  const pitches: PitchSeen[] = []
  const plateAppearances: PAInfo[] = []
  let zoneTop = 3.5, zoneBottom = 1.5

  for (const pa of plays) {
    const matchup = pa.matchup ?? {}
    const isRelevant = role === 'batter' ? matchup.batter?.id === personId : matchup.pitcher?.id === personId
    if (!isRelevant) continue
    let paCount = 0
    for (const ev of pa.playEvents ?? []) {
      if (!ev.isPitch) continue
      paCount++
      const d = ev.details ?? {}, pd = ev.pitchData ?? {}, co = pd.coordinates ?? {}, hd = ev.hitData ?? {}
      const callDesc = d.call?.description ?? ''
      if (pd.strikeZoneTop) zoneTop = pd.strikeZoneTop
      if (pd.strikeZoneBottom) zoneBottom = pd.strikeZoneBottom
      pitches.push({
        code: d.type?.code ?? '??', description: d.type?.description ?? 'Unknown',
        pX: co.pX ?? 0, pZ: co.pZ ?? 0, velocity: pd.startSpeed ?? 0, zone: pd.zone ?? 0,
        isStrike: !!d.isStrike, isBall: !!d.isBall, isInPlay: !!d.isInPlay,
        isSwinging: SWINGING_CALLS.has(callDesc), isWhiff: WHIFF_CALLS.has(callDesc),
        isCalledStrike: callDesc === 'Called Strike',
        exitVelo: hd.launchSpeed ?? null, launchAngle: hd.launchAngle ?? null,
      })
    }
    if (paCount > 0) plateAppearances.push({ pitchCount: paCount, inning: pa.about?.inning ?? 0, result: pa.result?.event ?? '—' })
  }
  return { pitches, strikeZoneTop: zoneTop, strikeZoneBottom: zoneBottom, plateAppearances }
}

function computeEnrichedData(pitches: PitchSeen[], szTop: number, szBot: number, pas: PAInfo[]): EnrichedPerformerData {
  const ptc: Record<string, { code: string; description: string; count: number }> = {}
  const vbp: Record<string, number[]> = {}
  const evs: number[] = []
  let outZ = 0, swOutZ = 0, swings = 0, whiffs = 0, cStk = 0, inZ = 0

  for (const p of pitches) {
    if (!ptc[p.code]) ptc[p.code] = { code: p.code, description: p.description, count: 0 }
    ptc[p.code].count++
    if (p.velocity > 0) { if (!vbp[p.code]) vbp[p.code] = []; vbp[p.code].push(p.velocity) }
    if (p.exitVelo != null) evs.push(p.exitVelo)
    const iz = IN_ZONE.has(p.zone)
    if (iz) inZ++
    if (!iz && p.zone > 0) { outZ++; if (p.isSwinging) swOutZ++ }
    if (p.isSwinging) swings++
    if (p.isWhiff) whiffs++
    if (p.isCalledStrike) cStk++
  }
  const avp: Record<string, number> = {}
  for (const [c, vs] of Object.entries(vbp)) avp[c] = vs.reduce((a, b) => a + b, 0) / vs.length
  const hh = evs.filter(v => v >= 95).length
  let longest: LongestAB | null = null
  for (const pa of pas) if (!longest || pa.pitchCount > longest.pitchCount) longest = { pitchCount: pa.pitchCount, inning: pa.inning, result: pa.result }

  return {
    pitchesSeen: pitches, pitchTypeCounts: ptc, totalPitches: pitches.length,
    avgExitVelo: evs.length > 0 ? evs.reduce((a, b) => a + b, 0) / evs.length : null,
    maxExitVelo: evs.length > 0 ? Math.max(...evs) : null,
    hardHitRate: evs.length > 0 ? (hh / evs.length) * 100 : null,
    chaseRate: outZ > 0 ? (swOutZ / outZ) * 100 : null,
    whiffRate: swings > 0 ? (whiffs / swings) * 100 : null,
    swStrRate: pitches.length > 0 ? (whiffs / pitches.length) * 100 : null,
    cswRate: pitches.length > 0 ? ((cStk + whiffs) / pitches.length) * 100 : null,
    firstPitchStrikeRate: null, zoneRate: pitches.length > 0 ? (inZ / pitches.length) * 100 : null,
    avgVeloByPitch: avp, strikeZoneTop: szTop, strikeZoneBottom: szBot, longestAB: longest,
  }
}

function emptyEnrichedData(): EnrichedPerformerData {
  return { pitchesSeen: [], pitchTypeCounts: {}, totalPitches: 0, avgExitVelo: null, maxExitVelo: null, hardHitRate: null, chaseRate: null, whiffRate: null, swStrRate: null, cswRate: null, firstPitchStrikeRate: null, zoneRate: null, avgVeloByPitch: {}, strikeZoneTop: 3.5, strikeZoneBottom: 1.5, longestAB: null }
}

export async function enrichPerformersWithPitchData(batters: BatterPerformance[], pitchers: PitcherPerformance[], gamePks: number[]): Promise<{ batters: EnrichedBatterPerformance[]; pitchers: EnrichedPitcherPerformance[] }> {
  const uniquePks = [...new Set(gamePks)]
  console.log(`[mlb-recap] enrichPerformersWithPitchData: ${batters.length} batters, ${pitchers.length} pitchers, gamePks in =`, uniquePks)

  const feeds: Record<number, any> = {}
  for (const pk of uniquePks) { const f = await getGameFeed(pk); if (f) feeds[pk] = f }
  console.log(`[mlb-recap] feeds loaded: ${Object.keys(feeds).length} / ${uniquePks.length} requested —`, Object.keys(feeds))

  function findFeed(pid: number, role: 'batter' | 'pitcher') {
    for (const [pk, feed] of Object.entries(feeds)) {
      for (const pa of (feed?.liveData?.plays?.allPlays ?? []) as any[]) {
        if (role === 'batter' ? pa.matchup?.batter?.id === pid : pa.matchup?.pitcher?.id === pid) return { feed, gamePk: Number(pk) }
      }
    }
    return null
  }

  const eb: EnrichedBatterPerformance[] = batters.map(b => {
    const f = findFeed(b.personId, 'batter')
    if (!f) {
      console.warn(`[mlb-recap] NO FEED MATCH for batter ${b.name} (${b.personId}) — falling back to empty pitchData`)
      return { ...b, pitchData: emptyEnrichedData() }
    }
    const { pitches, strikeZoneTop, strikeZoneBottom, plateAppearances } = extractPitchesForPlayer(f.feed, b.personId, 'batter')
    console.log(`[mlb-recap] batter ${b.name} (${b.personId}) — gamePk ${f.gamePk} — ${pitches.length} pitches extracted`)
    return { ...b, pitchData: computeEnrichedData(pitches, strikeZoneTop, strikeZoneBottom, plateAppearances) }
  })

  const ep: EnrichedPitcherPerformance[] = pitchers.map(p => {
    const f = findFeed(p.personId, 'pitcher')
    if (!f) {
      console.warn(`[mlb-recap] NO FEED MATCH for pitcher ${p.name} (${p.personId}) — falling back to empty pitchData`)
      return { ...p, pitchData: emptyEnrichedData() }
    }
    const { pitches, strikeZoneTop, strikeZoneBottom, plateAppearances } = extractPitchesForPlayer(f.feed, p.personId, 'pitcher')
    console.log(`[mlb-recap] pitcher ${p.name} (${p.personId}) — gamePk ${f.gamePk} — ${pitches.length} pitches extracted`)
    const data = computeEnrichedData(pitches, strikeZoneTop, strikeZoneBottom, plateAppearances)
    const plays: any[] = f.feed?.liveData?.plays?.allPlays ?? []
    let fpS = 0, fpT = 0
    for (const pa of plays) {
      if (pa.matchup?.pitcher?.id !== p.personId) continue
      const fp = (pa.playEvents ?? []).find((e: any) => e.isPitch)
      if (fp) { fpT++; if (fp.details?.isStrike) fpS++ }
    }
    data.firstPitchStrikeRate = fpT > 0 ? (fpS / fpT) * 100 : null
    return { ...p, pitchData: data }
  })

  return { batters: eb, pitchers: ep }
}