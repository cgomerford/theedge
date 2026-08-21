'use client'

// src/components/admin/YesterdayPerformersSection.tsx

import type {
  EnrichedBatterPerformance,
  EnrichedPitcherPerformance,
  PitchSeen,
  Grade,
  LongestAB,
} from '@/lib/mlb-recap'

type Props = {
  batters: EnrichedBatterPerformance[]
  pitchers: EnrichedPitcherPerformance[]
  dateLabel: string
}

// ─── Pitch type colors ──────────────────────────────────────────────────

const PITCH_COLORS: Record<string, string> = {
  FF: '#DC2626', SI: '#F97316', FC: '#FB923C', CH: '#3B82F6',
  SL: '#8B5CF6', CU: '#10B981', KC: '#059669', ST: '#EC4899',
  FS: '#06B6D4', SV: '#14B8A6', KN: '#6B7280', EP: '#6B7280',
}
function pitchColor(code: string): string {
  return PITCH_COLORS[code] ?? '#78716c'
}

// ─── Grade badge ────────────────────────────────────────────────────────

function gradeColor(g: string): string {
  if (g.startsWith('A')) return '#15803d'
  if (g.startsWith('B')) return '#1A1A1A'
  if (g.startsWith('C')) return '#FF5722'
  return '#DC2626'
}

