// src/components/PostGamePitcherArsenalCard.tsx
'use client'

// Post-game, game-specific arsenal card — this outing's pitch-by-pitch
// data. Light theme to match the rest of the site (was dark, reverted per
// feedback). Each per-pitch-type location grid is now clickable — opens
// a centered modal with a larger chart and real hover tooltips per pitch
// (inning, count, velo, outcome, batter), reading straight off the
// extended ZoneLocationPoint shape in pitcher-arsenal-card.ts.
//
// Stuff+/Loc+/Tun+/Pitch+ omitted — proprietary Savant models, not
// derivable from raw pitch data. VAA/Release Height/Extension omitted —
// need raw fields not currently captured in PitchRecord.

import { useState } from 'react'
import type { PitcherGameLine, PitchRecord } from '@/types/postgame'
import { buildArsenalCard, computeStrikePct, computeOverallWhiffPct, type ArsenalCardPitchType, type ZoneLocationPoint } from '@/lib/pitcher-arsenal-card'

function mlbHeadshot(pitcherId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${pitcherId}/headshot/silo/current`
}
function outsToIP(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`
}

function pitchTooltip(p: ZoneLocationPoint): string {
  const half = p.halfInning === 'top' ? '▲' : '▼'
  const count = `${p.countAfter.balls}-${p.countAfter.strikes}`
  const velo = p.velo != null ? `${p.velo.toFixed(1)} mph` : '—'
  return `${p.inning}${half} · ${count} count · ${velo} · vs ${p.batterName} · ${p.outcome}`
}

function MovementChart({ points, colorFor }: { points: { typeCode: string; hBreak: number; vBreak: number }[]; colorFor: (c: string) => string }) {
  const SIZE = 260
  const RANGE = 24
  const toSvg = (v: number) => SIZE / 2 + (v / RANGE) * (SIZE / 2 - 12)
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[280px] mx-auto">
      <line x1={0} y1={SIZE / 2} x2={SIZE} y2={SIZE / 2} stroke="#e7e5e4" strokeWidth={1} />
      <line x1={SIZE / 2} y1={0} x2={SIZE / 2} y2={SIZE} stroke="#e7e5e4" strokeWidth={1} />
      {points.map((p, i) => (
        <circle key={i} cx={toSvg(p.hBreak)} cy={toSvg(-p.vBreak)} r={4} fill={colorFor(p.typeCode)} fillOpacity={0.75} stroke="#fff" strokeWidth={0.5} />
      ))}
    </svg>
  )
}

// Small clickable preview tile — light theme, hover cue.
function MiniLocationGrid({
  points, count, onClick,
}: {
  points: ZoneLocationPoint[]
  count: number
  onClick: () => void
}) {
  const SIZE = 60
  const toX = (x: number) => SIZE / 2 + (x / 2.5) * (SIZE / 2 - 4)
  const toY = (z: number) => SIZE - ((z - 0.5) / 4) * SIZE
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative bg-stone-50 border border-stone-200 rounded hover:border-orange-400 hover:shadow-sm transition group"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0">
        <rect x={SIZE * 0.3} y={SIZE * 0.25} width={SIZE * 0.4} height={SIZE * 0.5} fill="none" stroke="#78716c40" strokeWidth={1} />
        {points.map((p, i) => (
          <circle key={i} cx={toX(p.plateX)} cy={toY(p.plateZ)} r={1.3} fill="#ea580c" fillOpacity={0.7} />
        ))}
      </svg>
      <span className="absolute bottom-0.5 right-1 text-stone-400 text-[8px] font-mono group-hover:text-orange-600">{count}</span>
      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-white/70">
        <span className="text-[8px] font-mono font-bold text-orange-600 uppercase tracking-wider">Enlarge</span>
      </span>
    </button>
  )
}

// Full-size chart with real hover tooltips — used both inside the modal
// and could be reused standalone later if needed.
function FullLocationChart({ points, color, typeName }: { points: ZoneLocationPoint[]; color: string; typeName: string }) {
  const SIZE = 400
  const toX = (x: number) => SIZE / 2 + (x / 2.5) * (SIZE / 2 - 20)
  const toY = (z: number) => SIZE - ((z - 0.5) / 4) * SIZE
  return (
    <div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[420px] mx-auto bg-stone-50 rounded-xl border border-stone-200">
        <rect x={SIZE * 0.3} y={SIZE * 0.25} width={SIZE * 0.4} height={SIZE * 0.5} fill="none" stroke="#78716c60" strokeWidth={1.5} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={toX(p.plateX)}
            cy={toY(p.plateZ)}
            r={6}
            fill={color}
            fillOpacity={0.75}
            stroke="#fff"
            strokeWidth={1}
            className="cursor-pointer hover:fill-opacity-100"
          >
            <title>{pitchTooltip(p)}</title>
          </circle>
        ))}
      </svg>
      <p className="text-center font-mono text-[10px] text-stone-400 mt-2">
        {points.length} {typeName} · hover a pitch for details
      </p>
    </div>
  )
}

