// Data for the postgame Recap: linescore, decisions, every pitcher's line, each starter's pitch mix this game against his season,
// and the key plate appearances. Source: the MLB game feed (one cached request) plus the stored season arsenal.
import { getFeed, type FeedPlay } from '@/lib/game-tabs/common'
import { getPitcherMix } from '@/lib/game-cockpit'
import type { PitchMixRow } from '@/lib/game-cockpit'
import type { PostgameContext } from '@/components/postgame/report/types'

const N = (v: unknown) => Number(v ?? 0)
export type PitchLine = { id: number; name: string; side: 'away' | 'home'; role: 'SP' | 'RP'; tag: string; ip: string; h: number; r: number; er: number; bb: number; k: number; pit: number; strikes: number }
export type MixCompare = { id: number; name: string; side: 'away' | 'home'; game: { code: string; pct: number }[]; gamePitches: number; season: PitchMixRow[]; seasonPitches: number }
export type KeyPa = { inning: string; batter: string; pitcher: string; result: string; ev: number | null; scoring: boolean }
export type Recap = {
  status: string; venue: string; innings: { num: number; away: number | null; home: number | null }[]
  totals: { away: { r: number; h: number; e: number }; home: { r: number; h: number; e: number } }
  decisions: { w?: string; l?: string; s?: string } | null
  lines: PitchLine[]; mix: MixCompare[]; keyPas: KeyPa[]
}

export async function getRecap(ctx: PostgameContext): Promise<Recap | null> {
  const f = await getFeed(ctx.gamePk)
  if (!f?.liveData) return null
  const ls = f.liveData.linescore, box = f.liveData.boxscore?.teams
  const lines: PitchLine[] = []
  ;(['away', 'home'] as const).forEach(side => {
    const t = box?.[side]
    ;(t?.pitchers ?? []).forEach((id, idx) => {
      const p = t?.players?.[`ID${id}`]; const st = p?.stats?.pitching as Record<string, number | string> | undefined
      if (!st) return
      const d = f.liveData?.decisions
      const tag = d?.winner?.id === id ? 'W' : d?.loser?.id === id ? 'L' : d?.save?.id === id ? 'S' : ''
      lines.push({ id, name: p?.person?.fullName ?? '', side, role: idx === 0 ? 'SP' : 'RP', tag, ip: String(st.inningsPitched ?? '0.0'), h: N(st.hits), r: N(st.runs), er: N(st.earnedRuns), bb: N(st.baseOnBalls), k: N(st.strikeOuts), pit: N(st.numberOfPitches), strikes: N(st.strikes) })
    })
  })

  // Each starter's mix in this game, counted from the pitches in the play-by-play, against the stored season mix.
  const plays: FeedPlay[] = f.liveData.plays?.allPlays ?? []
  const starters = lines.filter(l => l.role === 'SP')
  const mix: MixCompare[] = await Promise.all(starters.map(async sp => {
    const counts = new Map<string, number>(); let total = 0
    for (const pl of plays) {
      if (pl.matchup?.pitcher?.id !== sp.id) continue
      for (const e of pl.playEvents ?? []) { const c = e.details?.type?.code; if (e.isPitch && c) { counts.set(c, (counts.get(c) ?? 0) + 1); total++ } }
    }
    const season = await getPitcherMix(sp.id).catch(() => ({ mix: [] as PitchMixRow[], mixPitches: 0 }))
    return { id: sp.id, name: sp.name, side: sp.side, game: [...counts.entries()].map(([code, n]) => ({ code, pct: (n / total) * 100 })).sort((a, b) => b.pct - a.pct), gamePitches: total, season: season.mix, seasonPitches: season.mixPitches }
  }))

  // Key plate appearances: MLB's own captivating index (how much the moment mattered), then the exit velocity on the ball in play.
  const keyPas: KeyPa[] = plays
    .filter(p => p.result?.event && p.about?.captivatingIndex != null)
    .sort((a, b) => (b.about?.captivatingIndex ?? 0) - (a.about?.captivatingIndex ?? 0))
    .slice(0, 6)
    .sort((a, b) => (a.about?.inning ?? 0) - (b.about?.inning ?? 0))
    .map(p => ({
      inning: `${p.about?.halfInning === 'top' ? 'Top' : 'Bottom'} ${p.about?.inning}`, batter: p.matchup?.batter?.fullName ?? '', pitcher: p.matchup?.pitcher?.fullName ?? '',
      result: p.result?.event ?? '', ev: (p.playEvents ?? []).map(e => e.hitData?.launchSpeed).filter((v): v is number => typeof v === 'number').pop() ?? null, scoring: !!p.about?.isScoringPlay,
    }))

  const d = f.liveData.decisions
  return {
    status: 'Final', venue: f.gameData?.venue?.name ?? '',
    innings: Array.from({ length: Math.max(9, ls?.innings?.length ?? 9) }, (_, k) => { const i = ls?.innings?.[k]; return { num: k + 1, away: i?.away?.runs ?? null, home: i?.home?.runs ?? null } }),
    totals: { away: { r: N(ls?.teams?.away?.runs), h: N(ls?.teams?.away?.hits), e: N(ls?.teams?.away?.errors) }, home: { r: N(ls?.teams?.home?.runs), h: N(ls?.teams?.home?.hits), e: N(ls?.teams?.home?.errors) } },
    decisions: d && (d.winner || d.loser || d.save) ? { w: d.winner?.fullName, l: d.loser?.fullName, s: d.save?.fullName } : null,
    lines, mix, keyPas,
  }
}
