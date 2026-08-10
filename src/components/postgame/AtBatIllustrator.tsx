// src/components/postgame/AtBatIllustrator.tsx
//
// Savant's "Illustrator" plots one zone chart per pitcher for the whole
// outing. This is the finer-grained version you asked for: one mini zone
// chart PER PLATE APPEARANCE, with pitch-sequence numbers, so you can see
// how a pitcher actually sequenced one batter — something the aggregate
// PitchLocationChart in PitcherDeepDive can never show.
//
// Reuses the same zone-frame math as PitchLocationChart (average strike
// zone top/bottom for whichever pitches in THIS at-bat have coordinates),
// just at a much smaller size.

import type { AtBatSummary, PitchRecord } from '@/types/postgame'

const TYPE_COLORS: Record<string, string> = {
  FF: '#FF5722', SI: '#1A1A1A', ST: '#FDE047', SL: '#2C6E8F',
  CH: '#6b6b66', FS: '#8B5CF6', CU: '#15803d', KC: '#DC2626',
  FC: '#EA580C',
}
const DEFAULT_COLOR = '#A8A29E'

// Mirrors box-score eventType strings rather than inventing new codes.
const RESULT_BADGES: Record<string, { label: string; kind: 'k' | 'hit' | 'other' }> = {
  strikeout: { label: 'K', kind: 'k' },
  walk: { label: 'BB', kind: 'other' },
  single: { label: '1B', kind: 'hit' },
  double: { label: '2B', kind: 'hit' },
  triple: { label: '3B', kind: 'hit' },
  home_run: { label: 'HR', kind: 'hit' },
  field_out: { label: 'Out', kind: 'other' },
  grounded_into_double_play: { label: 'GIDP', kind: 'other' },
  force_out: { label: 'FC', kind: 'other' },
  hit_by_pitch: { label: 'HBP', kind: 'other' },
  sac_fly: { label: 'SF', kind: 'other' },
  sac_bunt: { label: 'SAC', kind: 'other' },
}

function resultBadge(eventType: string): { label: string; kind: 'k' | 'hit' | 'other' } {
  return RESULT_BADGES[eventType] ?? { label: eventType.replace(/_/g, ' '), kind: 'other' }
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function AtBatZoneChart({ pitches }: { pitches: PitchRecord[] }) {
  const withCoords = pitches.filter(p => p.plateX != null && p.plateZ != null)
  const S = 120, PAD = 12
  const xScale = (ftX: number) => PAD + ((ftX + 2.5) / 5) * (S - PAD * 2)
  const yScale = (ftZ: number) => S - PAD - ((ftZ - 0) / 5) * (S - PAD * 2)

  const avgTop = avg(withCoords.map(p => p.strikeZoneTop).filter((n): n is number => n != null)) ?? 3.4
  const avgBottom = avg(withCoords.map(p => p.strikeZoneBottom).filter((n): n is number => n != null)) ?? 1.6
  const zoneLeft = xScale(-0.7083)
  const zoneRight = xScale(0.7083)
  const zoneTop = yScale(avgTop)
  const zoneBottom = yScale(avgBottom)

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full h-auto" role="img" aria-label="At-bat pitch sequence">
      <rect x={0} y={0} width={S} height={S} fill="#fff" />
      <rect x={zoneLeft} y={zoneTop} width={zoneRight - zoneLeft} height={zoneBottom - zoneTop} fill="none" stroke="#1A1A1A" strokeWidth={1} />
      {withCoords.length === 0 ? (
        <text x={S / 2} y={S / 2} textAnchor="middle" fontSize={8} fill="#A8A29E" fontFamily="JetBrains Mono, monospace">no coords</text>
      ) : (
        withCoords.map((p, i) => (
          <g key={i}>
            <circle
              cx={xScale(p.plateX!)} cy={yScale(p.plateZ!)} r={7}
              fill={TYPE_COLORS[p.typeCode ?? ''] ?? DEFAULT_COLOR}
              fillOpacity={0.85} stroke="#fff" strokeWidth={1}
            />
            <text
              x={xScale(p.plateX!)} y={yScale(p.plateZ!) + 3} textAnchor="middle"
              fontSize={8} fontWeight={700} fill="#fff" fontFamily="JetBrains Mono, monospace"
            >
              {p.pitchNumber}
            </text>
          </g>
        ))
      )}
    </svg>
  )
}

export function AtBatIllustratorGrid({
  pitcherName,
  atBats,
  pitchLog,
}: {
  pitcherName: string
  atBats: AtBatSummary[]
  pitchLog: PitchRecord[]
}) {
  if (atBats.length === 0) {
    return <div className="font-mono text-[11px] text-stone-400 py-4">No at-bats logged for {pitcherName}.</div>
  }

  const typesPresent = Array.from(new Set(pitchLog.map(p => p.typeCode).filter((t): t is string => !!t)))

  return (
    <div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
        {typesPresent.map(t => (
          <span key={t} className="inline-flex items-center gap-1 font-mono text-[9px] text-stone-500">
            <span className="inline-block w-2 h-2" style={{ background: TYPE_COLORS[t] ?? DEFAULT_COLOR }} />
            {pitchLog.find(p => p.typeCode === t)?.typeDescription ?? t}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {atBats.map(ab => {
          const pitches = pitchLog
            .filter(p => p.atBatIndex === ab.atBatIndex)
            .sort((a, b) => a.pitchNumber - b.pitchNumber)
          const badge = resultBadge(ab.eventType)
          return (
            <div key={ab.atBatIndex} className="border-2 border-stone-200 bg-white p-2.5">
              <div className="flex items-start justify-between gap-1 mb-1.5">
                <div className="font-serif font-semibold text-[11.5px] leading-tight truncate" title={ab.batterName}>
                  {ab.batterName}
                </div>
                <span
                  className="font-mono text-[9px] font-bold px-1.5 py-0.5 whitespace-nowrap"
                  style={{
                    background: badge.kind === 'k' ? '#FF5722' : badge.kind === 'hit' ? '#15803d' : '#E4DFD4',
                    color: badge.kind === 'other' ? '#1A1A1A' : '#fff',
                  }}
                >
                  {badge.label}
                </span>
              </div>
              <AtBatZoneChart pitches={pitches} />
              <div className="font-mono text-[9px] text-stone-400 mt-1">
                {ab.halfInning === 'top' ? '▲' : '▼'} Inn {ab.inning} · {pitches.length}p
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}