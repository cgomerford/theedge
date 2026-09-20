// src/components/scout/LineupVsSpSection.tsx
//
// §10 Lineup vs SP deep — each LINEUP against the opposing starter, three tabs:
//   Zone clash        — one card per hitter: a 3×3 map of where his damage zones meet the
//                       starter's usage, blue where the hitter has the edge, orange where
//                       the pitcher does, plus his best and worst zone. A toggle re-colours
//                       every map by the hitter's own AVG / SLG / xwOBA / wOBA / exit
//                       velocity / hard-hit / pitches seen. Every card links to the
//                       hitter's Batting Lab page.
//   Swing & miss      — swing% / whiff% / chase% by pitch family (fastball, breaking,
//                       offspeed) next to how much of the starter's arsenal each family is,
//                       and what those add up to weighted by tonight's mix
//   Spray lean        — ground-ball / line-drive / fly-ball share and pull rate against the
//                       starter's hand
// Gates: a hitter's zone map needs 150+ pitches on the split, a coloured cell 12+, a
// whiff/chase rate 40+ swings, a spray line 40+ balls in play — anything less is faded.

import Link from 'next/link'
import { getLineupVsSp, FAMILIES, MIN_CLASH_PITCHES, MIN_FAMILY_SWINGS, MIN_ZONE_PITCHES, MIN_BIP, type FamilyTally, type Hitter, type LineupVsSp } from '@/lib/scout/lineup-vs-sp'
import { getZoneLabel } from '@/lib/key-players-narrative'
import { CHART_BLUE, CHART_ORANGE } from './charts/LineChart'
import ClubHeader from './ClubHeader'
import Tabs from './Tabs'
import { ZoneMap, ZoneMetricProvider, ZoneMetricToggle, type Metric, type ZoneStat } from './ZoneMetric'
import type { ScoutClub, ScoutContext } from './types'

const EDGE = 0.15
const surname = (n: string) => n.trim().split(/\s+/).slice(-1)[0]
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null)
const f0 = (v: number | null) => (v == null ? '—' : `${v.toFixed(0)}%`)

const CORE = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

const n0 = (v: unknown): number | null => { const x = Number(v); return v == null || v === '' || !Number.isFinite(x) ? null : x }

/** The per-zone numbers the client-side metric toggle needs for one hitter. */
function zoneStats(h: Hitter): Record<string, ZoneStat> {
  const c = h.clash
  if (!c) return {}
  const cells = new Map(c.cells.map((x) => [x.zone, x]))
  const out: Record<string, ZoneStat> = {}
  for (const zk of CORE) {
    const raw = c.zones[zk], cell = cells.get(zk), n = c.zoneN[zk] ?? 0
    out[zk] = {
      tilt: cell?.tilt ?? null, pitches: n, ab: n0(raw?.ab) ?? 0, bbe: n0(raw?.bbe) ?? 0,
      ba: n0(raw?.ba), slg: n0(raw?.slg), xwoba: n0(raw?.xwoba), woba: n0(raw?.woba), ev: n0(raw?.ev), hh: n0(raw?.hard_hit_pct),
      edgeTitle: cell ? `${getZoneLabel(zk, h.stand)}: ${cell.tilt >= 0 ? 'hitter' : 'pitcher'} edge ${cell.tilt >= 0 ? '+' : ''}${cell.tilt.toFixed(2)} · his xwOBA ${cell.batter_xwoba != null ? cell.batter_xwoba.toFixed(3).replace(/^0/, '') : '—'} · ${cell.pitcher_usage_pct ?? 0}% of the starter's pitches · n=${n}${n < MIN_ZONE_PITCHES ? ' (thin)' : ''}` : 'no data',
    }
  }
  return out
}

