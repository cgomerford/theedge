'use client'

// src/components/PitcherBoxScoreCard.tsx
//
// New postgame section: a real pitching box score (SP, then bullpen, per
// team) — replaces nothing, sits alongside the existing TopPerformersBoard
// etc. in PostGameReportTab. Built against the NEW postgame-aggregate.ts
// data model (PitcherGameLine[] + pitchLog: PitchRecord[]), not the old
// postgame.ts leaderboard shape.
//
// Two assumptions flagged for George to confirm/override:
//
//   1. SP vs. bullpen role — PitcherGameLine has no role field. Derived
//      here as: for each team, whichever pitcher has the EARLIEST
//      atBatIndex in pitchLog is the SP; everyone else is bullpen, ordered
//      by their own first appearance. Breaks (mislabels, doesn't crash) on
//      opener/bullpen-game nights. See deriveRoles() below.
//
//   2. In-game pitch usage / sequencing — computed fresh from pitchLog,
//      NOT the season-aggregate pitcher-sequencing.ts data. Count at throw
//      is the previous pitch's countAfter (0-0 on the first pitch of an AB).
//      "What came next" is the following pitch in the SAME at-bat only.
//
// Sample sizes here are necessarily tiny (one game) — this is "what did he
// actually do tonight," not a reliable tendency. Copy reflects that.

import { useState, useMemo } from 'react'
import type { PitcherGameLine, PitchRecord } from '@/types/postgame'

type Props = {
  pitchers: PitcherGameLine[]
  pitchLog: PitchRecord[]
  awayTeamId: number
  homeTeamId: number
  awayAbbr: string
  homeAbbr: string
  awayColor: string
  homeColor: string
}

export type RoledPitcher = PitcherGameLine & { role: 'SP' | 'RP'; firstAtBatIndex: number }

export function deriveRoles(pitchers: PitcherGameLine[], pitchLog: PitchRecord[], teamId: number): RoledPitcher[] {
  const teamPitchers = pitchers.filter(p => p.teamId === teamId)

  const firstAppearance = new Map<number, number>()
  for (const pitch of pitchLog) {
    if (!firstAppearance.has(pitch.pitcherId) || pitch.atBatIndex < firstAppearance.get(pitch.pitcherId)!) {
      firstAppearance.set(pitch.pitcherId, pitch.atBatIndex)
    }
  }

  const withFirstAppearance = teamPitchers.map(p => ({
    ...p,
    firstAtBatIndex: firstAppearance.get(p.pitcherId) ?? Number.MAX_SAFE_INTEGER,
  }))

  withFirstAppearance.sort((a, b) => a.firstAtBatIndex - b.firstAtBatIndex)

  return withFirstAppearance.map((p, i) => ({ ...p, role: i === 0 ? 'SP' : 'RP' as const }))
}

export type PitchTypeCountBreakdown = {
  typeCode: string
  typeName: string
  total: number
  pct: number
  countBuckets: { label: string; count: number }[]
}

type SequencedPitch = PitchRecord & { _i: number; countAtThrow: string }

function sortPitches(pitches: PitchRecord[]): SequencedPitch[] {
  return pitches
    .map((p, _i) => ({ ...p, _i }))
    .sort((a, b) => {
      if (a.atBatIndex !== b.atBatIndex) return a.atBatIndex - b.atBatIndex
      const aN = (a as PitchRecord & { pitchNumber?: number }).pitchNumber
      const bN = (b as PitchRecord & { pitchNumber?: number }).pitchNumber
      if (aN != null && bN != null && aN !== bN) return aN - bN
      return a._i - b._i
    })
    .map(p => ({ ...p, countAtThrow: '0-0' }))
}

function withCountAtThrow(sorted: SequencedPitch[]): SequencedPitch[] {
  const byAB = new Map<number, SequencedPitch[]>()
  for (const p of sorted) {
    const list = byAB.get(p.atBatIndex) ?? []
    list.push(p)
    byAB.set(p.atBatIndex, list)
  }
  const out: SequencedPitch[] = []
  for (const group of byAB.values()) {
    group.forEach((p, i) => {
      if (i === 0) {
        p.countAtThrow = '0-0'
      } else {
        const prev = group[i - 1]
        p.countAtThrow = `${prev.countAfter.balls}-${prev.countAfter.strikes}`
      }
      out.push(p)
    })
  }
  return out
}

