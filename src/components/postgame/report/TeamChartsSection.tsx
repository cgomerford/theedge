// src/components/postgame/report/TeamChartsSection.tsx
//
// Pro: team- and game-level charts — bullpen stress (tonight vs the club's typical bullpen day), offense process (hard-hit and barrel %
// tonight vs season, and whether the runs matched the contact) and a starter watch card (velocity, whiff and hard contact in one glance).

import { getPostData } from '@/lib/postgame/data'
import { getTeamCharts, HIGH_LI, type PenStress, type Process, type Watch } from '@/lib/postgame/teamcharts'
import { Empty, Eyebrow, Foot, SIDE_COLOR, Stat } from './ui'
import type { PostgameContext } from './types'

const DIAL = { 'Quiet night': 'bg-stone-100 text-stone-700 border-stone-300', Mixed: 'bg-yellow-200 text-stone-900 border-yellow-400', Concerning: 'bg-orange-500 text-white border-orange-600' } as const

function Bar({ label, tonight, season, color }: { label: string; tonight: number | null; season: number | null; color: string }) {
  const max = Math.max(tonight ?? 0, season ?? 0, 1) * 1.15
  return (
    <div className="grid grid-cols-[74px_minmax(0,1fr)_92px] items-center gap-2">
      <span className="text-[10.5px] font-mono text-stone-600">{label}</span>
      <div className="space-y-0.5"><div className="h-2.5 bg-stone-100"><div className="h-full" style={{ width: `${((tonight ?? 0) / max) * 100}%`, background: color }} /></div><div className="h-2 bg-stone-50">{season != null && <div className="h-full bg-stone-400" style={{ width: `${(season / max) * 100}%` }} />}</div></div>
      <span className="text-[10.5px] font-mono text-right"><b>{tonight != null ? tonight.toFixed(0) : '—'}</b><span className="text-stone-400"> / {season != null ? season.toFixed(0) : '—'}</span></span>
    </div>
  )
}

const signed = (v: number | null, d = 1, unit = '') => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}${unit}`)

export default async function TeamChartsSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  if (!data) return <Empty>The game feed isn&apos;t available.</Empty>
  const t = await getTeamCharts(data, ctx.gameDate)
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Bullpen stress — tonight vs a typical bullpen day</Eyebrow>
        <div className="grid gap-4 md:grid-cols-2">
          {t.pens.map((p: PenStress) => (
            <div key={p.side} className="rounded-xl border border-stone-200 bg-white p-3.5 space-y-2.5">
              <p className="text-[13px] font-sans font-bold" style={{ color: SIDE_COLOR[p.side] }}>{ctx[p.side].abbr} bullpen</p>
              <Bar label="Pitches" tonight={p.pitches} season={p.typical} color={SIDE_COLOR[p.side]} />
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Arms used" value={p.arms} />
                <Stat label={`Entered at ${HIGH_LI.toFixed(1)}+ leverage`} value={p.highLeverage} />
                <Stat label="3-day pitches" value={p.three} sub="pen, incl. tonight" />
              </div>
              <p className="text-[10px] font-mono text-stone-400">{p.typical != null ? `Typical = the club's average bullpen day over its last ${p.days} recorded days (${p.typical.toFixed(0)} pitches).` : 'No recent workload recorded for a typical day.'}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Eyebrow>Offense process — tonight vs season</Eyebrow>
        <div className="grid gap-4 md:grid-cols-2">
          {t.process.map((p: Process) => (
            <div key={p.side} className="rounded-xl border border-stone-200 bg-white p-3.5 space-y-2.5">
              <p className="text-[13px] font-sans font-bold" style={{ color: SIDE_COLOR[p.side] }}>{ctx[p.side].abbr} · {p.runs} run{p.runs === 1 ? '' : 's'} on {p.bbe} balls in play</p>
              <Bar label="Hard-hit %" tonight={p.hard} season={p.seasonHard} color={SIDE_COLOR[p.side]} />
              <Bar label="Barrel %" tonight={p.barrel} season={p.seasonBarrel} color={SIDE_COLOR[p.side]} />
              <p className="text-[12px] font-sans text-stone-700 leading-snug">{p.read}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Eyebrow>Starter watch — rest of the series</Eyebrow>
        <div className="grid gap-4 md:grid-cols-2">
          {t.watch.map((w: Watch) => (
            <div key={w.id} className="rounded-xl border border-stone-200 bg-white p-3.5">
              <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-sans font-bold text-stone-900"><span style={{ color: SIDE_COLOR[w.side] }}>{ctx[w.side].abbr}</span> · {w.name}</p><span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-1 border ${DIAL[w.dial.label]}`}>{w.dial.label}</span></div>
              <div className="grid grid-cols-3 gap-2 mt-2.5">
                <Stat label="Fastball velo" value={signed(w.velo, 1)} sub="mph vs season" />
                <Stat label="Whiff / swing" value={signed(w.whiff, 0, ' pts')} sub="vs season, by pitch" />
                <Stat label="Hard-hit" value={w.hard != null ? `${w.hard.toFixed(0)}%` : '—'} sub={`${w.bip} balls in play`} />
              </div>
              <p className="text-[10.5px] font-sans text-stone-500 mt-2">{w.dial.flags} flag{w.dial.flags === 1 ? '' : 's'} of {w.dial.evaluated} checks. One start is one start.</p>
            </div>
          ))}
        </div>
      </div>
      <Foot>Bullpen: leverage at entry is MLB&apos;s leverage index at the first batter each reliever faced. A typical bullpen day is estimated from the workload table (each day&apos;s starter, taken as the highest pitch count of 60+, is removed). Offense: hard-hit and barrel % are tonight&apos;s balls in play with tracking against the club&apos;s season figures; the read compares runs to that contact. Starter watch summarises the pitcher check above.</Foot>
    </div>
  )
}