function ClashCard({ h }: { h: Hitter }) {
  const c = h.clash
  const thinAll = !c || c.pitches < MIN_CLASH_PITCHES
  const cells = new Map((c?.cells ?? []).map((x) => [x.zone, x]))
  const usable = CORE.map((z) => ({ z, cell: cells.get(z), n: c?.zoneN[z] ?? 0 })).filter((x) => x.cell && x.n >= MIN_ZONE_PITCHES)
  const best = [...usable].sort((a, b) => (b.cell!.tilt) - (a.cell!.tilt))[0]
  const worst = [...usable].sort((a, b) => (a.cell!.tilt) - (b.cell!.tilt))[0]
  const total = c?.total ?? 0
  return (
    <div className={`rounded-xl border border-stone-200 bg-white p-2.5 ${thinAll ? 'opacity-50' : ''}`}>
      <div className="flex items-baseline justify-between gap-1 mb-1.5">
        <p className="text-[11px] font-sans font-bold text-stone-900 truncate">{h.order}. {surname(h.name)} <span className="font-mono font-normal text-[9px] text-stone-400">{h.stand}{h.switchHitter ? ' (S)' : ''}</span></p>
        {c && <span className="text-[9px] font-mono shrink-0" style={{ color: Math.abs(total) < 0.5 ? '#78716c' : total > 0 ? CHART_BLUE : CHART_ORANGE }}>{Math.abs(total) < 0.5 ? 'even' : total > 0 ? '▲ edge' : '▼ tough'}</span>}
      </div>
      <ZoneMap zones={zoneStats(h)} minPitches={MIN_ZONE_PITCHES} label={`${h.name} zone map: ${total > 0 ? 'hitter edge' : 'pitcher edge'} on tonight\'s starter`} />
      <div className="mt-1.5 space-y-0.5 text-[10px] font-sans text-stone-600 leading-snug">
        {best && best.cell!.tilt >= EDGE && <p><span style={{ color: CHART_BLUE }}>▲</span> {getZoneLabel(best.z, h.stand)}</p>}
        {worst && worst.cell!.tilt <= -EDGE && <p><span style={{ color: CHART_ORANGE }}>▼</span> {getZoneLabel(worst.z, h.stand)}</p>}
        {!c && <p className="italic text-stone-400">No zone data</p>}
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[9px] font-mono text-stone-400">
        <span>n={c?.pitches ?? 0}{thinAll ? ' · thin' : ''}</span>
        <Link href={`/mlb/batting-lab/${h.id}/hot-zones`} className="text-orange-600 hover:text-orange-700 uppercase tracking-wider">Batting Lab →</Link>
      </div>
    </div>
  )
}

