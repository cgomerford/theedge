/* eslint-disable @typescript-eslint/no-explicit-any -- the scout bundle is loosely typed (any[]) by design */
// src/components/admin/story/buildStory.ts
//
// Pure: (GameWithReport, StoryExtras, slateDate) → { game: StoryGame, segments }.
// Normalizes the loosely typed scout bundle, applies the skip rules (empty
// state over fabricated data) and sets the density durations.

import { defenseFooter, fmtDateRange, fmtShortDate, TTO_ROWS } from './copy'
import { durationFor, buildFracFor } from './durations'
import { hookNote, noteFit, teamNickname } from './hook'
import { pitchColor } from './pitchColors'
import { shortName } from './names'
import {
  absRowCount, arsenalRowCount, availRows, clubRowCount, lateRowCount, runCardList, runRowCount, spRowCount,
} from './rows'
import { validTto } from './ttoValidate'
import { DEFAULT_ON, SEGMENT_LIST } from './types'
import type { PenTeam } from './bullpenModel'
import { seasonLabel } from './season'
import { formTitle, fromSentence, isFormMetric, selectFormPlayers } from './selectFormPlayers'
import type {
  BullpenArm, BullpenTeam, Fielder, FormPick, FormRow, LineupRow, PitchProfile, Segment, SegmentId, SeasonRow, ScoutExtras, Side, SpTto,
  StoryBullpen, StoryDefense, StoryExtras, StoryGame, StoryInputGame, StorySp, StoryTeam, StreakCard,
} from './types'

const POSITION_ORDER = ['CF', 'LF', 'RF', 'SS', '2B', '3B', '1B', 'C'] as const
const num = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

export type BuildOpts = {
  /** picker order (canonical when omitted); hook and close are always pinned first / last */
  order?: SegmentId[]
  /** picker selection (defaults to DEFAULT_ON) */
  on?: SegmentId[]
  /** desk cards from the loadScoutExtras server action; null until loaded */
  scout?: ScoutExtras | null
  /** per-reliever grid from the loadBullpenGrid server action */
  bullpenGrid?: { away: PenTeam | null; home: PenTeam | null } | null
}

