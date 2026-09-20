'use client'

// src/components/scout/StatExplorer.tsx
//
// "Pick any stat" trend charts for both clubs, side by side. One shared control
// bar (stat + rolling window + layers) drives both charts so the clubs are always
// compared on the same measure. Every value is precomputed server-side
// (lib/scout/stat-explorer.ts) — this only chooses which array to draw.
//
// Layers on the main chart:
//   Dots     (free) — a marker on every game.
//   Overlay  (Pro)  — draw a second line on the SAME axis: the other club's line
//                     for this stat, or another stat with the same units.
//   Flag games (Pro) — pick a player (or the starter a club faced) and mark the
//                     games he started on the chart; the summary underneath
//                     compares the club's numbers with him vs without him.
// Under each main chart sit small tiles that expand in place to a full chart.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import LineChart, { CHART_BLUE, CHART_ORANGE, ChartLegend, type LineSeries } from './charts/LineChart'
import { formatStat, type ExplorerClub, type ExplorerStat, type StartMarker } from '@/lib/scout/stat-explorer'

export type ExplorerClubMeta = { name: string; abbr: string; side: 'Away' | 'Home'; logo: string }

type Props = {
  stats: ExplorerStat[]
  clubs: (ExplorerClub | null)[]
  meta: ExplorerClubMeta[]
  tiles: string[]
  defaultStat: string
  defaultWindow: number
  sampleUnit: string      // "PA" | "batters faced"
  gameUnit: string        // "games"
  isPro: boolean
  /** Wording for the flag control's first option, e.g. "Flag games where a player started…" */
  flagPrompt: string
}

type Layers = { dots: boolean; overlay: 'none' | 'other' | string }   // string = another stat's key

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

function ProChip() {
  return <span className="ml-1 text-[8px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 align-middle">Pro</span>
}

function windowValues(club: ExplorerClub, key: string, w: number): (number | null)[] {
  return club.rolling[w]?.[key] ?? []
}

function chartFor(club: ExplorerClub, stat: ExplorerStat, w: number) {
  const values = windowValues(club, stat.key, w)
  const first = Math.max(0, w - 1)
  return {
    first,
    labels: club.dates.slice(first).map(shortDate),
    values: values.slice(first),
    latest: [...values].reverse().find((v) => v != null) ?? null,
    n: club.samples[w]?.[club.dates.length - 1] ?? 0,
  }
}

function avgSample(club: ExplorerClub | undefined, w: number): number {
  const s = (club?.samples[w] ?? []).filter((v) => v > 0)
  return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 0
}

/** Right-align another club's series to this chart's length (both are "the last N games"). */
function alignRight(values: (number | null)[], length: number): (number | null)[] {
  const tail = values.slice(-length)
  return tail.length >= length ? tail : [...Array(length - tail.length).fill(null), ...tail]
}

function Delta({ stat, value, base }: { stat: ExplorerStat; value: number | null; base: number | null }) {
  if (value == null || base == null) return null
  const d = value - base
  const text = stat.format === 'r3' || stat.format === 'num2' ? Math.abs(d).toFixed(stat.format === 'r3' ? 3 : 2).replace(/^0\./, '.') : Math.abs(d).toFixed(1)
  const unit = stat.format === 'pct' ? ' pts' : stat.format === 'mph' ? ' mph' : ''
  return <span className="font-mono text-stone-500"><span aria-hidden>{d >= 0 ? '▲' : '▼'}</span> {text}{unit} {d >= 0 ? 'above' : 'below'}</span>
}

