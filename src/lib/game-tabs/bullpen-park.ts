// Data for the game page's Bullpen & park tab: each bullpen's pitches by series game (relief appearances from the boxscores), three leverage arms
// per side, the park index card and the game conditions (roof, weather, umpires from the game feed).
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { getBullpenRecent, type BullpenRow } from '@/lib/game-cockpit'
import { getPitcherZoneArsenal } from '@/lib/pitcher-arsenal'
import { fetchPitcherHands } from '@/lib/pitcher-hands'
import { getParkIndex, type ParkIndex } from '@/lib/park-index'
import { getFeed, type SeriesGame } from '@/lib/game-tabs/common'
import { sideXwoba, outsOf } from './pitchers'
import { PITCH_NAME } from '@/lib/lab/pitch-meta'
import type { CockpitCtx } from '@/components/game-cockpit/GameTabs'

type Splits = { stat: Record<string, string | number> }[]
type StatsResp = { stats?: { splits: Splits }[] }

export type BullpenCard = { teamId: number; abbr: string; name: string; dates: { date: string; label: string; played: boolean }[]; rows: BullpenRow[]; games: number; total: number }
export type Leverage = {
  id: number; name: string; abbr: string; hand: 'L' | 'R' | null
  line: { era: string; ip: string; k: number; sv: number; hld: number } | null
  mix: { code: string; pct: number; mph: number | null }[]
  xwLHB: { v: number; n: number } | null; xwRHB: { v: number; n: number } | null
  post: { outs: number; g: number; er: number; k: number } | null
}
export type Conditions = { roof: string | null; temp: string | null; wind: string | null; plate: string | null; crew: { pos: string; name: string }[]; domed: boolean }
export type BullpenParkData = { away: BullpenCard; home: BullpenCard; arms: { away: Leverage[]; home: Leverage[] }; park: ParkIndex | null; conditions: Conditions }

async function card(team: CockpitCtx['away'], ctx: CockpitCtx, series: SeriesGame[]): Promise<BullpenCard> {
  const r = await getBullpenRecent(team.id, [], ctx.gameDate, 3)
  const dates = r.dates.map(d => {
    const g = series.find(x => x.date === d)
    return { date: d, label: `${new Date(`${d}T12:00:00`).getDate()} ${new Date(`${d}T12:00:00`).toLocaleString('en-US', { month: 'short' })}${g?.gameNumber ? ` G${g.gameNumber}` : ''}`.toUpperCase(), played: !!g?.final }
  })
  return { teamId: team.id, abbr: team.abbr, name: team.name, dates, rows: r.rows, games: r.games, total: r.rows.reduce((n, x) => n + x.total, 0) }
}

async function leverage(row: BullpenRow, abbr: string, season: number): Promise<Leverage> {
  const [seasonR, postR, arsenal, hands] = await Promise.all([
    mlb<StatsResp>(`/people/${row.id}/stats?stats=season&group=pitching&season=${season}`),
    mlb<StatsResp>(`/people/${row.id}/stats?stats=gameLog&group=pitching&season=${season}&gameType=W,L,D,F`),
    getPitcherZoneArsenal(row.id).catch(() => ({})),
    fetchPitcherHands([row.id]).catch(() => new Map<number, 'L' | 'R'>()),
  ])
  const s = seasonR?.stats?.[0]?.splits?.[0]?.stat
  const ar = arsenal as Record<string, Parameters<typeof sideXwoba>[0]>
  const all = ar['all'] as unknown as { arsenal: Record<string, { usage_pct: number | null; avg_velo: number | null }> } | undefined
  const ps = postR?.stats?.[0]?.splits ?? []
  return {
    id: row.id, name: row.name, abbr, hand: hands.get(row.id) ?? null,
    line: s ? { era: String(s.era ?? ''), ip: String(s.inningsPitched ?? ''), k: Number(s.strikeOuts ?? 0), sv: Number(s.saves ?? 0), hld: Number(s.holds ?? 0) } : null,
    mix: all ? Object.entries(all.arsenal).map(([code, p]) => ({ code, pct: Number(p.usage_pct ?? 0), mph: p.avg_velo == null ? null : Number(p.avg_velo) })).filter(m => m.pct >= 5).sort((a, b) => b.pct - a.pct) : [],
    xwLHB: sideXwoba(ar['vs_lhb']), xwRHB: sideXwoba(ar['vs_rhb']),
    post: ps.length ? { outs: ps.reduce((a, x) => a + outsOf(x.stat.inningsPitched), 0), g: ps.length, er: ps.reduce((a, x) => a + Number(x.stat.earnedRuns ?? 0), 0), k: ps.reduce((a, x) => a + Number(x.stat.strikeOuts ?? 0), 0) } : null,
  }
}

export async function getBullpenParkData(ctx: CockpitCtx, series: SeriesGame[]): Promise<BullpenParkData> {
  const [away, home] = await Promise.all([card(ctx.away, ctx, series), card(ctx.home, ctx, series)])
  // Leverage arms rule (to confirm with George): the three relievers with the most relief innings in the window, then season saves + holds.
  const pick = async (c: BullpenCard) => {
    const ranked = [...c.rows].sort((a, b) => b.outs - a.outs || b.total - a.total).slice(0, 3)
    const cards = await Promise.all(ranked.map(r => leverage(r, c.abbr, ctx.season)))
    return cards.sort((a, b) => (b.line ? b.line.sv + b.line.hld : 0) - (a.line ? a.line.sv + a.line.hld : 0) || 0)
  }
  const [armsAway, armsHome, park, feed] = await Promise.all([pick(away), pick(home), getParkIndex(ctx.venueId), getFeed(ctx.gamePk)])
  const roof = feed?.gameData?.venue?.fieldInfo?.roofType ?? null
  const offs = feed?.liveData?.boxscore?.officials ?? []
  const w = feed?.gameData?.weather
  const domed = roof != null && /dome|retractable/i.test(roof)
  const label: Record<string, string> = { 'First Base': '1B', 'Second Base': '2B', 'Third Base': '3B', 'Left Field': 'LF', 'Right Field': 'RF' }
  return {
    away, home, arms: { away: armsAway, home: armsHome }, park,
    conditions: {
      roof, temp: w?.temp ?? null, wind: w?.wind ?? null, domed,
      plate: offs.find(o => o.officialType === 'Home Plate')?.official?.fullName ?? null,
      crew: offs.filter(o => o.officialType !== 'Home Plate' && o.official?.fullName).map(o => ({ pos: label[o.officialType ?? ''] ?? (o.officialType ?? ''), name: (o.official?.fullName ?? '').split(' ').slice(-1)[0] })),
    },
  }
}
void PITCH_NAME
