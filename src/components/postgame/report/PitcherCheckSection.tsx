// src/components/postgame/report/PitcherCheckSection.tsx
//
// Pro: "Pitchers — was anything concerning?" One tab per starter: a concern dial (Quiet night / Mixed / Concerning, from the
// flags below) and a card per check, each with a chart, tonight vs baseline, a plain sentence and a flag state. Rules, samples
// and baselines are in lib/postgame/pitchercheck.ts and repeated in the footnote. Season baselines only where they exist; the
// last-five-starts view is box-line items (pitches, innings, K, BB) from the MLB game log.

import { getPostData } from '@/lib/postgame/data'
import { getPitcherChecks, type PitcherCheck, type State } from '@/lib/postgame/pitchercheck'
import { pitchColor } from '@/lib/mlb'
import Tabs from '@/components/scout/Tabs'
import { Empty, Foot, SIDE_COLOR } from './ui'
import type { PostgameContext } from './types'

const DIAL = { 'Quiet night': 'bg-stone-100 text-stone-700 border-stone-300', Mixed: 'bg-yellow-200 text-stone-900 border-yellow-400', Concerning: 'bg-orange-500 text-white border-orange-600' } as const
const STATE: Record<State, { t: string; c: string }> = { flag: { t: 'FLAG', c: 'bg-orange-500 text-white border-orange-600' }, ok: { t: 'OK', c: 'bg-stone-100 text-stone-500 border-stone-200' }, na: { t: 'NOT ENOUGH TO JUDGE', c: 'bg-white text-stone-400 border-stone-300 border-dashed' } }
const MONO = { font: '400 9px ui-monospace, monospace' } as const
const pct = (v: number | null, d = 0) => (v == null ? '—' : `${v.toFixed(d)}%`)

function Card({ title, state, note, children }: { title: string; state: State; note: string; children?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border bg-white p-3.5 ${state === 'flag' ? 'border-orange-400' : 'border-stone-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-sans font-bold text-stone-900 leading-tight">{title}</p>
        <span className={`shrink-0 text-[8.5px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 border ${STATE[state].c}`}>{STATE[state].t}</span>
      </div>
      {children && <div className="mt-2.5">{children}</div>}
      <p className="text-[11.5px] font-sans text-stone-700 leading-snug mt-2.5">{note}</p>
    </div>
  )
}

/** last starts as a line, tonight as a big dot at the end, season-average-of-those as a dashed line */
function Spark({ values, tonight, label, color, fmt }: { values: number[]; tonight: number; label: string; color: string; fmt: (v: number) => string }) {
  const all = [...values, tonight], lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1
  const W = 132, H = 44, px = (i: number) => 6 + (i / Math.max(1, all.length - 1)) * (W - 12), py = (v: number) => H - 6 - ((v - lo) / span) * (H - 12)
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  return (
    <div>
      <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">{label}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={`${label}: last ${values.length} starts and tonight`}>
        {mean != null && <line x1={0} x2={W} y1={py(mean)} y2={py(mean)} stroke="#d6d3d1" strokeDasharray="3 3" />}
        <polyline points={values.map((v, i) => `${px(i)},${py(v)}`).join(' ')} fill="none" stroke="#a8a29e" strokeWidth={1.5} />
        {values.map((v, i) => <circle key={i} cx={px(i)} cy={py(v)} r={2} fill="#a8a29e" />)}
        {values.length > 0 && <line x1={px(values.length - 1)} y1={py(values[values.length - 1])} x2={px(values.length)} y2={py(tonight)} stroke={color} strokeWidth={1.5} strokeDasharray="2 2" />}
        <circle cx={px(values.length)} cy={py(tonight)} r={4.5} fill={color} stroke="#1A1A1A" strokeWidth={1.2} />
      </svg>
      <p className="text-[10.5px] font-mono text-stone-700"><b>{fmt(tonight)}</b> <span className="text-stone-400">tonight{mean != null ? ` · L${values.length} avg ${fmt(mean)}` : ''}</span></p>
    </div>
  )
}

function VeloChart({ c }: { c: PitcherCheck }) {
  const types = c.velo.types.filter((t) => t.byInning.length >= 2)
  if (types.length === 0) return null
  const inns = [...new Set(types.flatMap((t) => t.byInning.map((b) => b.inning)))].sort((a, b) => a - b)
  const vals = types.flatMap((t) => [...t.byInning.map((b) => b.velo), ...(t.season != null ? [t.season] : [])])
  const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1)
  const W = 340, H = 150, L = 30, R = 8, T = 8, B = 20
  const X = (i: number) => L + (inns.indexOf(i) / Math.max(1, inns.length - 1)) * (W - L - R), Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Average velocity by inning for each pitch type, with the season average as a dashed line">
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="#fafaf9" stroke="#e7e5e4" />
      {inns.map((i) => <text key={i} x={X(i)} y={H - 6} textAnchor="middle" className="fill-stone-400" style={MONO}>{i}</text>)}
      {[lo, Math.round((lo + hi) / 2), hi].map((v) => <text key={v} x={L - 4} y={Y(v) + 3} textAnchor="end" className="fill-stone-400" style={MONO}>{v}</text>)}
      {types.map((t) => (
        <g key={t.code}>
          {t.season != null && <line x1={L} x2={W - R} y1={Y(t.season)} y2={Y(t.season)} stroke={pitchColor(t.code)} strokeDasharray="4 3" strokeOpacity={0.6} />}
          <polyline points={t.byInning.map((b) => `${X(b.inning)},${Y(b.velo)}`).join(' ')} fill="none" stroke={pitchColor(t.code)} strokeWidth={2} />
          {t.byInning.map((b) => <circle key={b.inning} cx={X(b.inning)} cy={Y(b.velo)} r={2.6} fill={pitchColor(t.code)}><title>{`${t.name}, inning ${b.inning}: ${b.velo.toFixed(1)} mph (${b.n} pitches)`}</title></circle>)}
        </g>
      ))}
    </svg>
  )
}