function ClashPanel({ club, side, d }: { club: ScoutClub; side: 'away' | 'home'; d: LineupVsSp | null }) {
  if (!d) return <Empty club={club} side={side} />
  const ranked = [...d.hitters].filter((h) => h.clash && h.clash.pitches >= MIN_CLASH_PITCHES).sort((a, b) => b.clash!.total - a.clash!.total)
  return (
    <div className="space-y-3">
      <ClubHeader club={club} side={side}><span className="text-[10px] font-mono text-stone-500">vs {d.sp.name} ({d.sp.hand ?? '?'}HP)</span></ClubHeader>
      {ranked.length >= 2 && (
        <p className="text-[11px] font-sans text-stone-600 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
          {ranked[0].clash!.total >= 0.5
            ? <>Best fits: <span className="font-semibold">{ranked.filter((h) => h.clash!.total >= 0.5).slice(0, 3).map((h) => `${surname(h.name)} (+${h.clash!.total.toFixed(1)})`).join(', ')}</span>. </>
            : <>No hitter has a clear zone edge on {d.sp.name}; the closest fits are <span className="font-semibold">{ranked.slice(0, 3).map((h) => `${surname(h.name)} (${h.clash!.total >= 0 ? '+' : ''}${h.clash!.total.toFixed(1)})`).join(', ')}</span>. </>}
          Toughest matchups: <span className="font-semibold">{ranked.slice(-2).reverse().map((h) => `${surname(h.name)} (${h.clash!.total.toFixed(1)})`).join(', ')}</span>.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{d.hitters.map((h) => <ClashCard key={h.id} h={h} />)}</div>
      <p className="text-[9.5px] font-mono text-stone-400 leading-relaxed">Each zone compares the hitter&apos;s expected wOBA there against how often {d.sp.name} throws there and what he allows. Blue = hitter edge, orange = pitcher edge, grey = even; faded zones have under {MIN_ZONE_PITCHES} pitches, faded cards under {MIN_CLASH_PITCHES}. Uses each hitter&apos;s split against {d.sp.hand === 'L' ? 'left' : 'right'}-handed pitching. Zones are shown from the catcher&apos;s view; inside/outside follow the hitter&apos;s side.</p>
    </div>
  )
}

// ─── Swing & miss ────────────────────────────────────────────────────────

const rates = (t: FamilyTally) => ({ swing: pct(t.swings, t.pitches), whiff: pct(t.whiffs, t.swings), chase: pct(t.chaseSwings, t.chasePitches), thin: t.swings < MIN_FAMILY_SWINGS })

function SwingPanel({ club, side, d }: { club: ScoutClub; side: 'away' | 'home'; d: LineupVsSp | null }) {
  if (!d) return <Empty club={club} side={side} />
  const w = FAMILIES.reduce((a, f) => {
    const r = rates(d.lineup.families[f]), u = d.sp.familyUsage[f] / 100
    return { whiff: a.whiff + (r.whiff ?? 0) * u, chase: a.chase + (r.chase ?? 0) * u, ok: a.ok && !r.thin }
  }, { whiff: 0, chase: 0, ok: true })
  return (
    <div className="space-y-4">
      <ClubHeader club={club} side={side}><span className="text-[10px] font-mono text-stone-500">vs {d.sp.name}&apos;s mix</span></ClubHeader>
      <table className="w-full text-[11px]">
        <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200">
          <th className="text-left font-semibold py-1">Pitch family</th><th className="font-semibold">His usage</th><th className="font-semibold">Swing</th><th className="font-semibold">Whiff</th><th className="font-semibold">Chase</th><th className="font-semibold">Swings</th></tr></thead>
        <tbody>
          {FAMILIES.map((f) => {
            const t = d.lineup.families[f], r = rates(t)
            return (
              <tr key={f} className={`border-b border-stone-100 last:border-0 text-right ${r.thin ? 'text-stone-300' : 'text-stone-700'}`}>
                <td className="text-left py-1 font-sans font-semibold">{f}</td>
                <td className="font-mono">{d.sp.familyUsage[f].toFixed(0)}%</td>
                <td className="font-mono">{f0(r.swing)}</td><td className="font-mono">{f0(r.whiff)}</td><td className="font-mono">{f0(r.chase)}</td>
                <td className="font-mono text-stone-400">{t.swings}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="space-y-2">
        {(['whiff', 'chase'] as const).map((k) => (
          <div key={k}>
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1">{k === 'whiff' ? 'Whiff rate' : 'Chase rate'} by pitch family</p>
            <ul className="space-y-1">
              {FAMILIES.map((f) => {
                const r = rates(d.lineup.families[f]), v = r[k]
                return (
                  <li key={f} className={`grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-[11px] font-sans text-stone-700 ${r.thin ? 'opacity-40' : ''}`}>
                    <span>{f}</span>
                    <span className="h-2 rounded-[3px] bg-stone-100 overflow-hidden"><span className="block h-full rounded-[3px]" style={{ width: `${Math.min(100, (v ?? 0) * 1.6)}%`, background: k === 'whiff' ? CHART_BLUE : CHART_ORANGE }} /></span>
                    <span className="font-mono text-[10px] text-stone-500 text-right">{f0(v)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[11px] font-sans text-stone-600 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
        Weighted by {d.sp.name}&apos;s mix ({FAMILIES.map((f) => `${d.sp.familyUsage[f].toFixed(0)}% ${f.toLowerCase()}`).join(', ')}): expected whiff <span className="font-mono font-bold">{w.whiff.toFixed(0)}%</span> of swings, chase <span className="font-mono font-bold">{w.chase.toFixed(0)}%</span> of out-of-zone pitches.{w.ok ? '' : ' A family has under 40 lineup swings — treat as a guide.'}
      </p>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1">Whiff rate by hitter</p>
        <table className="w-full text-[11px]">
          <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200"><th className="text-left font-semibold py-1">Hitter</th>{FAMILIES.map((f) => <th key={f} className="font-semibold">{f.slice(0, 4)}</th>)}<th className="font-semibold">Chase</th></tr></thead>
          <tbody>
            {d.hitters.map((h) => {
              const all = FAMILIES.reduce((a, f) => ({ cp: a.cp + h.families[f].chasePitches, cs: a.cs + h.families[f].chaseSwings }), { cp: 0, cs: 0 })
              return (
                <tr key={h.id} className="border-b border-stone-100 last:border-0 text-right text-stone-700">
                  <td className="text-left py-1 font-sans font-semibold">{h.order}. {surname(h.name)}</td>
                  {FAMILIES.map((f) => { const r = rates(h.families[f]); return <td key={f} className={`font-mono ${r.thin ? 'text-stone-300' : ''}`} title={`${h.families[f].swings} swings`}>{f0(r.whiff)}</td> })}
                  <td className={`font-mono ${all.cp < 60 ? 'text-stone-300' : ''}`}>{f0(pct(all.cs, all.cp))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-[9.5px] font-mono text-stone-300 mt-1">Whiff = misses per swing; chase = swings at pitches outside the zone. Faded under {MIN_FAMILY_SWINGS} swings (hover for the count). Fastball = four-seam / sinker / cutter; breaking = slider / sweeper / curve; offspeed = changeup / splitter.</p>
      </div>
    </div>
  )
}

// ─── Spray lean ──────────────────────────────────────────────────────────

function SprayPanel({ club, side, d }: { club: ScoutClub; side: 'away' | 'home'; d: LineupVsSp | null }) {
  if (!d) return <Empty club={club} side={side} />
  const s = d.lineup.spray
  return (
    <div className="space-y-3">
      <ClubHeader club={club} side={side}><span className="text-[10px] font-mono text-stone-500">vs {d.sp.hand ?? '?'}-handed pitching</span></ClubHeader>
      {s && (
        <div>
          <div className="flex gap-[2px] h-4" role="img" aria-label={`Lineup batted-ball mix: ${s.gbPct.toFixed(0)}% ground balls`}>
            {[{ v: s.gbPct, c: '#a8a29e', l: 'GB' }, { v: s.ldPct, c: CHART_BLUE, l: 'LD' }, { v: s.fbPct, c: CHART_ORANGE, l: 'FB' }].map((p) => (
              <div key={p.l} className="flex items-center justify-center text-[9px] font-mono text-white rounded-[3px]" style={{ width: `${p.v}%`, background: p.c }}>{p.v >= 12 ? `${p.l} ${p.v.toFixed(0)}%` : ''}</div>
            ))}
          </div>
          <p className="text-[9.5px] font-mono text-stone-400 mt-1">Lineup batted-ball mix · {s.bip.toLocaleString()} balls in play · GB = ground ball, LD = line drive, FB = fly ball / pop-up</p>
        </div>
      )}
      <table className="w-full text-[11px]">
        <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-right border-b border-stone-200"><th className="text-left font-semibold py-1">Hitter</th><th className="font-semibold">GB%</th><th className="font-semibold">LD%</th><th className="font-semibold">FB%</th><th className="font-semibold">Pull%</th><th className="font-semibold">Pulled GB%</th><th className="font-semibold">BIP</th></tr></thead>
        <tbody>
          {d.hitters.map((h) => (
            <tr key={h.id} className={`border-b border-stone-100 last:border-0 text-right ${h.spray ? 'text-stone-700' : 'text-stone-300'}`}>
              <td className="text-left py-1 font-sans font-semibold">{h.order}. {surname(h.name)} <span className="font-mono font-normal text-[9px] text-stone-400">{h.stand}</span></td>
              <td className="font-mono">{h.spray ? f0(h.spray.gbPct) : '—'}</td><td className="font-mono">{h.spray ? f0(h.spray.ldPct) : '—'}</td><td className="font-mono">{h.spray ? f0(h.spray.fbPct) : '—'}</td>
              <td className="font-mono">{f0(h.spray?.pullPct ?? null)}</td><td className="font-mono">{f0(h.spray?.pulledGbPct ?? null)}</td>
              <td className="font-mono text-stone-400" title={h.spray && !h.spray.vsHand ? `Not enough balls in play vs ${d.sp.hand}HP — shows all pitchers` : undefined}>{h.spray ? h.spray.bip : 0}{h.spray && !h.spray.vsHand ? '†' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[9.5px] font-mono text-stone-300">Rows need {MIN_BIP}+ balls in play. † = too few against {d.sp.hand ?? 'this'}-handed pitching, so the hitter&apos;s full-season mix is shown. Pull% is the share of his balls in play hit to his pull side.</p>
    </div>
  )
}

function Empty({ club, side }: { club: ScoutClub; side: 'away' | 'home' }) {
  return <div><ClubHeader club={club} side={side} /><p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">{club.abbr} lineup or the opposing starter isn&apos;t available yet.</p></div>
}

function Cols({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <div className="grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-stone-100"><div>{left}</div><div className="lg:pl-6">{right}</div></div>
}

export default async function LineupVsSpSection({ ctx }: { ctx: ScoutContext }) {
  const [awayVs, homeVs] = await Promise.all([
    ctx.home.probableId ? getLineupVsSp(ctx.away.id, ctx.home.probableId, ctx.home.probableName ?? 'Starter', ctx.gameDate, ctx.gamePk) : Promise.resolve(null),
    ctx.away.probableId ? getLineupVsSp(ctx.home.id, ctx.away.probableId, ctx.away.probableName ?? 'Starter', ctx.gameDate, ctx.gamePk) : Promise.resolve(null),
  ])
  // a metric is only offered once at least one hitter has a number for it (wOBA / EV / hard-hit arrive with the weekly zone refresh)
  const zs = [awayVs, homeVs].flatMap((d) => d?.hitters ?? []).flatMap((h) => Object.values(zoneStats(h)))
  const available: Record<Metric, boolean> = {
    edge: true, pitches: true,
    avg: zs.some((z) => z.ba != null), slg: zs.some((z) => z.slg != null), xwoba: zs.some((z) => z.xwoba != null),
    woba: zs.some((z) => z.woba != null), ev: zs.some((z) => z.ev != null), hh: zs.some((z) => z.hh != null),
  }
  const two = (P: typeof ClashPanel) => <Cols left={<P club={ctx.away} side="away" d={awayVs} />} right={<P club={ctx.home} side="home" d={homeVs} />} />
  return (
    <div className="space-y-4">
      <Tabs tabs={[
        { id: 'clash', label: 'Zone clash', content: (
          <ZoneMetricProvider available={available}>
            <div className="space-y-4"><ZoneMetricToggle />{two(ClashPanel)}</div>
          </ZoneMetricProvider>
        ) },
        { id: 'swing', label: 'Swing & miss by pitch', content: two(SwingPanel) },
        { id: 'spray', label: 'Spray & batted-ball lean', content: two(SprayPanel) },
      ]} />
      <p className="text-[10px] font-mono text-stone-400 leading-relaxed">
        Hitter and pitcher zone data are Statcast aggregates for the season on the split that applies tonight. Every rate shows its sample and is faded under its gate. Deeper per-hitter views live in Batting Lab and Pitching Lab. Bench bats and pinch-hit threats aren&apos;t included yet. This describes fit, it isn&apos;t a prediction.
      </p>
    </div>
  )
}