export function computePitchUsageByCount(pitcherPitches: PitchRecord[]): PitchTypeCountBreakdown[] {
  const sequenced = withCountAtThrow(sortPitches(pitcherPitches))
  const totalPitches = sequenced.length
  const byType = new Map<string, { name: string; total: number; counts: Map<string, number> }>()

  for (const p of sequenced) {
    if (!p.typeCode) continue
    if (!byType.has(p.typeCode)) {
      byType.set(p.typeCode, { name: p.typeDescription ?? p.typeCode, total: 0, counts: new Map() })
    }
    const entry = byType.get(p.typeCode)!
    entry.total += 1
    entry.counts.set(p.countAtThrow, (entry.counts.get(p.countAtThrow) ?? 0) + 1)
  }

  const out: PitchTypeCountBreakdown[] = []
  for (const [typeCode, { name, total, counts }] of byType) {
    out.push({
      typeCode,
      typeName: name,
      total,
      pct: totalPitches > 0 ? Math.round((total / totalPitches) * 100) : 0,
      countBuckets: Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => countOrder(a.label) - countOrder(b.label) || b.count - a.count),
    })
  }

  return out.sort((a, b) => b.total - a.total)
}

export type NextPitchRow = {
  typeCode: string
  typeName: string
  count: number
  pct: number
}

export type PitchTransition = {
  fromCode: string
  fromName: string
  fromTotal: number
  followed: number
  endedAB: number
  next: NextPitchRow[]
}

