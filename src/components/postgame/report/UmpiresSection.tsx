// src/components/postgame/report/UmpiresSection.tsx
//
// §11 Umpire report — the crew, and (only when there are at least MIN_TAKES tracked calls) how the
// plate umpire's ball/strike calls held up: accuracy, missed calls split into balls-called-strikes
// and strikes-called-balls, and a strike-zone plot from the catcher's view — every take as a dot,
// misses ringed. See lib/postgame/umpires.ts for exactly what counts as a miss.

import { getPostData } from '@/lib/postgame/data'
import { buildUmpires, MIN_TAKES, type PlateNight } from '@/lib/postgame/umpires'
import TipLayer from './TipLayer'
import { Empty, Eyebrow, Foot, SIDE_COLOR, Stat, ordinal } from './ui'
import type { PostgameContext } from './types'

const W = 340, H = 440, X0 = -2.1, X1 = 2.1, Z0 = 0.2, Z1 = 4.8
const sx = (x: number) => ((x - X0) / (X1 - X0)) * W
const sz = (z: number) => H - ((z - Z0) / (Z1 - Z0)) * H
const MONO = { font: '400 9px ui-monospace, monospace' } as const

function ZonePlot({ p }: { p: PlateNight }) {
  const zl = sx(-0.83), zr = sx(0.83), zt = sz(p.zoneTop), zb = sz(p.zoneBottom)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block bg-stone-50 border border-stone-200" role="img" aria-label="Strike zone from the catcher's view with every called ball and strike">
      {[1, 2, 3, 4].map((ft) => <g key={ft}><line x1={0} x2={W} y1={sz(ft)} y2={sz(ft)} stroke="#eeeeec" /><text x={4} y={sz(ft) - 3} className="fill-stone-400" style={MONO}>{ft} ft</text></g>)}
      <rect x={zl} y={zt} width={zr - zl} height={zb - zt} fill="#fff" stroke="#1A1A1A" strokeWidth={1.6} />
      {[1, 2].map((k) => <g key={k}><line x1={zl + ((zr - zl) * k) / 3} x2={zl + ((zr - zl) * k) / 3} y1={zt} y2={zb} stroke="#e7e5e4" /><line x1={zl} x2={zr} y1={zt + ((zb - zt) * k) / 3} y2={zt + ((zb - zt) * k) / 3} stroke="#e7e5e4" /></g>)}
      <path d={`M${sx(-0.708)} ${sz(0.32)} h${sx(0.708) - sx(-0.708)} l-8 -10 h${-(sx(0.708) - sx(-0.708)) + 16} z`} fill="#e7e5e4" />
      {p.points.map((q, i) => ({ q, i })).filter(({ q }) => !q.missed).map(({ q, i }) => (
        <g key={i} data-tip={i} style={{ cursor: 'pointer' }}><circle cx={sx(q.x)} cy={sz(q.z)} r={8} fill="transparent" /><circle cx={sx(q.x)} cy={sz(q.z)} r={3} fill={q.call === 'strike' ? '#FF5722' : '#a8a29e'} fillOpacity={0.4} /></g>
      ))}
      {p.points.map((q, i) => ({ q, i })).filter(({ q }) => q.missed).map(({ q, i }) => (
        <g key={`m${i}`} data-tip={i} style={{ cursor: 'pointer' }}><circle cx={sx(q.x)} cy={sz(q.z)} r={6.5} fill={q.call === 'strike' ? '#FF5722' : '#a8a29e'} stroke="#1A1A1A" strokeWidth={2} /></g>
      ))}
    </svg>
  )
}

