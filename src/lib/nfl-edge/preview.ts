// src/lib/nfl-edge/preview.ts
//
// Preview-only derivations that sit on top of the loaders: the team snapshot table, "key players" with a
// plain-English matchup chip, and recent form / last meeting. Pure functions over data already fetched
// (plus one cached schedule read); no new tables.

import type { NflGame } from './games'
import { getSeasonGames } from './games'
import { column, rankOf, type LeagueRates, type Rates } from './form'
import type { PlayerCard } from './players'
import { ordinal } from '@/lib/ordinal'

export type SnapRow = {
  label: string
  home: number | null; away: number | null
  homeDisplay: string; awayDisplay: string
  higherBetter: boolean
  homeRank: number | null; awayRank: number | null
}

const sgn = (v: number) => (v >= 0 ? '+' : '')

/** Side-by-side team snapshot. Values are the same blended season-to-date rates the Edge read uses. */
export function buildSnapshot(lr: LeagueRates, homeId: string, awayId: string, pf: { home: [number, number]; away: [number, number] }): SnapRow[] {
  const h = lr.get(homeId), a = lr.get(awayId)
  if (!h || !a) return []
  const row = (label: string, pick: (r: Rates) => number | null, fmt: (v: number) => string, higherBetter = true): SnapRow => {
    const all = column(lr, pick)
    const hv = pick(h), av = pick(a)
    return {
      label, home: hv, away: av, higherBetter,
      homeDisplay: hv == null ? '—' : fmt(hv), awayDisplay: av == null ? '—' : fmt(av),
      homeRank: rankOf(hv, all, higherBetter), awayRank: rankOf(av, all, higherBetter),
    }
  }
  const per = (pts: [number, number]) => (pts[1] > 0 ? pts[0] / pts[1] : null)
  return [
    { label: 'Points for / game', home: per(pf.home), away: per(pf.away), homeDisplay: per(pf.home) == null ? '—' : per(pf.home)!.toFixed(1), awayDisplay: per(pf.away) == null ? '—' : per(pf.away)!.toFixed(1), higherBetter: true, homeRank: null, awayRank: null },
    row('Pass yards / attempt', r => r.passYpaO, v => v.toFixed(1)),
    row('Rush yards / carry', r => r.rushYpcO, v => v.toFixed(1)),
    row('Pass yards / att allowed', r => r.passYpaD, v => v.toFixed(1), false),
    row('Rush yards / carry allowed', r => r.rushYpcD, v => v.toFixed(1), false),
    row('Turnover margin / game', r => (r.gamesEff > 0 ? (r.takeaways - r.giveaways) / r.gamesEff : null), v => `${sgn(v)}${v.toFixed(1)}`),
    row('EPA / play (offense)', r => r.offEpa, v => `${sgn(v)}${v.toFixed(2)}`),
    row('EPA / play allowed', r => r.defEpa, v => `${sgn(v)}${v.toFixed(2)}`, false),
  ]
}

export type Bar = { label: string; pct: number; display: string }
export type KeyPlayer = {
  id: string; name: string; pos: string; team: string; headshot: string | null
  headline: string
  chip: string
  tone: 'good' | 'bad' | 'plain'
  bars: Bar[]        // one mini chart on the card
  detail: Bar[]      // the fuller matchup bars in the modal
  sample: string
}

const clamp = (v: number) => Math.max(3, Math.min(100, v))