export function buildStory(
  g: StoryInputGame, extras: StoryExtras, slateDate: string, opts: BuildOpts = {},
): { game: StoryGame; segments: Segment[]; available: SegmentId[] } {
  const parts = (g.matchup ?? '').split(/@|vs/i).map(s => s.trim())
  const mk = (abbr: string | undefined, name: string | undefined, color: string | undefined, fallback: string): StoryTeam => {
    const a = abbr || fallback
    const n = name || a
    return { abbr: a, name: n, nickname: teamNickname(n), color: color || '#FF5722' }
  }
  const away = mk(g.awayAbbr, g.awayName, g.awayColor, parts[0] || 'AWAY')
  const home = mk(g.homeAbbr, g.homeName, g.homeColor ?? '#1A1A1A', parts[1] || 'HOME')
  const team = (s: Side) => (s === 'away' ? away : home)
  const pick = <T,>(s: Side, a: T, h: T) => (s === 'away' ? a : h)

  // ── season label: only dates already in the rows ─────────────────────
  const formRows = [...(g.awayHotStreaks ?? []), ...(g.homeHotStreaks ?? [])]
  const sLabel = seasonLabel([...formRows, ...(g.awayLiteralBatters ?? []), ...(g.homeLiteralBatters ?? [])], slateDate)
  const spLabel = sLabel.includes('thru') ? sLabel : '2026 reg. season'

  // ── starting pitchers ────────────────────────────────────────────────
  const sp = (s: Side): StorySp => {
    const name = pick(s, g.awayPitcherName, g.homePitcherName)
    const st = pick(s, g.awayPitcherStats, g.homePitcherStats)
    const real = name && name !== 'TBD' ? name : null
    const stats = st ? {
      era: num(st.era), fip: num(st.fip), whip: num(st.whip),
      k9: num(st.k_per_9), bb9: num(st.bb_per_9), l3Era: num(st.l3_era), kbb9: null as number | null,
    } : null
    if (stats && stats.k9 != null && stats.bb9 != null) stats.kbb9 = Math.round((stats.k9 - stats.bb9) * 10) / 10
    const hasAny = stats && Object.values(stats).some(v => v != null)
    return {
      id: pick(s, g.awayPitcherId, g.homePitcherId) ?? null,
      name: real ?? 'TBD', short: real ? shortName(real) : 'TBD',
      stats: hasAny ? stats : null,
    }
  }
  const spAway = sp('away'), spHome = sp('home')

  // ── bullpen: 3 dates strictly before the slate date ──────────────────
  const bullTeam = (s: Side): { team: BullpenTeam | null; dates: string[] } => {
    const wl = pick(s, g.awayWorkload, g.homeWorkload)
    const allDates: string[] = Array.isArray(wl?.dates) ? wl.dates : []
    const dates = allDates.filter(d => d < slateDate).slice(-3)
    if (!wl || dates.length === 0 || !Array.isArray(wl.pitchers)) return { team: null, dates }
    const spId = pick(s, spAway.id, spHome.id)
    const rel = wl.pitchers.filter((p: any) => {
      if (p.__isStarter === true) return false
      if (spId != null && p.playerId === spId) return false
      const maxDay = Math.max(0, ...Object.values(p.byDate ?? {}).map(Number))
      return maxDay < 60
    }).map((p: any) => ({
      id: Number(p.playerId), name: String(p.playerName ?? ''), short: shortName(String(p.playerName ?? '')),
      pitches: dates.reduce((sum, d) => sum + (Number(p.byDate?.[d]) || 0), 0),
    }))
    const worked: BullpenArm[] = rel.filter((r: BullpenArm) => r.pitches > 0).sort((a: BullpenArm, b: BullpenArm) => b.pitches - a.pitches)
    if (worked.length === 0) return { team: null, dates }
    const rested: string[] = rel.filter((r: BullpenArm) => r.pitches === 0).map((r: BullpenArm) => r.short)
    return {
      dates,
      team: {
        abbr: team(s).abbr, color: team(s).color, arms: worked.slice(0, 5),
        total: worked.reduce((sum: number, r: BullpenArm) => sum + r.pitches, 0),
        rested: rested.slice(0, 4), restedMore: Math.max(0, rested.length - 4),
      },
    }
  }
  const ba = bullTeam('away'), bh = bullTeam('home')
  const bullpen: StoryBullpen | null = ba.team || bh.team
    ? { dateRange: fmtDateRange((ba.dates.length >= bh.dates.length ? ba.dates : bh.dates)), away: ba.team, home: bh.team }
    : null

  // ── defense: alignment from the lineup, numbers are OAA only ─────────
  const defense = (s: Side): StoryDefense | null => {
    const card = opts.scout ? pick(s, opts.scout.defdesk.away, opts.scout.defdesk.home) : null
    if (!card) return null                       // no OAA yet / none published → skip, never substitute another metric
    const raw: any[] = pick(s, g.awayFieldingAlignment, g.homeFieldingAlignment) ?? []
    const by = new Map<string, any>(raw.filter(f => f?.playerName).map(f => [String(f.position), f]))
    if (by.size === 0) return null
    const fielders: Fielder[] = POSITION_ORDER.map(pos => {
      const f = by.get(pos)
      return f
        ? { position: pos, playerId: f.playerId ?? null, name: String(f.playerName), short: shortName(String(f.playerName)), oaa: f.playerId != null ? (card.oaaById[f.playerId] ?? null) : null }
        : { position: pos, playerId: null, name: '', short: '', oaa: null }
    })
    if (fielders.every(f => f.oaa == null) && card.oaa == null) return null
    return {
      team: team(s), fielders, teamOaa: card.oaa, teamRank: card.rank, teamOf: card.of,
      footer: defenseFooter(extras.lineupsConfirmed),
    }
  }
  const defAway = defense('away'), defHome = defense('home')

  // ── streaks ──────────────────────────────────────────────────────────
  const streakPool: StreakCard[] = []
  const addStreaks = (s: Side) => {
    const t = team(s)
    const season = new Map<number, any>((pick(s, g.awayLineupBatters, g.homeLineupBatters) ?? []).map((b: any) => [b.player_id, b]))
    const seasonRow = (id: number): SeasonRow | null => {
      const b = season.get(id)
      if (!b) return null
      const r = { avg: num(b.season_avg), slg: num(b.season_slg), ops: num(b.season_ops), rbi: num(b.season_rbi) }
      return Object.values(r).some(v => v != null) ? r : null
    }
    for (const b of (pick(s, g.awayLiteralBatters, g.homeLiteralBatters) ?? []) as any[]) {
      const base = { playerId: b.player_id, name: b.player_name, short: shortName(b.player_name), position: b.position ?? '', team: t, season: seasonRow(b.player_id) }
      if (b.on_base_streak >= 6) streakPool.push({ ...base, kind: 'on_base', n: b.on_base_streak, label: `On base in ${b.on_base_streak} straight` })
      else if (b.hit_streak >= 4) streakPool.push({ ...base, kind: 'hit', n: b.hit_streak, label: `Hit in ${b.hit_streak} straight` })
    }
    const p: any = pick(s, g.awayPitcherTrend, g.homePitcherTrend)
    if (p && p.current_scoreless_innings >= 6) {
      streakPool.push({
        playerId: p.player_id, name: p.player_name, short: shortName(p.player_name), position: 'SP', team: t, season: null,
        kind: 'scoreless', n: p.current_scoreless_innings, label: `${Number(p.current_scoreless_innings).toFixed(1)} scoreless innings`,
      })
    }
  }
  addStreaks('away'); addStreaks('home')
  const streaks = [...streakPool].sort((a, b) => b.n - a.n).slice(0, 3)

  // ── form ─────────────────────────────────────────────────────────────
  const toPick = (r: FormRow, t: StoryTeam): FormPick | null => {
    if (!isFormMetric(r.metric)) return null
    return {
      playerId: r.player_id, name: r.player_name, short: shortName(r.player_name), team: t,
      signal: r.signal, quality: r.signal_quality === 'trending' ? 'trending' : 'validated',
      metric: r.metric, metricLabel: `Rolling 15-game ${r.metric.toUpperCase()}`,
      current: r.current_value, extreme: r.extreme_value, games: r.games ?? null,
      trend: (r.recentGameLog ?? []).slice(-8), sentence: fromSentence(r),
    }
  }
  const sideForm = (s: Side) => {
    const rows = ((pick(s, g.awayHotStreaks, g.homeHotStreaks) ?? []) as FormRow[]).filter((r: any) => r.player_type !== 'pitcher')
    const sel = selectFormPlayers(rows)
    return [sel.heating, sel.cooling].filter((x): x is FormRow => !!x).map(r => toPick(r, team(s))).filter((x): x is FormPick => !!x)
  }
  const allPicks = [...sideForm('away'), ...sideForm('home')]
  const form = [...allPicks.filter(p => p.signal === 'heating'), ...allPicks.filter(p => p.signal === 'cooling')].slice(0, 4)

  // ── more SP stats: wOBA allowed by time through the order ────────────
  const ttoOf = (t: any, i: 1 | 2 | 3) => ({ v: num(t?.[`tto${i}_woba`]), pa: num(t?.[`tto${i}_pa`]) })
  const tto: SpTto[] = ([1, 2, 3] as const).map((i, k) => {
    const a = ttoOf(g.awayPitcherTTO, i), h = ttoOf(g.homePitcherTTO, i)
    return { label: TTO_ROWS[k], away: a.v, home: h.v, awayAvg: num(g.awayPitcherTTO?.[`tto${i}_avg`]), homeAvg: num(g.homePitcherTTO?.[`tto${i}_avg`]), awayPa: a.pa, homePa: h.pa }
  }).filter(r => r.away != null || r.home != null)

  // ── arsenal: the pitch table + where each pitch lands (pitcher_zone_arsenal, zones 1–9) ──
  const profiles = (s: Side): PitchProfile[] | null => {
    const list = opts.scout?.arsenal[s]
    if (!list) return null
    const zoneMap = (pick(s, g.awayPitcherArsenalZones, g.homePitcherArsenalZones) as any)?.all?.arsenal ?? {}
    return list.map(p => {
      const z = zoneMap[p.code]?.zones
      const arr = z ? Array.from({ length: 9 }, (_, i) => num(z[String(i + 1)]?.usage_pct) ?? 0) : null
      return { ...p, color: pitchColor(p.code), zones: arr && arr.some(v => v > 0) ? arr : null }
    })
  }
  const arsenal = { away: profiles('away'), home: profiles('home') }

  const ttoOk = { away: validTto(tto.map(r => r.awayPa)), home: validTto(tto.map(r => r.homePa)) }

  // ── lineup cards ─────────────────────────────────────────────────────
  const lineupOf = (s: Side): LineupRow[] =>
    ((pick(s, g.awayLineupBatters, g.homeLineupBatters) ?? []) as any[])
      .filter(b => b?.batting_order >= 1)
      .sort((a, b) => a.batting_order - b.batting_order).slice(0, 9)
      .map(b => ({ order: b.batting_order, id: b.player_id, name: b.player_name, short: shortName(b.player_name), pos: b.position ?? '', avg: num(b.season_avg), ops: num(b.season_ops), rbi: num(b.season_rbi) }))
  const lineups = { away: lineupOf('away'), home: lineupOf('home') }

  const game: StoryGame = {
    gamePk: g.game_pk, slateDate, dateLabel: fmtShortDate(slateDate),
    away, home, venue: extras.venueName, firstPitch: extras.firstPitch, slug: extras.slug,
    seasonLabel: sLabel, spLabel, lineupsConfirmed: extras.lineupsConfirmed,
    sp: { away: spAway, home: spHome }, bullpen,
    defense: { away: defAway, home: defHome },
    streakPool, streaks, form, formTitle: formTitle(form),
    hook: { text: '', rule: 'd' },
    series: extras.series ?? null, seriesState: opts.scout?.series ?? null,
    tto, ttoOk, arsenal, lineups, scout: opts.scout ?? null, penGrid: opts.bullpenGrid ?? null,
  }
  game.hook = hookNote({ ...game, teamIds: extras.ids ? { away: extras.ids.awayTeamId, home: extras.ids.homeTeamId } : null })

  // ── segments: availability, picker order/selection, density durations ──
  const sc = opts.scout
  const pg = opts.bullpenGrid
  const has: Record<SegmentId, boolean> = {
    hook: true, 'part-hook': false,
    sp: !!(spAway.stats || spHome.stats),
    'sp-arsenal': !!(arsenal.away || arsenal.home),
    'sp-tto': ttoOk.away || ttoOk.home,
    'lineup-away': lineups.away.length > 0,
    'lineup-home': lineups.home.length > 0,
    'bullpen-avail': !!(pg && (pg.away || pg.home)),
    late: !!(sc && (sc.late.away || sc.late.home)),
    'run-game': !!(sc && runCardList({ scout: sc } as StoryGame).length),
    abs: !!(sc && (sc.abs.away || sc.abs.home)),
    'club-status': !!(sc && (sc.club.away || sc.club.home)),
    'defense-away': !!defAway,
    'defense-home': !!defHome,
    streaks: streaks.length > 0,
    form: form.length > 0,
    close: true,
  }
  const available = (Object.keys(has) as SegmentId[]).filter(id => has[id])
  const canonical = SEGMENT_LIST.map(x => x.id)
  const middle = (opts.order ?? canonical).filter(id => id !== 'hook' && id !== 'close' && id !== 'part-hook' && canonical.includes(id))
  for (const id of canonical) if (id !== 'hook' && id !== 'close' && !middle.includes(id)) middle.push(id)
  const orderFull: SegmentId[] = ['hook', ...middle, 'close']
  const onSet = new Set<SegmentId>([...(opts.on ?? DEFAULT_ON), 'hook', 'close'])
  const rows: Partial<Record<SegmentId, number>> = {
    sp: spRowCount(game), 'sp-arsenal': arsenalRowCount(game), 'sp-tto': tto.length,
    'lineup-away': lineups.away.length, 'lineup-home': lineups.home.length,
    'bullpen-avail': availRows(game), late: lateRowCount(game),
    'run-game': runRowCount(game), abs: absRowCount(game), 'club-status': clubRowCount(game),
    'defense-away': defAway ? defAway.fielders.filter(f => f.name).length : 0,
    'defense-home': defHome ? defHome.fielders.filter(f => f.name).length : 0,
    streaks: streaks.length, form: form.length,
  }
  const extraFor = (id: SegmentId) => (id === 'hook' && noteFit(game.hook.text).lines >= 3 ? 0.5 : 0)
  const segments: Segment[] = orderFull
    .filter(id => has[id] && onSet.has(id))
    .map(id => ({ id, duration: durationFor(id, rows[id] ?? 0, extraFor(id)), buildFrac: buildFracFor(id) }))

  return { game, segments, available }
}
