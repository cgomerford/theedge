// Data for the game page's Batters tab: both lineups against the opposing starter, xwOBA by hand and by the starter's top pitches,
// postseason lines, lineup changes since the last series game, and (gated) hot-zone grids.
// Sources: lineups (lib/lineups via getTeamLineup), batter_hot_zones, batter_pitch_type_splits, MLB game logs and boxscores.
import { mlb } from '@/lib/mlb-cockpit.server-fetch-allowed'
import { getBatterHotZones, type BatterHotZones } from '@/lib/hot-zones'
import { getStarterBlock, getTeamLineup, type TeamLineup, type StarterBlock } from '@/lib/game-cockpit'
import { getBox, type SeriesGame } from '@/lib/game-tabs/common'
import type { Cell } from '@/components/game-tabs/ZoneMaps'
import type { CockpitCtx } from '@/components/game-cockpit/GameTabs'

type Splits = { date?: string; gameType?: string; stat: Record<string, string | number> }[]
const sumN = (s: Splits, k: string) => s.reduce((a, x) => a + Number(x.stat[k] ?? 0), 0)

export type BatterRow = {
  id: number; name: string; pos: string; hand: 'L' | 'R' | 'S' | null; order: number
  vSame: { v: number | null; n: number } | null; vOther: { v: number | null; n: number } | null
  pitches: { code: string; xwoba: number | null; pa: number; whiff: number | null }[]
  post: { h: number; ab: number; hr: number; bb: number; k: number; wsH: number; wsPa: number } | null
  zones?: Record<string, Cell> | null      // gated: all 13 zones with AVG, SLG and xwOBA
}
export type TeamBatters = { teamId: number; teamName: string; abbr: string; source: TeamLineup['source']; vs: StarterBlock; rows: BatterRow[]; pitchCodes: string[]; through: string | null; lineupIds: number[] }
export type BattersData = { away: TeamBatters; home: TeamBatters; chips: { confirmed: boolean; changes: string[] } }

function splitXwoba(z: BatterHotZones | undefined): { v: number | null; n: number } | null {
  if (!z) return null
  let w = 0, k = 0
  for (const c of Object.values(z.zones)) { const wt = Number(c.bbe ?? c.ab ?? 0); if (c.xwoba != null && wt > 0) { w += Number(c.xwoba) * wt; k += wt } }
  return { v: k > 0 ? w / k : null, n: Number(z.total_pa ?? 0) }
}

async function lineupChange(teamId: number, abbr: string, current: number[], hand: 'L' | 'R' | null, prev: SeriesGame | undefined, prevNo: number | null): Promise<string | null> {
  if (!prev || !current.length) return null
  const box = await getBox(prev.gamePk)
  const t = [box?.teams?.away, box?.teams?.home].find(x => x?.team?.id === teamId)
  const before = t?.battingOrder ?? []
  if (!before.length) return null
  const name = (id: number) => (t?.players?.[`ID${id}`]?.person?.fullName ?? '').split(' ').slice(-1)[0]
  const ins = current.filter(i => !before.includes(i)).map(name), outs = before.filter(i => !current.includes(i)).map(name)
  if (!ins.length && !outs.length) return `${abbr}${hand ? ` v ${hand}HP` : ''}: the same nine as G${prevNo ?? ''}`
  const list = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]
  return `${abbr}${hand ? ` v ${hand}HP` : ''}: ${list(ins)} in, ${list(outs)} out (vs G${prevNo ?? ''})`
}

export async function getBattersData(ctx: CockpitCtx, series: SeriesGame[], gated: boolean): Promise<BattersData> {
  const [spAway, spHome] = await Promise.all([
    getStarterBlock(ctx.away.pitcherId, ctx.away.pitcherName, ctx.season),
    getStarterBlock(ctx.home.pitcherId, ctx.home.pitcherName, ctx.season),
  ])
  const codes = (b: StarterBlock) => b.mix.slice(0, 3).map(m => m.code)
  const prevGames = series.filter(g => g.final && g.gamePk !== ctx.gamePk && g.date < ctx.gameDate)
  const prev = prevGames[prevGames.length - 1]
  const prevNo = prev ? series.indexOf(prev) + 1 : null

  const build = async (side: 'away' | 'home'): Promise<TeamBatters> => {
    const team = ctx[side], opp = side === 'away' ? spHome : spAway
    const lu = await getTeamLineup(team.id, ctx.gameDate, ctx.gamePk, { id: opp.id, hand: opp.hand, pitchCodes: codes(opp) })
    const handKey = opp.hand === 'L' ? 'vs_lhp' : 'vs_rhp', otherKey = opp.hand === 'L' ? 'vs_rhp' : 'vs_lhp'
    const rows = await Promise.all(lu.rows.map(async (r): Promise<BatterRow> => {
      const [zonesAll, post] = await Promise.all([
        getBatterHotZones(r.id).catch(() => ({} as Record<string, BatterHotZones>)),
        mlb<{ stats?: { splits: Splits }[] }>(`/people/${r.id}/stats?stats=gameLog&group=hitting&season=${ctx.season}&gameType=W,L,D,F`),
      ])
      const zs = zonesAll as Record<string, BatterHotZones>
      const ps = post?.stats?.[0]?.splits ?? []
      const ws = ps.filter(x => x.gameType === 'W')
      const same = zs[handKey]
      return {
        id: r.id, name: r.name, pos: r.pos, hand: r.hand, order: r.order,
        vSame: splitXwoba(same), vOther: splitXwoba(zs[otherKey]),
        pitches: r.vsPitch.map(v => ({ code: v.code, xwoba: v.xwoba, pa: v.pa, whiff: v.whiff ?? null })),
        post: ps.length ? { h: sumN(ps, 'hits'), ab: sumN(ps, 'atBats'), hr: sumN(ps, 'homeRuns'), bb: sumN(ps, 'baseOnBalls'), k: sumN(ps, 'strikeOuts'), wsH: sumN(ws, 'hits'), wsPa: sumN(ws, 'plateAppearances') } : null,
        zones: gated ? (same ? Object.fromEntries(Object.entries(same.zones).map(([z, c]) => [z, { n: Number(c.ab ?? 0), ba: c.ba ?? null, slg: c.slg ?? null, xwoba: c.xwoba ?? null } as Cell])) : null) : undefined,
      }
    }))
    return { teamId: team.id, teamName: team.name, abbr: team.abbr, source: lu.source, vs: opp, rows, pitchCodes: codes(opp), through: lu.splitsThrough, lineupIds: lu.rows.map(r => r.id) }
  }
  const [away, home] = await Promise.all([build('away'), build('home')])
  const changes = (await Promise.all([
    lineupChange(away.teamId, away.abbr, away.lineupIds, spHome.hand, prev, prevNo),
    lineupChange(home.teamId, home.abbr, home.lineupIds, spAway.hand, prev, prevNo),
  ])).filter((x): x is string => !!x)
  return { away, home, chips: { confirmed: away.source === 'confirmed' && home.source === 'confirmed', changes } }
}