/** Top three skill players per side by usage, each with a plain-English read of the opposing unit. */
export function buildKeyPlayers(cards: PlayerCard[], oppId: string, oppLabel: string, lr: LeagueRates): KeyPlayer[] {
  const oppPassRank = rankOf(lr.get(oppId)?.passEpaD ?? null, column(lr, r => r.passEpaD), false)
  const oppRushRank = rankOf(lr.get(oppId)?.rushEpaD ?? null, column(lr, r => r.rushEpaD), false)
  const of = column(lr, r => r.passEpaD).length || 32
  const usage = (c: PlayerCard) => {
    const s = c.seasonLine
    if (!s || s.games === 0) return 0
    return (s.targets + s.carries) / s.games
  }
  const ranked = cards.filter(c => c.slot !== 'QB' && c.seasonLine && usage(c) > 0).sort((a, b) => usage(b) - usage(a)).slice(0, 3)
  return ranked.map((c): KeyPlayer => {
    const s = c.seasonLine!
    const isRb = c.pos === 'RB' || c.pos === 'FB'
    const rank = isRb ? oppRushRank : oppPassRank
    const unit = isRb ? 'rush defense' : 'pass defense'
    const gm = Math.max(s.games, 1)
    let chip = `Faces ${oppLabel}'s ${unit}`
    let tone: KeyPlayer['tone'] = 'plain'
    if (rank != null) {
      // rank 1 = best defense. Bottom third = the defense is the soft spot; top third = the tough one.
      if (rank > of * 0.66) { chip = `Faces a bottom-third ${unit} (${ordinal(rank)} of ${of} in EPA allowed)`; tone = 'good' }
      else if (rank <= of * 0.34) { chip = `Faces a top-third ${unit} (${ordinal(rank)} of ${of} in EPA allowed)`; tone = 'bad' }
      else chip = `Faces a middle-of-the-pack ${unit} (${ordinal(rank)} of ${of})`
    }
    const perGame = isRb ? s.rushYds / gm : s.recYds / gm
    const usageBar = isRb ? s.carries / gm : s.targets / gm
    const bars: Bar[] = [
      { label: isRb ? 'Carries / game' : 'Targets / game', pct: clamp((usageBar / (isRb ? 25 : 12)) * 100), display: usageBar.toFixed(1) },
      { label: `Opp. ${unit} (longer = softer)`, pct: rank == null ? 0 : clamp(((rank - 1) / Math.max(of - 1, 1)) * 100), display: rank == null ? '—' : `${ordinal(rank)} of ${of}` },
    ]
    const l3 = c.last3
    const l3Yds = l3.length ? l3.reduce((t, g) => t + (isRb ? g.rushYds : g.recYds), 0) / l3.length : null
    const detail: Bar[] = [
      ...bars,
      { label: `${isRb ? 'Rush' : 'Receiving'} yards / game (season)`, pct: clamp((perGame / (isRb ? 100 : 90)) * 100), display: perGame.toFixed(1) },
      ...(l3Yds != null ? [{ label: `${isRb ? 'Rush' : 'Receiving'} yards / game (last ${l3.length})`, pct: clamp((l3Yds / (isRb ? 100 : 90)) * 100), display: l3Yds.toFixed(1) }] : []),
      ...(s.tgtShare != null && !isRb ? [{ label: 'Target share', pct: clamp((s.tgtShare / 0.35) * 100), display: `${(s.tgtShare * 100).toFixed(0)}%` }] : []),
    ]
    return {
      id: c.id, name: c.name, pos: c.pos, team: c.team, headshot: c.headshot,
      headline: isRb ? `${s.carries} carries · ${s.rushYds} yds` : `${s.rec} rec · ${s.recYds} yds · ${s.targets} tgts`,
      chip, tone, bars, detail, sample: c.seasonLabel ?? '',
    }
  })
}

export type Meeting = { game: NflGame; winnerId: string | null }

/** Most recent completed meeting between the two clubs (this season and last), and each club's last two results. */
export async function getRecentForm(game: NflGame): Promise<{ lastMeeting: Meeting | null; homeForm: NflGame[]; awayForm: NflGame[] }> {
  const [cur, prev] = await Promise.all([getSeasonGames(game.season), getSeasonGames(game.season - 1)])
  const done = [...prev, ...cur].filter(g => g.homeScore != null && g.awayScore != null && g.kickoff && game.kickoff && g.kickoff < game.kickoff)
  const pair = done.filter(g => (g.homeId === game.homeId && g.awayId === game.awayId) || (g.homeId === game.awayId && g.awayId === game.homeId))
  const lm = pair.sort((a, b) => (b.kickoff ?? '').localeCompare(a.kickoff ?? ''))[0] ?? null
  const last2 = (id: string) => done.filter(g => g.homeId === id || g.awayId === id).sort((a, b) => (b.kickoff ?? '').localeCompare(a.kickoff ?? '')).slice(0, 2)
  return {
    lastMeeting: lm ? { game: lm, winnerId: lm.homeScore! === lm.awayScore! ? null : lm.homeScore! > lm.awayScore! ? lm.homeId : lm.awayId } : null,
    homeForm: last2(game.homeId), awayForm: last2(game.awayId),
  }
}