/** Club numbers in games where the flag is on vs off — from single-game values, weighted the way the stat is. */
function withWithout(club: ExplorerClub, stat: ExplorerStat, flags: boolean[]) {
  const vals = windowValues(club, stat.key, 1)
  const samp = club.samples[1] ?? []
  const acc = { on: { num: 0, den: 0, games: 0, pa: 0 }, off: { num: 0, den: 0, games: 0, pa: 0 } }
  vals.forEach((v, i) => {
    if (v == null) return
    const b = flags[i] ? acc.on : acc.off
    const w = stat.weight === 'game' ? 1 : samp[i] ?? 0
    b.num += v * w; b.den += w; b.games += 1; b.pa += samp[i] ?? 0
  })
  const mean = (b: typeof acc.on) => (b.den > 0 ? b.num / b.den : null)
  return { on: { ...acc.on, value: mean(acc.on) }, off: { ...acc.off, value: mean(acc.off) } }
}

function FlagSelect({ markers, value, onChange, isPro, prompt }: { markers: StartMarker[]; value: string; onChange: (v: string) => void; isPro: boolean; prompt: string }) {
  const groups = useMemo(() => [...new Set(markers.map((m) => m.group))], [markers])
  if (markers.length === 0) return null
  return (
    <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-mono text-stone-500">
      <span className="uppercase tracking-wider">Flag games{!isPro && <ProChip />}</span>
      {isPro ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="text-[11px] font-sans text-stone-700 border border-stone-200 rounded-md px-1.5 py-1 bg-white max-w-[15rem]">
          <option value="">{prompt}</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {markers.filter((m) => m.group === g).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </optgroup>
          ))}
        </select>
      ) : (
        <Link href="/pricing" className="text-[10.5px] font-sans text-orange-600 hover:text-orange-700 underline decoration-dotted">Mark the games a player started — Pro</Link>
      )}
    </label>
  )
}