export default async function UmpiresSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  if (!data) return <Empty>The game feed isn&apos;t available, so the umpire report can&apos;t be built.</Empty>
  const u = buildUmpires(data)
  if (u.crew.length === 0) return <Empty>The umpire crew isn&apos;t listed for this game.</Empty>
  const p = u.plate
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {u.crew.map((c) => (
          <div key={c.role} className="rounded-lg border border-stone-200 bg-white px-3 py-2">
            <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">{c.role}</p>
            <p className="text-[13px] font-sans font-bold text-stone-900 leading-tight mt-0.5">{c.name}</p>
          </div>
        ))}
      </div>
      {p ? (
        <div className="grid gap-6 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">
          <div>
            <TipLayer tips={p.points.map((q) => q.tip)}><ZonePlot p={p} /></TipLayer>
            <p className="text-[9.5px] font-mono text-stone-400 mt-1">Catcher&apos;s view · <span className="text-orange-600">●</span> called strike <span className="text-stone-400">●</span> called ball · ringed = missed call · hover or tap a pitch for the at-bat</p>
          </div>
          <div className="space-y-4 min-w-0">
            <Eyebrow>{p.name} behind the plate</Eyebrow>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <Stat label="Call accuracy" value={`${p.accuracyPct.toFixed(1)}%`} sub={`${p.takes - p.missed} of ${p.takes} calls`} />
              <Stat label="Balls called strikes" value={p.extraStrikes} />
              <Stat label="Strikes called balls" value={p.lostStrikes} />
              <Stat label="Corrected by ABS" value={p.overturned} sub={p.missed ? `of ${p.missed} misses` : undefined} />
            </div>
            {p.missed > 0 && (
              <div>
                <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mb-1">Who the misses helped</p>
                <div className="flex h-6 text-[10px] font-mono font-bold text-white">
                  {(['away', 'home'] as const).map((s) => { const n = p.misses.filter((m) => m.helped === s).length; return n ? <div key={s} className="flex items-center justify-center" style={{ width: `${(n / p.missed) * 100}%`, background: SIDE_COLOR[s] }}>{ctx[s].abbr} {n}</div> : null })}
                </div>
                <p className="text-[9.5px] font-mono text-stone-400 mt-1">A ball called a strike helps the fielding club; a strike called a ball helps the batting club.</p>
              </div>
            )}
            <div>
              <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400 mb-1">Calls by inning <span className="normal-case">(dark = missed)</span></p>
              <div className="flex items-end gap-1.5 h-20">
                {p.byInning.map((r) => {
                  const max = Math.max(...p.byInning.map((x) => x.takes))
                  return (
                    <div key={r.inning} className="flex-1 flex flex-col items-center justify-end h-full" title={`Inning ${r.inning}: ${r.takes} calls, ${r.missed} missed`}>
                      <div className="w-full flex flex-col justify-end" style={{ height: `${(r.takes / max) * 100}%` }}>
                        {r.missed > 0 && <div className="bg-stone-900" style={{ height: `${(r.missed / r.takes) * 100}%`, minHeight: 4 }} />}
                        <div className="bg-stone-200" style={{ flex: 1 }} />
                      </div>
                      <span className="font-mono text-[9px] text-stone-400 mt-0.5">{r.inning}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            {p.misses.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px] min-w-[440px]">
                  <thead><tr className="text-[9px] font-mono uppercase tracking-wider text-stone-400 text-left border-b border-stone-200"><th className="py-1">When</th><th>Batter vs pitcher</th><th>The call</th><th className="text-right">Off the zone</th><th className="text-right">Helped</th></tr></thead>
                  <tbody>
                    {p.misses.map((m, i) => (
                      <tr key={i} className="border-b border-stone-100 last:border-0 text-stone-700">
                        <td className="py-1.5 font-mono text-[10.5px] whitespace-nowrap">{m.top ? 'Top' : 'Bot'} {ordinal(m.inning)}</td>
                        <td className="font-sans">{m.batter.split(' ').slice(-1)[0]} vs {m.pitcher.split(' ').slice(-1)[0]}</td>
                        <td className="font-sans">{m.call === 'strike' ? 'Ball called a strike' : 'Strike called a ball'}{m.overturned && <span className="ml-1.5 font-mono text-[9px] text-orange-600 font-bold">ABS FIXED</span>}</td>
                        <td className="text-right font-mono">{m.where === 'in the zone' ? `${m.inches.toFixed(1)}″ inside` : `${m.inches.toFixed(1)}″ ${m.where}`}</td>
                        <td className="text-right font-mono font-bold" style={{ color: SIDE_COLOR[m.helped] }}>{ctx[m.helped].abbr}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-[12px] font-sans text-stone-700">No clear misses on the pitches that were taken.</p>}
          </div>
        </div>
      ) : (
        <p className="text-[12px] font-sans italic text-stone-400">Fewer than {MIN_TAKES} tracked ball/strike calls were available, so the zone summary is left out rather than guessed.</p>
      )}
      <Foot>A call counts as missed when an ABS challenge overturned it, or — if it wasn&apos;t challenged — the tracked pitch was clearly on the wrong side of that batter&apos;s zone (plate width and the batter&apos;s zone height, each widened by a ball&apos;s radius because any touch of the zone is a strike, with half an inch of grace at the edge). Challenged calls that stood are counted correct. Pitch tracking has real measurement error at the edges; treat this as a read on the night, not an official grade.</Foot>
    </div>
  )
}