export function computeNextPitchTransitions(pitcherPitches: PitchRecord[]): PitchTransition[] {
  const sequenced = withCountAtThrow(sortPitches(pitcherPitches))
  const byAB = new Map<number, SequencedPitch[]>()
  for (const p of sequenced) {
    const list = byAB.get(p.atBatIndex) ?? []
    list.push(p)
    byAB.set(p.atBatIndex, list)
  }

  const byFrom = new Map<string, { name: string; total: number; ended: number; next: Map<string, { name: string; n: number }> }>()

  const touch = (code: string, name: string) => {
    if (!byFrom.has(code)) byFrom.set(code, { name, total: 0, ended: 0, next: new Map() })
    return byFrom.get(code)!
  }

  for (const group of byAB.values()) {
    for (let i = 0; i < group.length; i++) {
      const cur = group[i]
      if (!cur.typeCode) continue
      const entry = touch(cur.typeCode, cur.typeDescription ?? cur.typeCode)
      entry.total += 1
      const nxt = group[i + 1]
      if (!nxt || !nxt.typeCode) {
        entry.ended += 1
      } else {
        const n = entry.next.get(nxt.typeCode) ?? { name: nxt.typeDescription ?? nxt.typeCode, n: 0 }
        n.n += 1
        entry.next.set(nxt.typeCode, n)
      }
    }
  }

  const out: PitchTransition[] = []
  for (const [fromCode, { name, total, ended, next }] of byFrom) {
    const followed = total - ended
    out.push({
      fromCode,
      fromName: name,
      fromTotal: total,
      followed,
      endedAB: ended,
      next: Array.from(next.entries())
        .map(([typeCode, v]) => ({
          typeCode,
          typeName: v.name,
          count: v.n,
          pct: followed > 0 ? Math.round((v.n / followed) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count),
    })
  }
  return out.sort((a, b) => b.fromTotal - a.fromTotal)
}

const COUNT_RANK: Record<string, number> = {
  '0-0': 0, '1-0': 1, '0-1': 2, '2-0': 3, '1-1': 4, '0-2': 5,
  '3-0': 6, '2-1': 7, '1-2': 8, '3-1': 9, '2-2': 10, '3-2': 11,
}
function countOrder(label: string): number {
  return COUNT_RANK[label] ?? 80
}

function outsToIP(outs: number): string {
  const whole = Math.floor(outs / 3)
  const rem = outs % 3
  return `${whole}.${rem}`
}

const DECISION_LABEL: Record<NonNullable<PitcherGameLine['decision']>, string> = {
  W: 'Win', L: 'Loss', S: 'Save', H: 'Hold', BS: 'Blown Save',
}

const PITCH_COLORS: Record<string, string> = {
  FF: '#E03C31', FA: '#E03C31',
  SI: '#C45C26',
  FC: '#933F2C',
  SL: '#C9A227',
  ST: '#9B3FA0', SV: '#9B3FA0',
  CU: '#1AA7C2', KC: '#6236CD', CS: '#1AA7C2',
  CH: '#2FA84F',
  FS: '#2A9D8F', FO: '#2A9D8F',
  KN: '#6B7280',
}

function pitchColor(typeCode: string, typeName: string): string {
  const code = typeCode.toUpperCase()
  if (PITCH_COLORS[code]) return PITCH_COLORS[code]
  const n = typeName.toLowerCase()
  if (n.includes('sweep')) return PITCH_COLORS.ST
  if (n.includes('sink')) return PITCH_COLORS.SI
  if (n.includes('cut')) return PITCH_COLORS.FC
  if (n.includes('slider')) return PITCH_COLORS.SL
  if (n.includes('curve')) return PITCH_COLORS.CU
  if (n.includes('change')) return PITCH_COLORS.CH
  if (n.includes('split') || n.includes('fork')) return PITCH_COLORS.FS
  if (n.includes('four') || n.includes('fast')) return PITCH_COLORS.FF
  return '#57534E'
}

function shortPitchName(name: string): string {
  return name
    .replace(/Four-Seam Fastball/i, '4-Seam')
    .replace(/Four Seam Fastball/i, '4-Seam')
    .replace(/Fastball/i, 'FB')
    .replace(/Changeup/i, 'Change')
}

function mlbHeadshot(pitcherId: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_96,q_auto:best/v1/people/${pitcherId}/headshot/silo/current`
}

function pitcherPhotoUrl(pitcher: PitcherGameLine): string {
  const extra = pitcher as PitcherGameLine & { headshotUrl?: string }
  return extra.headshotUrl || mlbHeadshot(pitcher.pitcherId)
}

export default function PitcherBoxScoreCard({
  pitchers, pitchLog,
  awayTeamId, homeTeamId, awayAbbr, homeAbbr, awayColor, homeColor,
}: Props) {
  const awayPitchers = useMemo(() => deriveRoles(pitchers, pitchLog, awayTeamId), [pitchers, pitchLog, awayTeamId])
  const homePitchers = useMemo(() => deriveRoles(pitchers, pitchLog, homeTeamId), [pitchers, pitchLog, homeTeamId])

  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-stone-100">
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400">Pitching box score</p>
        <p className="font-serif font-semibold text-stone-900 text-sm mt-0.5">
          Tap a pitcher for tonight&apos;s sequencing
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-100">
        <TeamBoxScore abbr={awayAbbr} color={awayColor} pitchers={awayPitchers} pitchLog={pitchLog} />
        <TeamBoxScore abbr={homeAbbr} color={homeColor} pitchers={homePitchers} pitchLog={pitchLog} />
      </div>
    </div>
  )
}

function TeamBoxScore({
  abbr, color, pitchers, pitchLog,
}: {
  abbr: string
  color: string
  pitchers: RoledPitcher[]
  pitchLog: PitchRecord[]
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const sp = pitchers.filter(p => p.role === 'SP')
  const bullpen = pitchers.filter(p => p.role === 'RP')

  if (pitchers.length === 0) {
    return (
      <div className="p-4">
        <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2">{abbr}</p>
        <p className="text-xs font-serif italic text-stone-400">No pitching data available.</p>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4">
      <p className="font-mono text-[9px] uppercase tracking-widest text-stone-400 mb-2 px-1">{abbr}</p>
      <div className="mb-1">
        <ColumnHeader />
        {sp.map(p => (
          <PitcherRow
            key={p.pitcherId}
            pitcher={p}
            color={color}
            isExpanded={expandedId === p.pitcherId}
            onToggle={() => setExpandedId(expandedId === p.pitcherId ? null : p.pitcherId)}
            pitchLog={pitchLog}
          />
        ))}
      </div>
      {bullpen.length > 0 && (
        <div className="mt-3">
          <p className="font-mono text-[8px] uppercase tracking-widest text-stone-300 mb-1 px-1">Bullpen</p>
          {bullpen.map(p => (
            <PitcherRow
              key={p.pitcherId}
              pitcher={p}
              color={color}
              isExpanded={expandedId === p.pitcherId}
              onToggle={() => setExpandedId(expandedId === p.pitcherId ? null : p.pitcherId)}
              pitchLog={pitchLog}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ColumnHeader() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_repeat(6,28px)] sm:grid-cols-[minmax(0,1fr)_repeat(6,32px)] gap-1 px-1 mb-1">
      <span />
      {['IP', 'H', 'R', 'ER', 'BB', 'K'].map(label => (
        <span key={label} className="font-mono text-[8px] uppercase tracking-wider text-stone-400 text-center">{label}</span>
      ))}
    </div>
  )
}

function Headshot({ pitcher, size = 28 }: { pitcher: PitcherGameLine; size?: number }) {
  const [failed, setFailed] = useState(false)
  const initials = pitcher.pitcherName
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  if (failed) {
    return (
      <span
        className="shrink-0 rounded-full bg-stone-200 text-stone-500 font-mono font-bold grid place-items-center"
        style={{ width: size, height: size, fontSize: size * 0.32 }}
        aria-hidden
      >
        {initials}
      </span>
    )
  }

  return (
    <img
      src={pitcherPhotoUrl(pitcher)}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full bg-stone-100 object-cover object-top"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  )
}

function PitcherRow({
  pitcher, color, isExpanded, onToggle, pitchLog,
}: {
  pitcher: RoledPitcher
  color: string
  isExpanded: boolean
  onToggle: () => void
  pitchLog: PitchRecord[]
}) {
  const decisionLabel = pitcher.decision ? DECISION_LABEL[pitcher.decision] : null

  return (
    <div className={`rounded-xl ${isExpanded ? 'bg-stone-50 ring-1 ring-stone-200 mb-1' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="w-full grid grid-cols-[minmax(0,1fr)_repeat(6,28px)] sm:grid-cols-[minmax(0,1fr)_repeat(6,32px)] gap-1 px-1 py-2 items-center text-left hover:bg-stone-50 rounded-xl transition"
      >
        <span className="min-w-0 flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-stone-300 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <Headshot pitcher={pitcher} size={28} />
          <span className="font-serif text-[13px] text-stone-800 truncate">{pitcher.pitcherName}</span>
          {decisionLabel && (
            <span
              title={decisionLabel}
              className="font-mono text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
              style={{ background: `${color}1A`, color }}
            >
              {pitcher.decision}
            </span>
          )}
        </span>
        <span className="font-mono text-[11px] text-stone-700 text-center tabular-nums">{outsToIP(pitcher.outsRecorded)}</span>
        <span className="font-mono text-[11px] text-stone-700 text-center tabular-nums">{pitcher.hitsAllowed}</span>
        <span className="font-mono text-[11px] text-stone-700 text-center tabular-nums">{pitcher.runsAllowed}</span>
        <span className="font-mono text-[11px] text-stone-700 text-center tabular-nums">{pitcher.earnedRunsAllowed}</span>
        <span className="font-mono text-[11px] text-stone-700 text-center tabular-nums">{pitcher.walks}</span>
        <span className="font-mono text-[11px] text-stone-700 text-center tabular-nums">{pitcher.strikeouts}</span>
      </button>

      {isExpanded && (
        <div className="px-2 pb-3">
          <GameSequencingPanel pitcher={pitcher} pitchLog={pitchLog} />
        </div>
      )}
    </div>
  )
}

function GameSequencingPanel({
  pitcher, pitchLog,
}: {
  pitcher: RoledPitcher
  pitchLog: PitchRecord[]
}) {
  const pitcherPitches = useMemo(
    () => pitchLog.filter(p => p.pitcherId === pitcher.pitcherId),
    [pitchLog, pitcher.pitcherId]
  )
  const breakdown = useMemo(() => computePitchUsageByCount(pitcherPitches), [pitcherPitches])
  const transitions = useMemo(() => computeNextPitchTransitions(pitcherPitches), [pitcherPitches])
  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  if (breakdown.length === 0) {
    return (
      <p className="text-[11px] font-serif italic text-stone-400 px-1">
        No pitch-level data for {pitcher.pitcherName} tonight.
      </p>
    )
  }

  const activeCode = selectedCode && breakdown.some(p => p.typeCode === selectedCode)
    ? selectedCode
    : breakdown[0].typeCode
  const activeUsage = breakdown.find(p => p.typeCode === activeCode)!
  const activeNext = transitions.find(t => t.fromCode === activeCode)
  const maxNext = Math.max(1, ...(activeNext?.next.map(n => n.count) ?? [0]))

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-3">
      <div className="flex items-center gap-3 mb-3">
        <Headshot pitcher={pitcher} size={48} />
        <div className="min-w-0">
          <p className="font-serif font-semibold text-stone-900 text-[14px] leading-tight truncate">
            {pitcher.pitcherName}
          </p>
          <p className="font-mono text-[10px] text-stone-500 mt-0.5 tabular-nums">
            {pitcherPitches.length} pitches · {outsToIP(pitcher.outsRecorded)} IP
          </p>
        </div>
      </div>

      <div className="flex h-2 rounded-full overflow-hidden bg-stone-100 mb-2.5">
        {breakdown.map(p => (
          <div
            key={p.typeCode}
            className="h-full"
            style={{ width: `${Math.max(p.pct, 0)}%`, background: pitchColor(p.typeCode, p.typeName) }}
          />
        ))}
      </div>

      <div className="flex gap-1 flex-wrap mb-4">
        {breakdown.map(p => {
          const c = pitchColor(p.typeCode, p.typeName)
          const on = p.typeCode === activeCode
          return (
            <button
              key={p.typeCode}
              type="button"
              onClick={() => setSelectedCode(p.typeCode)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] border transition ${
                on ? 'text-white border-transparent' : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300'
              }`}
              style={on ? { background: c } : undefined}
            >
              {!on && <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />}
              {shortPitchName(p.typeName)}
              <span className={on ? 'text-white/80' : 'text-stone-400'}>{p.pct}%</span>
            </button>
          )
        })}
      </div>

      <section>
        <p className="font-mono text-[8px] uppercase tracking-widest text-stone-400 mb-1.5">
          After a {shortPitchName(activeUsage.typeName).toLowerCase()}
        </p>
        <p className="font-serif text-[13px] text-stone-800 mb-2.5 leading-snug">
          What he threw next, same at-bat
        </p>

        {activeNext && activeNext.next.length > 0 ? (
          <div className="space-y-1.5">
            {activeNext.next.map(row => {
              const c = pitchColor(row.typeCode, row.typeName)
              return (
                <div key={row.typeCode} className="grid grid-cols-[1fr_minmax(0,1fr)_40px] gap-2 items-center">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: c }} />
                    <span className="font-serif text-[12px] text-stone-800 truncate">{row.typeName}</span>
                  </span>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(row.count / maxNext) * 100}%`, background: c }}
                    />
                  </div>
                  <span className="font-mono text-[10px] tabular-nums text-stone-500 text-right">
                    {row.count} · {row.pct}%
                  </span>
                </div>
              )
            })}
            {activeNext.endedAB > 0 && (
              <p className="font-mono text-[10px] text-stone-400 pt-1">
                Ended the at-bat {activeNext.endedAB}×
              </p>
            )}
          </div>
        ) : (
          <p className="text-[12px] font-serif italic text-stone-400">
            Every {shortPitchName(activeUsage.typeName).toLowerCase()} ended the at-bat.
          </p>
        )}
      </section>

      <section className="mt-4 pt-3 border-t border-stone-100">
        <p className="font-mono text-[8px] uppercase tracking-widest text-stone-400 mb-2">
          Counts he threw it · n={activeUsage.total}
        </p>
        <div className="flex gap-1 flex-wrap">
          {activeUsage.countBuckets.map(bucket => (
            <span
              key={bucket.label}
              className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums rounded-md px-1.5 py-0.5 bg-stone-50 border border-stone-200 text-stone-700"
            >
              <span>{bucket.label}</span>
              <span className="text-stone-400">×{bucket.count}</span>
            </span>
          ))}
        </div>
      </section>

      <p className="mt-3 font-mono text-[9px] text-stone-400 leading-relaxed">
        Tonight only. Tap a pitch above to change the “what’s next” view.
      </p>
    </div>
  )
}