function GradeBadge({ grade }: { grade: Grade }) {
  const c = gradeColor(grade)
  return (
    <div
      style={{
        fontFamily: "'Bebas Neue',sans-serif",
        fontSize: 28,
        lineHeight: 1,
        color: c,
        border: `2.5px solid ${c}`,
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {grade}
    </div>
  )
}

// ─── Mini stat ──────────────────────────────────────────────────────────

function S({
  label,
  value,
  hot,
  cold,
}: {
  label: string
  value: string | null
  hot?: boolean
  cold?: boolean
}) {
  if (value == null) return null
  return (
    <div className="flex items-baseline justify-between gap-2 py-[2px]">
      <span className="font-mono text-[9px] uppercase tracking-wider text-stone-400">
        {label}
      </span>
      <span
        className={`font-mono text-[12px] font-bold tabular-nums ${
          hot ? 'text-green-700' : cold ? 'text-red-600' : 'text-stone-900'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Zone chart ─────────────────────────────────────────────────────────

const VB_W = 140
const VB_H = 168
const X_MIN = -2.2
const X_MAX = 2.2
const Z_MIN = 0
const Z_MAX = 5
const PLATE_HW = 0.708

function toSVG(x: number, z: number) {
  return {
    sx: ((x - X_MIN) / (X_MAX - X_MIN)) * VB_W,
    sy: VB_H - ((z - Z_MIN) / (Z_MAX - Z_MIN)) * VB_H,
  }
}

function ZoneChart({
  pitches,
  szTop,
  szBot,
}: {
  pitches: PitchSeen[]
  szTop: number
  szBot: number
}) {
  if (pitches.length === 0) {
    return (
      <div className="text-[8px] font-mono text-stone-400 italic text-center py-6">
        No pitch data
      </div>
    )
  }

  const tl = toSVG(-PLATE_HW, szTop)
  const br = toSVG(PLATE_HW, szBot)

  return (
    <svg width="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ display: 'block' }}>
      <rect
        x={tl.sx}
        y={tl.sy}
        width={br.sx - tl.sx}
        height={br.sy - tl.sy}
        fill="none"
        stroke="#a8a29e"
        strokeWidth={1.5}
        opacity={0.7}
      />
      {pitches.map((p, i) => {
        const { sx, sy } = toSVG(p.pX, p.pZ)
        const isNotable = p.isInPlay || p.isWhiff
        return (
          <circle
            key={i}
            cx={sx}
            cy={sy}
            r={isNotable ? 3.8 : 2.3}
            fill={pitchColor(p.code)}
            stroke={isNotable ? '#1c1917' : 'none'}
            strokeWidth={isNotable ? 1.0 : 0}
            opacity={isNotable ? 0.95 : 0.55}
          />
        )
      })}
    </svg>
  )
}

// Clear size key — high contrast so it always shows
function ZoneChartKey() {
  return (
    <div className="mt-2 flex items-center justify-center gap-4">
      <div className="flex items-center gap-1.5">
        <span
          className="rounded-full flex-shrink-0 border-2 border-stone-800"
          style={{ width: 10, height: 10, background: '#78716c' }}
        />
        <span className="font-mono text-[9px] font-medium text-stone-700">
          contact / whiff
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="rounded-full flex-shrink-0 border border-stone-400"
          style={{ width: 6, height: 6, background: '#a8a29e', opacity: 0.7 }}
        />
        <span className="font-mono text-[9px] text-stone-500">
          take / foul
        </span>
      </div>
    </div>
  )
}

// ─── Usage bar ──────────────────────────────────────────────────────────

function UsageBar({
  data,
  total,
}: {
  data: Record<string, { code: string; description: string; count: number }>
  total: number
}) {
  const sorted = Object.values(data).sort((a, b) => b.count - a.count)
  if (sorted.length === 0 || total === 0) return null

  return (
    <div>
      <div className="flex h-[18px] overflow-hidden rounded-sm">
        {sorted.map((d) => {
          const pct = Math.round((d.count / total) * 100)
          return (
            <div
              key={d.code}
              style={{
                flex: d.count,
                background: pitchColor(d.code),
                minWidth: pct >= 8 ? 18 : 12,
              }}
              className="flex items-center justify-center text-[9px] font-mono font-bold text-white tabular-nums"
              title={`${d.description}: ${pct}%`}
            >
              {pct >= 8 ? `${pct}` : ''}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1.5">
        {sorted.map((d) => {
          const pct = Math.round((d.count / total) * 100)
          return (
            <span
              key={d.code}
              className="flex items-center gap-1 text-[9px] font-mono text-stone-600"
            >
              <span
                className="flex-shrink-0 rounded-sm"
                style={{ width: 7, height: 7, background: pitchColor(d.code) }}
              />
              <span className="font-semibold text-stone-800">{d.code}</span>
              <span className="text-stone-400">{pct}%</span>
              <span className="text-stone-400">({d.count})</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ─── Pitch type table ───────────────────────────────────────────────────

function PitchTable({
  data,
  avgVelo,
  total,
}: {
  data: Record<string, { code: string; description: string; count: number }>
  avgVelo: Record<string, number>
  total: number
}) {
  const sorted = Object.values(data).sort((a, b) => b.count - a.count)
  if (sorted.length === 0) return null

  return (
    <div className="mt-2 space-y-0.5">
      {sorted.map((d) => {
        const pct = Math.round((d.count / total) * 100)
        const velo = avgVelo[d.code]
        return (
          <div key={d.code} className="flex items-center gap-1.5 py-[1px]">
            <span
              className="flex-shrink-0 rounded-sm"
              style={{ width: 5, height: 5, background: pitchColor(d.code) }}
            />
            <span className="font-mono text-[10px] text-stone-700 flex-1 truncate">
              {d.description}
            </span>
            <span className="font-mono text-[10px] text-stone-500 w-7 text-right tabular-nums">
              {pct}%
            </span>
            <span className="font-mono text-[10px] text-stone-400 w-5 text-right tabular-nums">
              {d.count}
            </span>
            {velo != null && (
              <span className="font-mono text-[10px] font-semibold text-stone-800 w-11 text-right tabular-nums">
                {velo.toFixed(1)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Batter card ────────────────────────────────────────────────────────

function BatterCard({ b }: { b: EnrichedBatterPerformance }) {
  const d = b.pitchData
  const la = d.longestAB

  return (
    <div className="border border-stone-200 bg-white rounded-sm overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-2.5 p-3 pb-2.5 border-b border-stone-100">
        <GradeBadge grade={b.grade} />
        <img
          src={b.headshot}
          alt={b.name}
          className="w-10 h-10 rounded-full object-cover bg-stone-100 flex-shrink-0 mt-0.5"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <div className="flex-1 min-w-0">
          <div
            className="font-bold text-[15px] text-stone-900 truncate leading-tight"
            style={{ fontFamily: "'Fraunces',serif" }}
          >
            {b.name}
          </div>
          <div className="font-mono text-[9px] text-stone-400 uppercase mt-0.5">
            {b.teamAbbr} · Score {b.score.toFixed(1)}
          </div>
          <div
            className="font-mono text-[12px] font-bold mt-1 inline-block px-2 py-0.5 rounded-sm"
            style={{ background: '#FFF7ED', color: '#EA580C' }}
          >
            {b.line}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="font-mono text-[8px] text-stone-400 uppercase tracking-wider">
            Season
          </div>
          {b.seasonAVG && (
            <div className="font-mono text-[11px] text-stone-700 tabular-nums">
              {b.seasonAVG} AVG
            </div>
          )}
          {b.seasonOPS && (
            <div className="font-mono text-[11px] text-stone-700 tabular-nums">
              {b.seasonOPS} OPS
            </div>
          )}
          {b.seasonHR != null && (
            <div className="font-mono text-[11px] text-stone-700 tabular-nums">
              {b.seasonHR} HR
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-[1fr_1.15fr_132px] gap-3 p-3 pt-2.5">
        {/* Col 1 — Exit Velocity + Discipline */}
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-1.5">
            Exit Velocity
          </div>
          <S
            label="Avg EV"
            value={d.avgExitVelo ? `${d.avgExitVelo.toFixed(1)}` : null}
          />
          <S
            label="Max EV"
            value={d.maxExitVelo ? `${d.maxExitVelo.toFixed(1)}` : null}
            hot={d.maxExitVelo != null && d.maxExitVelo >= 105}
          />
          <S
            label="Hard Hit"
            value={d.hardHitRate != null ? `${d.hardHitRate.toFixed(0)}%` : null}
            hot={d.hardHitRate != null && d.hardHitRate >= 50}
          />

          <div className="font-mono text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-1.5 mt-3">
            Discipline
          </div>
          <S
            label="Chase"
            value={d.chaseRate != null ? `${d.chaseRate.toFixed(0)}%` : null}
            hot={d.chaseRate != null && d.chaseRate <= 15}
            cold={d.chaseRate != null && d.chaseRate >= 40}
          />
          <S
            label="Whiff"
            value={d.whiffRate != null ? `${d.whiffRate.toFixed(0)}%` : null}
            hot={d.whiffRate != null && d.whiffRate <= 15}
          />
          <S
            label="SwStr%"
            value={d.swStrRate != null ? `${d.swStrRate.toFixed(0)}%` : null}
          />
        </div>

        {/* Col 2 — Pitches Seen */}
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-1.5">
            Pitches Seen
          </div>
          <UsageBar data={d.pitchTypeCounts} total={d.totalPitches} />
          <PitchTable
            data={d.pitchTypeCounts}
            avgVelo={d.avgVeloByPitch}
            total={d.totalPitches}
          />
          <div className="font-mono text-[9px] text-stone-400 mt-1.5">
            {d.totalPitches} total pitches
          </div>

          {la && (
            <div className="mt-2.5 pt-2 border-t border-stone-100">
              <div className="font-mono text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-0.5">
                Longest AB
              </div>
              <div className="font-mono text-[11px] text-stone-800">
                <span className="font-bold">{la.pitchCount} pitches</span>
                <span className="text-stone-400"> · </span>
                {la.result}
                <span className="text-stone-400"> · Inn {la.inning}</span>
              </div>
            </div>
          )}
        </div>

        {/* Col 3 — Zone */}
        <div>
          <ZoneChart
            pitches={d.pitchesSeen}
            szTop={d.strikeZoneTop}
            szBot={d.strikeZoneBottom}
          />
          <ZoneChartKey />
        </div>
      </div>
    </div>
  )
}

// ─── Pitcher card ───────────────────────────────────────────────────────

function PitcherCard({ p }: { p: EnrichedPitcherPerformance }) {
  const d = p.pitchData
  const la = d.longestAB

  return (
    <div className="border border-stone-200 bg-white rounded-sm overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-2.5 p-3 pb-2.5 border-b border-stone-100">
        <GradeBadge grade={p.grade} />
        <img
          src={p.headshot}
          alt={p.name}
          className="w-10 h-10 rounded-full object-cover bg-stone-100 flex-shrink-0 mt-0.5"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <div className="flex-1 min-w-0">
          <div
            className="font-bold text-[15px] text-stone-900 truncate leading-tight"
            style={{ fontFamily: "'Fraunces',serif" }}
          >
            {p.name}
          </div>
          <div className="font-mono text-[9px] text-stone-400 uppercase mt-0.5">
            {p.teamAbbr} · GS {p.score.toFixed(0)}
          </div>
          <div
            className="font-mono text-[12px] font-bold mt-1 inline-block px-2 py-0.5 rounded-sm"
            style={{ background: '#FFF7ED', color: '#EA580C' }}
          >
            {p.line}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="font-mono text-[8px] text-stone-400 uppercase tracking-wider">
            Season
          </div>
          {p.seasonERA && (
            <div className="font-mono text-[11px] text-stone-700 tabular-nums">
              {p.seasonERA} ERA
            </div>
          )}
          {p.seasonWHIP && (
            <div className="font-mono text-[11px] text-stone-700 tabular-nums">
              {p.seasonWHIP} WHIP
            </div>
          )}
          {p.seasonK != null && (
            <div className="font-mono text-[11px] text-stone-700 tabular-nums">
              {p.seasonK} K
            </div>
          )}
        </div>
      </div>

      {/* Full-width usage */}
      <div className="px-3 pt-2.5 pb-1">
        <div className="font-mono text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-1.5">
          Pitch Usage
        </div>
        <UsageBar data={d.pitchTypeCounts} total={d.totalPitches} />
      </div>

      {/* Body */}
      <div className="grid grid-cols-[1fr_1.15fr_132px] gap-3 p-3 pt-2">
        {/* Col 1 */}
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-1.5">
            Command
          </div>
          <S
            label="Zone%"
            value={d.zoneRate != null ? `${d.zoneRate.toFixed(0)}%` : null}
            hot={d.zoneRate != null && d.zoneRate >= 50}
          />
          <S
            label="1st K%"
            value={
              d.firstPitchStrikeRate != null
                ? `${d.firstPitchStrikeRate.toFixed(0)}%`
                : null
            }
            hot={d.firstPitchStrikeRate != null && d.firstPitchStrikeRate >= 65}
          />
          <S
            label="CSW%"
            value={d.cswRate != null ? `${d.cswRate.toFixed(0)}%` : null}
            hot={d.cswRate != null && d.cswRate >= 30}
          />

          <div className="font-mono text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-1.5 mt-3">
            Swing & Miss
          </div>
          <S
            label="Whiff%"
            value={d.whiffRate != null ? `${d.whiffRate.toFixed(0)}%` : null}
            hot={d.whiffRate != null && d.whiffRate >= 25}
          />
          <S
            label="Chase%"
            value={d.chaseRate != null ? `${d.chaseRate.toFixed(0)}%` : null}
            hot={d.chaseRate != null && d.chaseRate >= 35}
          />
          <S
            label="SwStr%"
            value={d.swStrRate != null ? `${d.swStrRate.toFixed(0)}%` : null}
            hot={d.swStrRate != null && d.swStrRate >= 12}
          />
        </div>

        {/* Col 2 */}
        <div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-1.5">
            Velo by Type
          </div>
          <PitchTable
            data={d.pitchTypeCounts}
            avgVelo={d.avgVeloByPitch}
            total={d.totalPitches}
          />
          <div className="font-mono text-[9px] text-stone-400 mt-1.5">
            {d.totalPitches} total pitches
          </div>

          {la && (
            <div className="mt-2.5 pt-2 border-t border-stone-100">
              <div className="font-mono text-[9px] uppercase tracking-widest text-orange-600 font-bold mb-0.5">
                Longest AB Faced
              </div>
              <div className="font-mono text-[11px] text-stone-800">
                <span className="font-bold">{la.pitchCount} pitches</span>
                <span className="text-stone-400"> · </span>
                {la.result}
                <span className="text-stone-400"> · Inn {la.inning}</span>
              </div>
            </div>
          )}
        </div>

        {/* Col 3 */}
        <div>
          <ZoneChart
            pitches={d.pitchesSeen}
            szTop={d.strikeZoneTop}
            szBot={d.strikeZoneBottom}
          />
          <ZoneChartKey />
        </div>
      </div>
    </div>
  )
}

// ─── Section ────────────────────────────────────────────────────────────

export default function YesterdayPerformersSection({
  batters,
  pitchers,
  dateLabel,
}: Props) {
  if (batters.length === 0 && pitchers.length === 0) {
    return (
      <div className="border border-dashed border-stone-200 p-4 text-[13px] font-mono text-stone-400 bg-white rounded-sm">
        No graded performances for {dateLabel} yet.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {batters.length > 0 && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-orange-600 mb-2.5 font-bold">
            ⊕ Top Batters
          </div>
          <div className="grid gap-3.5">
            {batters.map((b) => (
              <BatterCard key={b.personId} b={b} />
            ))}
          </div>
        </div>
      )}

      {pitchers.length > 0 && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-orange-600 mb-2.5 font-bold">
            ⊕ Top Pitchers
          </div>
          <div className="grid gap-3.5">
            {pitchers.map((p) => (
              <PitcherCard key={p.personId} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}