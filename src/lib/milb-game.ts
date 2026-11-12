// src/lib/milb-game.ts
//
// Data for the minor-league game page (/mlb/milb/[gamePk]): score, line score, box score and scoring plays for any game below MLB, from the MLB Stats API
// (schedule + boxscore + playByPlay, free, no auth). Nothing here is Statcast and nothing is estimated: a part the API does not return is null / [] and the page says so.
// Fields below were checked against a live Double-A game (gamePk 818360) on 2026-11-11. Cached 60 seconds so a game in progress keeps moving.
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { LEVEL_BY_SPORT_ID, type LevelKey } from '@/lib/levels'

type Stat = Record<string, string | number>
type RawTeam = { team?: { id: number; name: string; abbreviation?: string; sport?: { id?: number } }; score?: number; isWinner?: boolean }
type RawBox = {
  teams: Record<'away' | 'home', { batters: number[]; pitchers: number[]; players: Record<string, { person: { id: number; fullName: string }; position?: { abbreviation?: string }; battingOrder?: string; stats?: { batting?: Stat; pitching?: Stat }; seasonStats?: { batting?: Stat } }> }>
}

export type MilbSide = { id: number; name: string; abbr: string; score: number | null; winner: boolean }
export type MilbBatter = { id: number; name: string; pos: string; ab: number; r: number; h: number; rbi: number; bb: number; k: number }
export type MilbPitcher = { id: number; name: string; ip: string; h: number; r: number; er: number; bb: number; k: number; pitches: number | null; decision: 'W' | 'L' | 'S' | null }
export type MilbGame = {
  gamePk: number
  isMlb: boolean
  level: { key: LevelKey; label: string; name: string } | null
  status: string; final: boolean
  date: string                      // official date, YYYY-MM-DD
  venue: string | null
  away: MilbSide; home: MilbSide
  innings: { num: number; away: number | null; home: number | null }[]
  totals: { away: { r: number; h: number; e: number } | null; home: { r: number; h: number; e: number } | null }
  decisions: { winner: string | null; loser: string | null; save: string | null }
  batting: { away: MilbBatter[]; home: MilbBatter[] }
  pitching: { away: MilbPitcher[]; home: MilbPitcher[] }
  scoring: { inning: number; half: 'Top' | 'Bottom'; text: string; awayScore: number; homeScore: number }[]
}

const n = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v))

export async function getMilbGame(gamePk: number): Promise<MilbGame | null> {
  if (!Number.isInteger(gamePk) || gamePk <= 0) return null
  const [sched, box, plays] = await Promise.all([
    mlb<{ dates?: { games?: any[] }[] }>(`/schedule?gamePk=${gamePk}&hydrate=team,linescore,venue,decisions`, 60),
    mlb<RawBox>(`/game/${gamePk}/boxscore`, 60),
    mlb<{ allPlays?: any[]; scoringPlays?: number[] }>(`/game/${gamePk}/playByPlay`, 60),
  ])
  const g = sched?.dates?.[0]?.games?.[0]
  if (!g) { console.error('[getMilbGame] no schedule entry for gamePk', gamePk); return null }

  const side = (t: RawTeam | undefined): MilbSide => ({
    id: Number(t?.team?.id ?? 0), name: t?.team?.name ?? '', abbr: t?.team?.abbreviation ?? (t?.team?.name ?? '').split(' ').pop() ?? '',
    score: t?.score == null ? null : Number(t.score), winner: !!t?.isWinner,
  })
  const away = side(g.teams?.away), home = side(g.teams?.home)
  const sportId = Number(g.teams?.home?.team?.sport?.id ?? 0)
  const lvl = LEVEL_BY_SPORT_ID[sportId] ?? null

  const decisionOf = (d?: { fullName?: string }) => d?.fullName ?? null
  const ls = g.linescore
  const total = (s?: { runs?: number; hits?: number; errors?: number }) => (s ? { r: n(s.runs), h: n(s.hits), e: n(s.errors) } : null)

  const batters = (k: 'away' | 'home'): MilbBatter[] => {
    const t = box?.teams?.[k]
    if (!t) return []
    return t.batters.map(id => t.players[`ID${id}`]).filter(p => p?.stats?.batting && n(p.stats.batting.plateAppearances) + n(p.stats.batting.runs) > 0)
      .sort((a, b) => n(a.battingOrder) - n(b.battingOrder))
      .map(p => { const s = p.stats!.batting!; return { id: p.person.id, name: p.person.fullName, pos: p.position?.abbreviation ?? '', ab: n(s.atBats), r: n(s.runs), h: n(s.hits), rbi: n(s.rbi), bb: n(s.baseOnBalls), k: n(s.strikeOuts) } })
  }
  const dec = { W: g.decisions?.winner?.id, L: g.decisions?.loser?.id, S: g.decisions?.save?.id }
  const pitchers = (k: 'away' | 'home'): MilbPitcher[] => {
    const t = box?.teams?.[k]
    if (!t) return []
    return t.pitchers.map(id => t.players[`ID${id}`]).filter(p => p?.stats?.pitching).map(p => {
      const s = p.stats!.pitching!
      const decision = (['W', 'L', 'S'] as const).find(d => dec[d] === p.person.id) ?? null
      return { id: p.person.id, name: p.person.fullName, ip: String(s.inningsPitched ?? ''), h: n(s.hits), r: n(s.runs), er: n(s.earnedRuns), bb: n(s.baseOnBalls), k: n(s.strikeOuts), pitches: s.numberOfPitches == null ? null : n(s.numberOfPitches), decision }
    })
  }

  const all = plays?.allPlays ?? []
  const scoring = (plays?.scoringPlays ?? []).map(i => all[i]).filter(Boolean).map(p => ({
    inning: n(p.about?.inning), half: (p.about?.halfInning === 'top' ? 'Top' : 'Bottom') as 'Top' | 'Bottom', text: String(p.result?.description ?? ''), awayScore: n(p.result?.awayScore), homeScore: n(p.result?.homeScore),
  }))

  return {
    gamePk, isMlb: sportId === 1, level: lvl ? { key: lvl.key, label: lvl.label, name: lvl.name } : null,
    status: String(g.status?.detailedState ?? ''), final: g.status?.abstractGameState === 'Final',
    date: String(g.officialDate ?? g.gameDate?.slice(0, 10) ?? ''), venue: g.venue?.name ?? null, away, home,
    innings: (ls?.innings ?? []).map((i: any) => ({ num: n(i.num), away: i.away?.runs == null ? null : n(i.away.runs), home: i.home?.runs == null ? null : n(i.home.runs) })),
    totals: { away: total(ls?.teams?.away), home: total(ls?.teams?.home) },
    decisions: { winner: decisionOf(g.decisions?.winner), loser: decisionOf(g.decisions?.loser), save: decisionOf(g.decisions?.save) },
    batting: { away: batters('away'), home: batters('home') }, pitching: { away: pitchers('away'), home: pitchers('home') }, scoring,
  }
}