function ClubPanel({ index, clubs, meta, stats, stat, w, tiles, sampleUnit, layers, isPro, flagPrompt }: {
  index: number; clubs: (ExplorerClub | null)[]; meta: ExplorerClubMeta[]; stats: ExplorerStat[]; stat: ExplorerStat; w: number
  tiles: string[]; sampleUnit: string; layers: Layers; isPro: boolean; flagPrompt: string
}) {
  const club = clubs[index], m = meta[index]
  const other = clubs[1 - index]
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [markerId, setMarkerId] = useState('')

  const header = (
    <div className="flex items-center gap-2.5 pb-2.5 mb-3 border-b border-stone-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={m.logo} alt="" className="w-6 h-6 object-contain shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-sans font-bold text-stone-900 leading-tight truncate">{m.name}</p>
        <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400">{m.side}</p>
      </div>
    </div>
  )
  if (!club) return <div>{header}<p className="text-[12px] font-sans italic text-stone-400 py-6 text-center">Trend data is unavailable for {m.abbr} right now.</p></div>

  const main = chartFor(club, stat, w)
  const base = club.baseline[stat.key]
  const marker = isPro ? club.markers.find((x) => x.id === markerId) : undefined
  const marks = marker ? marker.flags.slice(main.first) : undefined

  const series: LineSeries[] = [{ key: stat.key, label: `${m.abbr} ${stat.label}`, color: CHART_BLUE, values: main.values }]
  let overlayLabel: string | null = null
  if (isPro && layers.overlay === 'other' && other) {
    overlayLabel = `${meta[1 - index].abbr} ${stat.label}`
    series.push({ key: 'overlay', label: overlayLabel, color: CHART_ORANGE, dash: '5 3', values: alignRight(windowValues(other, stat.key, w).slice(Math.max(0, w - 1)), main.values.length) })
  } else if (isPro && layers.overlay !== 'none' && layers.overlay !== 'other') {
    const os = stats.find((s) => s.key === layers.overlay)
    if (os) {
      overlayLabel = `${m.abbr} ${os.label}`
      series.push({ key: 'overlay', label: overlayLabel, color: CHART_ORANGE, dash: '5 3', values: windowValues(club, os.key, w).slice(main.first) })
    }
  }

  const ww = marker ? withWithout(club, stat, marker.flags) : null
  const markerName = marker?.label.replace(/\s\(\d+\)$/, '') ?? ''

  return (
    <div className="space-y-4">
      {header}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-1.5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold">{stat.label} · {w === 1 ? 'game by game' : `rolling ${w}-game`}</p>
          <p className="text-[11px] font-mono text-stone-700">
            <span className="font-bold text-[15px] text-stone-900">{main.latest != null ? formatStat(stat.format, main.latest) : '—'}</span>
            <span className="text-stone-400"> now · n = {main.n} {sampleUnit}</span>
          </p>
        </div>
        {(overlayLabel || marker) && (
          <div className="mb-1">
            <ChartLegend items={[
              { label: `${m.abbr} ${stat.label}`, color: CHART_BLUE },
              ...(overlayLabel ? [{ label: overlayLabel, color: CHART_ORANGE, dash: true }] : []),
              ...(marker ? [{ label: `${markerName} ${marker.group.startsWith('Games vs') ? 'faced' : 'started'}`, color: CHART_ORANGE, dot: true }] : []),
            ]} />
          </div>
        )}
        <LineChart
          labels={main.labels} series={series} dots={layers.dots} marks={marks}
          markLabel={marker ? `${markerName}` : undefined}
          baseline={{ value: base?.value ?? null, label: base?.label ?? '' }}
          format={(v) => formatStat(stat.format, v)}
          ariaLabel={`${m.abbr} ${w === 1 ? 'game-by-game' : `rolling ${w}-game`} ${stat.label}`}
        />
        <p className="text-[10px] font-sans mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          <Delta stat={stat} value={main.latest} base={base?.value ?? null} />
          {base?.value != null && <span className="font-mono text-stone-400">{base.label}: {formatStat(stat.format, base.value)}</span>}
        </p>

        <div className="mt-2"><FlagSelect markers={club.markers} value={markerId} onChange={setMarkerId} isPro={isPro} prompt={flagPrompt} /></div>
        {ww && (
          <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] font-sans text-stone-700 leading-relaxed">
            <p><span className="font-semibold">{stat.label} in games {marker!.group.startsWith('Games vs') ? 'vs' : 'with'} {markerName}{marker!.group.startsWith('Games vs') ? '' : ' starting'}:</span>{' '}
              <span className="font-mono">{ww.on.value != null ? formatStat(stat.format, ww.on.value) : '—'}</span> <span className="text-stone-400 font-mono">({ww.on.games} games · {ww.on.pa} {sampleUnit})</span></p>
            <p><span className="font-semibold">All other games:</span>{' '}
              <span className="font-mono">{ww.off.value != null ? formatStat(stat.format, ww.off.value) : '—'}</span> <span className="text-stone-400 font-mono">({ww.off.games} games · {ww.off.pa} {sampleUnit})</span></p>
            {(ww.on.games < 5 || ww.off.games < 5) && <p className="text-[10px] text-amber-700 mt-0.5">Fewer than 5 games on one side — treat as a look, not a conclusion.</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tiles.map((key) => {
          const t = stats.find((s) => s.key === key)
          if (!t) return null
          const c = chartFor(club, t, w)
          const b = club.baseline[t.key]
          const isOpen = !!open[key]
          return (
            <button key={key} type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
              className={`text-left rounded-xl border px-2.5 py-2 bg-white transition hover:border-stone-400 ${isOpen ? 'border-stone-900' : 'border-stone-200'}`}>
              <div className="flex items-baseline justify-between gap-1">
                <p className="text-[9.5px] font-mono uppercase tracking-wider text-stone-500 font-semibold truncate">{t.label}</p>
                <span aria-hidden className="text-[9px] text-stone-400">{isOpen ? '−' : '+'}</span>
              </div>
              <p className="text-[16px] font-mono font-bold text-stone-900 leading-tight">{c.latest != null ? formatStat(t.format, c.latest) : '—'}</p>
              <div className="mt-1">
                <LineChart compact labels={c.labels} series={[{ key, label: t.label, color: CHART_BLUE, values: c.values }]}
                  baseline={{ value: b?.value ?? null, label: '' }} format={(v) => formatStat(t.format, v)} ariaLabel={`${m.abbr} ${t.label} trend`} />
              </div>
              <p className="text-[9px] font-mono text-stone-300 mt-0.5">{isOpen ? 'Tap to collapse' : 'Tap to expand'}</p>
            </button>
          )
        })}
      </div>

      {tiles.filter((k) => open[k]).map((key) => {
        const t = stats.find((s) => s.key === key)
        if (!t) return null
        const c = chartFor(club, t, w)
        const b = club.baseline[t.key]
        return (
          <div key={key} className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold">{t.label} · {w === 1 ? 'game by game' : `rolling ${w}-game`}</p>
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [key]: false }))} className="text-[9px] font-mono uppercase tracking-widest text-stone-400 hover:text-stone-700">Close ✕</button>
            </div>
            <LineChart labels={c.labels} series={[{ key, label: t.label, color: CHART_BLUE, values: c.values }]} dots={layers.dots}
              baseline={{ value: b?.value ?? null, label: b?.label ?? '' }} format={(v) => formatStat(t.format, v)} ariaLabel={`${m.abbr} ${t.label} rolling ${w}-game`} />
            <p className="text-[10px] font-sans text-stone-500 mt-1">{t.hint}</p>
          </div>
        )
      })}
    </div>
  )
}