// Centered modal overlay
function LocationModal({
  typeName, color, points, onClose,
}: {
  typeName: string
  color: string
  points: ZoneLocationPoint[]
  onClose: () => void
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-lg w-full p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <h3 className="font-serif font-semibold text-stone-900 text-base">{typeName}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 text-sm"
          >
            ✕
          </button>
        </div>
        <FullLocationChart points={points} color={color} typeName={typeName} />
      </div>
    </div>
  )
}

export default function PostGamePitcherArsenalCard({
  pitcher, pitches, teamColor,
}: {
  pitcher: PitcherGameLine
  pitches: PitchRecord[]
  teamColor: string
}) {
  const { types, movement, locationsByType } = buildArsenalCard(pitches)
  const strikePct = computeStrikePct(pitches)
  const whiffPct = computeOverallWhiffPct(pitches)
  const [expanded, setExpanded] = useState<ArsenalCardPitchType | null>(null)

  if (types.length === 0) {
    return <p className="text-xs font-serif italic text-stone-400 p-4">No pitch-level data for {pitcher.pitcherName} tonight.</p>
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-4" style={{ background: `${teamColor}12` }}>
        <img src={mlbHeadshot(pitcher.pitcherId)} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm" />
        <div className="flex-1">
          <h3 className="font-serif font-bold text-lg leading-tight text-stone-900">{pitcher.pitcherName}</h3>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-4 sm:grid-cols-7 divide-x divide-stone-100 bg-stone-50/60 border-y border-stone-100">
        {[
          ['IP', outsToIP(pitcher.outsRecorded)], ['H', pitcher.hitsAllowed], ['R', pitcher.runsAllowed],
          ['ER', pitcher.earnedRunsAllowed], ['K', pitcher.strikeouts],
          ['Strike%', strikePct != null ? `${strikePct}%` : '—'],
          ['Whiff%', whiffPct != null ? `${whiffPct}%` : '—'],
        ].map(([label, val]) => (
          <div key={label as string} className="px-2 py-3 text-center">
            <div className="font-mono text-sm font-bold text-stone-900">{val}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-stone-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Location grids + Movement chart */}
      <div className="p-4 grid md:grid-cols-[auto_1fr] gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="font-mono text-[8px] uppercase tracking-widest text-stone-400">By pitch type</p>
            <span className="font-mono text-[8px] text-orange-500">tap to enlarge</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {types.map(t => (
              <div key={t.typeCode} className="text-center">
                <span className="font-mono text-[8px] uppercase font-bold" style={{ color: t.color }}>{t.typeCode}</span>
                <MiniLocationGrid
                  points={locationsByType[t.typeCode] ?? []}
                  count={t.count}
                  onClick={() => setExpanded(t)}
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="font-mono text-[8px] uppercase tracking-widest text-stone-400 mb-2 text-center">Movement</p>
          <MovementChart points={movement} colorFor={c => types.find(t => t.typeCode === c)?.color ?? '#57534e'} />
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {types.map(t => (
              <div key={t.typeCode} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                <span className="font-mono text-[9px] text-stone-500">{t.typeName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Arsenal table */}
      <div className="p-4 pt-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-stone-100">
              {['Pitch', '#', 'Usage%', 'Velo', 'Spin', 'H Brk', 'V Brk', 'Zone%', 'Whiff%'].map((h, i) => (
                <th key={h} className={`py-2 font-mono text-[8px] uppercase tracking-wider text-stone-400 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {types.map(t => (
              <tr key={t.typeCode} className="border-b border-stone-50 last:border-0">
                <td className="py-2 pr-2">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: t.color }} />
                  <span className="font-serif text-stone-900">{t.typeName}</span>
                </td>
                <td className="text-right font-mono text-stone-700">{t.count}</td>
                <td className="text-right font-mono text-stone-700">{t.usagePct}%</td>
                <td className="text-right font-mono text-stone-700">{t.avgVelo ?? '—'}</td>
                <td className="text-right font-mono text-stone-700">{t.avgSpin ?? '—'}</td>
                <td className="text-right font-mono text-stone-700">{t.avgHBreak != null ? `${t.avgHBreak}"` : '—'}</td>
                <td className="text-right font-mono text-stone-700">{t.avgVBreak != null ? `${t.avgVBreak}"` : '—'}</td>
                <td className="text-right font-mono text-stone-700">{t.zonePct != null ? `${t.zonePct}%` : '—'}</td>
                <td className="text-right font-mono text-stone-700">{t.whiffPct != null ? `${t.whiffPct}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="font-mono text-[8px] text-stone-300 mt-3 leading-relaxed">
          Stuff+/Loc+/Tun+/Pitch+ not shown — proprietary Savant models, not derivable from raw pitch data.
          VAA/Release Height/Extension not shown — need additional raw fields not yet captured.
        </p>
      </div>

      {expanded && (
        <LocationModal
          typeName={expanded.typeName}
          color={expanded.color}
          points={locationsByType[expanded.typeCode] ?? []}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
  )
}