function Dots({ label, tonight, season, unit = '%' }: { label: string; tonight: number | null; season: number | null; unit?: string }) {
  const at = (v: number) => `${Math.min(100, Math.max(0, v))}%`
  return (
    <div className="grid grid-cols-[62px_minmax(0,1fr)_92px] items-center gap-2">
      <span className="text-[10px] font-mono text-stone-600">{label}</span>
      <div className="relative h-4"><div className="absolute top-1/2 left-0 right-0 h-[3px] -translate-y-1/2 bg-stone-100" />
        {season != null && <div className="absolute top-0 bottom-0 w-[2px] bg-stone-400" style={{ left: at(season) }} title={`season ${season.toFixed(0)}${unit}`} />}
        {tonight != null && <div className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500 border border-stone-900" style={{ left: at(tonight) }} title={`tonight ${tonight.toFixed(0)}${unit}`} />}
      </div>
      <span className="text-[10.5px] font-mono text-right"><b>{tonight != null ? `${tonight.toFixed(0)}${unit}` : '—'}</b><span className="text-stone-400"> / {season != null ? `${season.toFixed(0)}${unit}` : '—'}</span></span>
    </div>
  )
}

function Stack({ label, parts, total }: { label: string; parts: { code: string; name: string; v: number }[]; total?: number }) {
  return (
    <div className="grid grid-cols-[62px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[10px] font-mono text-stone-600">{label}</span>
      <div className="flex h-5 overflow-hidden bg-stone-100">{parts.filter((p) => p.v > 0).map((p) => <div key={p.code} className="flex items-center justify-center text-[9px] font-mono font-bold text-white overflow-hidden" style={{ width: `${(p.v / (total ?? 100)) * 100}%`, background: pitchColor(p.code) }} title={`${p.name} ${p.v.toFixed(0)}%`}>{p.v >= 12 ? Math.round(p.v) : ''}</div>)}</div>
    </div>
  )
}

function Panel({ c, ctx }: { c: PitcherCheck; ctx: PostgameContext }) {
  const color = SIDE_COLOR[c.side], o = c.outing, l5 = o.l5
  const ipNum = (ip: string) => { const [w, f = '0'] = ip.split('.'); return Number(w) + Number(f) / 3 }
  const wobaMax = 0.6
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-3">
        <span className={`text-[12px] font-mono font-bold uppercase tracking-widest px-3 py-1.5 border ${DIAL[c.dial.label]}`}>{c.dial.label}</span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-sans text-stone-800"><b>{c.name}</b> <span className="font-mono text-[10px]" style={{ color }}>{ctx[c.side].abbr}</span> · {o.ip} IP, {o.k} K, {o.bb} BB, {o.er} ER, {o.pitches} pitches · <b>{c.dial.flags}</b> flag{c.dial.flags === 1 ? '' : 's'} of {c.dial.evaluated} checks with enough sample{c.dial.reasons.length ? `: ${c.dial.reasons.join(', ')}` : ''}.</p>
          <p className="text-[10px] font-mono text-stone-400">One start is one start — a flag is a reason to watch the next one, not a verdict.{!c.hasSeason && ' No season pitch data on file for him, so season comparisons are skipped.'}</p>
        </div>
      </div>

      {l5.length >= 2 && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-2">This outing vs his last {l5.length} starts</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl border border-stone-200 bg-white p-3.5">
            <Spark values={l5.map((s) => s.pitches)} tonight={o.pitches} label="Pitches" color={color} fmt={(v) => v.toFixed(0)} />
            <Spark values={l5.map((s) => s.ip)} tonight={ipNum(o.ip)} label="Innings" color={color} fmt={(v) => v.toFixed(1)} />
            <Spark values={l5.map((s) => s.k)} tonight={o.k} label="Strikeouts" color={color} fmt={(v) => v.toFixed(v % 1 ? 1 : 0)} />
            <Spark values={l5.map((s) => s.bb)} tonight={o.bb} label="Walks" color={color} fmt={(v) => v.toFixed(v % 1 ? 1 : 0)} />
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Velocity by inning" state={c.velo.state} note={c.velo.note}>
          <VeloChart c={c} />
          <p className="text-[9.5px] font-mono text-stone-400 mt-1">Solid = tonight by inning · dashed = season average · {c.velo.types.map((t) => t.name).join(', ')}</p>
        </Card>
        <Card title="Whiff % by pitch" state={c.whiff.state} note={c.whiff.note}>
          <div className="space-y-1.5">
            {c.whiff.rows.filter((r) => r.tonight != null).map((r) => (
              <div key={r.code} className="grid grid-cols-[86px_minmax(0,1fr)_84px] items-center gap-2">
                <span className="text-[10.5px] font-sans font-semibold text-stone-800 truncate">{r.name}{r.putAway ? ' ★' : ''}</span>
                <div className="space-y-0.5"><div className="h-2 bg-stone-100"><div className="h-full" style={{ width: `${Math.min(100, r.tonight ?? 0)}%`, background: color }} /></div><div className="h-1.5 bg-stone-50">{r.season != null && <div className="h-full bg-stone-400" style={{ width: `${Math.min(100, r.season)}%` }} />}</div></div>
                <span className="text-[10px] font-mono text-right"><b>{pct(r.tonight)}</b><span className="text-stone-400"> / {pct(r.season)}</span><span className="block text-[9px] text-stone-400">{r.swings} swings</span></span>
              </div>
            ))}
          </div>
          <p className="text-[9.5px] font-mono text-stone-400 mt-1">Colour = tonight · grey = season · ★ = put-away pitch</p>
        </Card>
        <Card title="Usage shock" state={c.usage.state} note={c.usage.note}>
          <div className="space-y-1.5">
            <Stack label="Tonight" parts={c.usage.rows.map((r) => ({ code: r.code, name: r.name, v: r.tonight }))} />
            <Stack label="Season" parts={c.usage.rows.filter((r) => r.season != null).map((r) => ({ code: r.code, name: r.name, v: r.season as number }))} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">{c.usage.rows.map((r) => <span key={r.code} className="text-[10px] font-mono text-stone-600"><span className="inline-block w-1.5 h-1.5 mr-1" style={{ background: pitchColor(r.code) }} />{r.name}</span>)}</div>
        </Card>
        <Card title="Chase, zone & hard contact" state={c.zone.state} note={c.zone.note}>
          <div className="space-y-2">
            <Dots label="Zone%" tonight={c.zone.zone} season={c.zone.seasonZone} />
            <Dots label="Chase%" tonight={c.zone.chase} season={c.zone.seasonChase} />
            <Dots label="Hard-hit%" tonight={c.zone.hard} season={null} />
          </div>
          <p className="text-[9.5px] font-mono text-stone-400 mt-1">Dot = tonight · tick = season · chase on {c.zone.chaseN} pitches outside the zone · hard-hit on {c.zone.bip} balls in play (no season baseline yet)</p>
        </Card>
        <Card title="First-pitch strikes & finishing" state={c.finish.state} note={c.finish.note}>
          <div className="space-y-2">
            <Dots label="1st-pitch K" tonight={c.finish.fps} season={c.finish.seasonFps} />
            <div className="grid grid-cols-[62px_minmax(0,1fr)] items-center gap-2"><span className="text-[10px] font-mono text-stone-600">2-strike</span><span className="text-[11px] font-mono text-stone-800"><b>{c.finish.finished}</b> strikeouts of <b>{c.finish.reached}</b> batters at two strikes</span></div>
          </div>
        </Card>
        <Card title="Release point drift" state={c.release.state} note={c.release.note}>
          <ReleasePlot c={c} color={color} />
        </Card>
      </div>

      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-2">Times through the order — wOBA against, tonight vs season</p>
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-stone-200 bg-white p-3.5">
          {c.tto.map((t) => (
            <div key={t.label}>
              <p className="text-[10px] font-mono text-stone-500">{t.label}</p>
              <div className="flex items-end gap-2 h-16 mt-1">
                <div className="w-7 bg-orange-500 border-t-2 border-stone-900" style={{ height: `${Math.min(100, ((t.woba ?? 0) / wobaMax) * 100)}%`, background: color }} title={`tonight ${t.woba?.toFixed(3) ?? '—'}`} />
                <div className="w-7 bg-stone-300" style={{ height: `${Math.min(100, ((t.season ?? 0) / wobaMax) * 100)}%` }} title={`season ${t.season?.toFixed(3) ?? '—'}`} />
              </div>
              <p className="text-[10.5px] font-mono text-stone-700 mt-1"><b>{t.woba != null ? t.woba.toFixed(3).replace(/^0/, '') : '—'}</b> <span className="text-stone-400">/ {t.season != null ? t.season.toFixed(3).replace(/^0/, '') : '—'}</span></p>
              <p className="text-[9px] font-mono text-stone-400">{t.pa} PA tonight · {t.seasonPa} season</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ReleasePlot({ c, color }: { c: PitcherCheck; color: string }) {
  const pts = [...c.release.early.map((p) => ({ ...p, late: false })), ...c.release.late.map((p) => ({ ...p, late: true }))]
  if (pts.length < 6) return null
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length, mz = pts.reduce((a, p) => a + p.z, 0) / pts.length
  const S = 10, W = 200, H = 130   // 10 px per inch
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block bg-stone-50 border border-stone-200" role="img" aria-label="Release point of his primary fastball, first half of the outing against the second">
        <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="#eeeeec" /><line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#eeeeec" />
        {pts.map((p, i) => <circle key={i} cx={W / 2 + (p.x - mx) * 12 * S} cy={H / 2 - (p.z - mz) * 12 * S} r={3} fill={p.late ? color : '#a8a29e'} fillOpacity={0.75} />)}
      </svg>
      <p className="text-[9.5px] font-mono text-stone-400 mt-1">Grey = first half · colour = second half · each square = 1 inch · {c.release.type}</p>
    </div>
  )
}

export default async function PitcherCheckSection({ ctx }: { ctx: PostgameContext }) {
  const data = await getPostData(ctx.gamePk)
  const checks = data ? await getPitcherChecks(data, ctx.gameDate) : []
  if (checks.length === 0) return <Empty>The starting pitchers couldn&apos;t be identified for this game.</Empty>
  return (
    <div className="space-y-3">
      <Tabs tabs={checks.map((c) => ({ id: String(c.id), label: `${ctx[c.side].abbr} · ${c.name.split(' ').slice(-1)[0]}`, badge: c.dial.label, content: <Panel c={c} ctx={ctx} /> }))} />
      <Foot>Flags use fixed rules and minimum samples (all in the code and easy to change). Velocity: primary fastball down 1.2+ mph from his first two innings to his last two, or 1.5+ mph under his season average. Put-away: his best whiff pitch getting half its season whiff rate on 6+ swings. Usage: that pitch thrown 10+ points less than usual, or 12+ points more of a weak (under 15% whiff) secondary. Zone: zone% up 8+, chase% down 8+ and 45%+ of balls in play hit 95+ mph. Finishing: first-pitch strikes 12+ points under season, or one or fewer strikeouts on six two-strike batters. Release: average release point moved 3+ inches between halves of the outing. Dial: 0 flags Quiet night, 1–2 Mixed, 3+ Concerning. Season baselines come from his season pitch data; last-five starts are MLB box-line numbers. Velocity, whiff and hard-hit against his last five starts, and hard-hit / barrel against a season baseline, need the per-start Statcast data still being built and are not shown.</Foot>
    </div>
  )
}