export default function StatExplorer({ stats, clubs, meta, tiles, defaultStat, defaultWindow, sampleUnit, gameUnit, isPro, flagPrompt }: Props) {
  const [statKey, setStatKey] = useState(defaultStat)
  const windows = clubs.find(Boolean)?.windows ?? [defaultWindow]
  const [w, setW] = useState(windows.includes(defaultWindow) ? defaultWindow : windows[0])
  const [layers, setLayers] = useState<Layers>({ dots: false, overlay: 'none' })
  const stat = stats.find((s) => s.key === statKey) ?? stats[0]
  const groups = useMemo(() => {
    const out: { name: string; items: ExplorerStat[] }[] = []
    for (const s of stats) {
      const g = out.find((x) => x.name === s.group)
      if (g) g.items.push(s); else out.push({ name: s.group, items: [s] })
    }
    return out
  }, [stats])
  const sameUnits = stats.filter((s) => s.format === stat.format && s.key !== stat.key)
  const overlay = layers.overlay === 'other' || sameUnits.some((s) => s.key === layers.overlay) ? layers.overlay : 'none'
  const perPoint = avgSample(clubs.find(Boolean) ?? undefined, w)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold">Chart any stat</p>
          <div className="flex items-center gap-1" role="group" aria-label="Rolling window">
            <span className="text-[10px] font-mono text-stone-500 mr-1">Rolling</span>
            {windows.map((x) => (
              <button key={x} type="button" aria-pressed={w === x} onClick={() => setW(x)}
                title={x === 1 ? 'One game per point — the noisiest view' : `Each point averages the last ${x} games (≈ ${avgSample(clubs.find(Boolean) ?? undefined, x)} ${sampleUnit})`}
                className={`text-[10px] font-mono px-2 py-1 rounded-md border transition ${w === x ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'}`}>{x === 1 ? '1 (single game)' : x}</button>
            ))}
            <span className="text-[10px] font-mono text-stone-500 ml-1">{gameUnit}</span>
          </div>
          <p className="text-[10px] font-mono text-stone-400">{w === 1 ? 'one game per point' : `≈ ${perPoint} ${sampleUnit} behind each point`}</p>
        </div>

        <details className="text-[11px] font-sans text-stone-600">
          <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-wider text-stone-500 hover:text-stone-800">Why a rolling window?</summary>
          <div className="mt-1.5 space-y-1 leading-relaxed max-w-3xl">
            <p>One game is a tiny sample — a lineup gets only ~35 plate appearances (a pen faces ~25 batters), so a single game can swing a rate stat wildly on luck alone. A rolling window averages the last <em>N</em> games and slides forward one game at a time, so the line shows direction instead of noise.</p>
            <p><span className="font-semibold">3 games</span> is the shortest window that still smooths anything: it reacts fast, so it&apos;s the one that shows a streak starting — and it will still jump around. <span className="font-semibold">7 games</span> (the default) is a week of baseball, enough volume to trust the shape. <span className="font-semibold">15 games</span> is the window behind the plain-language read at the top of the section.</p>
            <p>The trade-off is always lag versus noise: shorter windows react sooner but overreact; longer windows are steadier but slow to notice a real change. The sample size (n) is shown beside every chart so you can judge how much weight a point deserves.</p>
          </div>
        </details>

        <div className="space-y-1.5">
          {groups.map((g) => (
            <div key={g.name} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-mono uppercase tracking-wider text-stone-400 w-24 shrink-0">{g.name}</span>
              {g.items.map((s) => (
                <button key={s.key} type="button" aria-pressed={statKey === s.key} onClick={() => setStatKey(s.key)}
                  className={`text-[10.5px] font-mono px-2 py-1 rounded-md border transition ${statKey === s.key ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'}`}>{s.label}</button>
              ))}
            </div>
          ))}
        </div>
        <p className="text-[11px] font-sans text-stone-500"><span className="font-semibold text-stone-700">{stat.label}:</span> {stat.hint}</p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 border-t border-stone-200">
          <p className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold">Chart layers</p>
          <label className="inline-flex items-center gap-1.5 text-[10.5px] font-mono text-stone-600 cursor-pointer">
            <input type="checkbox" checked={layers.dots} onChange={(e) => setLayers((l) => ({ ...l, dots: e.target.checked }))} /> Dots on every game
          </label>
          <label className="inline-flex flex-wrap items-center gap-1.5 text-[10.5px] font-mono text-stone-600">
            <span>Overlay{!isPro && <ProChip />}</span>
            {isPro ? (
              <select value={overlay} onChange={(e) => setLayers((l) => ({ ...l, overlay: e.target.value }))}
                className="text-[11px] font-sans text-stone-700 border border-stone-200 rounded-md px-1.5 py-1 bg-white">
                <option value="none">None</option>
                {clubs.length > 1 && <option value="other">The other club — same stat</option>}
                {sameUnits.length > 0 && <optgroup label="Another stat (same units, same axis)">{sameUnits.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>}
              </select>
            ) : (
              <Link href="/pricing" className="text-[10.5px] font-sans text-orange-600 hover:text-orange-700 underline decoration-dotted">Compare clubs or stats on one chart — Pro</Link>
            )}
          </label>
          <p className="text-[10px] font-sans text-stone-400">Flag a player&apos;s starts under each chart{!isPro && ' (Pro)'}.</p>
        </div>
      </div>

      <div className={`grid gap-6 ${clubs.length > 1 ? 'lg:grid-cols-2 lg:divide-x lg:divide-stone-100' : ''}`}>
        <ClubPanel index={0} clubs={clubs} meta={meta} stats={stats} stat={stat} w={w} tiles={tiles} sampleUnit={sampleUnit} layers={{ ...layers, overlay }} isPro={isPro} flagPrompt={flagPrompt} />
        {/* A single-club view (the team page's Club Desk) has no second club to draw. */}
        {clubs.length > 1 && (
          <div className="lg:pl-6"><ClubPanel index={1} clubs={clubs} meta={meta} stats={stats} stat={stat} w={w} tiles={tiles} sampleUnit={sampleUnit} layers={{ ...layers, overlay }} isPro={isPro} flagPrompt={flagPrompt} /></div>
        )}
      </div>
    </div>
  )
}
