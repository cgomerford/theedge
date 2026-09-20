// src/components/LeagueStandardStatsSection.tsx
//
// "League Skyline" — a homepage section most sites don't build: instead of
// another ranked top-5 leaderboard table (every stats site already has
// one), each of 10 standard stats gets its own horizontal strip showing
// ALL 30 teams positioned by their real season value, team logos as the
// marks instead of generic dots. Pick a team once at the top and it lights
// up, enlarged, across every strip at once — so "where does my team
// actually stand in the league on offense AND pitching" reads in one
// glance instead of ten separate lookups.
//
// Real season-to-date data only (getLeagueStandardStats — two bulk MLB
// Stats API calls, all 30 teams each, see src/lib/league-standard-stats.ts).
// No fabricated trend lines: a true day-by-day season history for 10 stats
// x 30 teams isn't available from a live call without a new backfill
// pipeline, so this shows the real, current shape of the league instead of
// faking a history.

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { teamLogoUrl } from '@/lib/mlb'
import { MLB_TEAMS } from '@/lib/teams'
import type { LeagueTeamStatRow, StandardStatKey } from '@/lib/league-standard-stats'
import { STANDARD_STAT_DEFS } from '@/lib/league-standard-stats'

const ORANGE = '#FF5722'
const GOOD = '#059669'
const BAD = '#DC2626'

function StatStrip({
  def,
  rows,
  selectedTeamId,
}: {
  def: (typeof STANDARD_STAT_DEFS)[number]
  rows: LeagueTeamStatRow[]
  selectedTeamId: number | null
}) {
  const values = rows.map(r => r[def.key as StandardStatKey] as number)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const W = 100 // percentage-based x scale, laid out via a viewBox
  const x = (v: number) => 6 + ((v - min) / span) * (W - 12)

  const sorted = [...rows].sort((a, b) => (a[def.key as StandardStatKey] as number) - (b[def.key as StandardStatKey] as number))
  const best = def.higherIsBetter ? sorted[sorted.length - 1] : sorted[0]
  const selected = selectedTeamId !== null ? rows.find(r => r.teamId === selectedTeamId) : undefined
  const selectedRank = selected
    ? [...rows].sort((a, b) => (def.higherIsBetter ? 1 : -1) * ((b[def.key as StandardStatKey] as number) - (a[def.key as StandardStatKey] as number))).findIndex(r => r.teamId === selected.teamId) + 1
    : null

  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] font-bold uppercase tracking-wide text-[#8A8577]">{def.group}</span>
          <span className="text-[12px] font-serif font-bold text-[#1A1A1A]">{def.label}</span>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-wide" style={{ color: def.higherIsBetter ? GOOD : BAD }}>
          {def.higherIsBetter ? 'higher is better' : 'lower is better'}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} 22`} className="w-full" style={{ height: 34 }} preserveAspectRatio="none">
        <line x1={6} y1={11} x2={W - 6} y2={11} stroke="rgba(26,26,26,0.12)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
        {rows.map(r => {
          const v = r[def.key as StandardStatKey] as number
          const isSelected = r.teamId === selectedTeamId
          const isBest = r.teamId === best.teamId
          const size = isSelected ? 5.4 : isBest ? 4 : 3
          return (
            <g key={r.teamId} opacity={isSelected ? 1 : isBest ? 0.9 : 0.4}>
              <circle cx={x(v)} cy={11} r={size / 2 + 0.3} fill="#fff" />
              <clipPath id={`skyline-clip-${def.key}-${r.teamId}`}>
                <circle cx={x(v)} cy={11} r={size / 2} />
              </clipPath>
              <image
                href={teamLogoUrl(r.teamId)}
                x={x(v) - size / 2}
                y={11 - size / 2}
                width={size}
                height={size}
                clipPath={`url(#skyline-clip-${def.key}-${r.teamId})`}
                preserveAspectRatio="xMidYMid slice"
              />
              {isSelected && (
                <circle cx={x(v)} cy={11} r={size / 2 + 0.6} fill="none" stroke={ORANGE} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
              )}
            </g>
          )
        })}
      </svg>

      <div className="flex items-center justify-between mt-1">
        <span className="font-mono text-[8px] text-[#B5B0A3] tabular-nums">{def.fmt(min)}</span>
        <span className="font-mono text-[8px] text-[#B5B0A3] tabular-nums">{def.fmt(max)}</span>
      </div>

      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[#F0EFEC]">
        <span className="text-[9.5px] text-[#8A8577]">
          League best: <span className="font-bold text-[#1A1A1A]">{best.teamName}</span> ({def.fmt(best[def.key as StandardStatKey] as number)})
        </span>
        {selected && (
          <span className="text-[9.5px] font-bold" style={{ color: ORANGE }}>
            {selected.teamName.split(' ').slice(-1)[0]}: {def.fmt(selected[def.key as StandardStatKey] as number)} (#{selectedRank})
          </span>
        )}
      </div>
    </div>
  )
}

// ── Comprehensive leaderboard — all 30 teams, every standard stat, click a
// column to sort by it. The strips above answer "where does my team sit in
// the shape of the league"; this answers "who's #1 in X right now" — the
// two together cover both ways a reader actually wants to look at a
// leaderboard. Rows link straight to the team's own page.

export function TeamLeaderboardTable({
  rows,
  selectedTeamId = null,
}: {
  rows: LeagueTeamStatRow[]
  selectedTeamId?: number | null
}) {
  const [sortKey, setSortKey] = useState<StandardStatKey>('ops')
  const teamSlugById = useMemo(() => new Map(MLB_TEAMS.map(t => [t.id, t.slug])), [])

  const def = STANDARD_STAT_DEFS.find(d => d.key === sortKey)!
  const sorted = [...rows].sort((a, b) => (def.higherIsBetter ? 1 : -1) * ((b[sortKey] as number) - (a[sortKey] as number)))

  return (
    <div className="rounded-lg border border-[#E8E4DC] bg-white overflow-hidden mt-3">
      <div className="overflow-x-auto">
        <table className="w-full text-[10.5px] border-collapse min-w-[720px]">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-wide text-[#8A8577] border-b border-[#E8E4DC] bg-[#FAF8F3]">
              <th className="py-2 pl-3 pr-2 font-bold sticky left-0 bg-[#FAF8F3]">#</th>
              <th className="py-2 pr-2 font-bold sticky left-6 bg-[#FAF8F3]">Team</th>
              {STANDARD_STAT_DEFS.map(d => (
                <th key={d.key}>
                  <button
                    onClick={() => setSortKey(d.key)}
                    className="w-full py-2 pr-3 font-bold text-right hover:text-[#1A1A1A] transition whitespace-nowrap"
                    style={{ color: sortKey === d.key ? '#FF5722' : undefined }}
                  >
                    {d.label === 'Batting Average' ? 'AVG' : d.label === 'Home Runs' ? 'HR' : d.label === 'Stolen Bases' ? 'SB' : d.label === 'Strikeouts' ? 'SO' : d.label}
                    {sortKey === d.key ? ' ▾' : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const slug = teamSlugById.get(r.teamId)
              const isSelected = r.teamId === selectedTeamId
              return (
                <tr
                  key={r.teamId}
                  className="border-b border-[#F0EFEC] last:border-0 transition"
                  style={{ background: isSelected ? 'rgba(255,87,34,0.06)' : undefined }}
                >
                  <td className="py-1.5 pl-3 pr-2 text-[#8A8577] tabular-nums sticky left-0" style={{ background: isSelected ? '#FEF0EA' : '#fff' }}>{i + 1}</td>
                  <td className="py-1.5 pr-2 sticky left-6" style={{ background: isSelected ? '#FEF0EA' : '#fff' }}>
                    <Link href={slug ? `/mlb/teams/${slug}` : '#'} className="flex items-center gap-1.5 font-bold text-[#1A1A1A] hover:underline whitespace-nowrap">
                      <img src={teamLogoUrl(r.teamId)} alt="" width={14} height={14} className="shrink-0" />
                      {r.teamName}
                    </Link>
                  </td>
                  {STANDARD_STAT_DEFS.map(d => (
                    <td key={d.key} className="py-1.5 pr-3 text-right tabular-nums" style={{ color: sortKey === d.key ? '#1A1A1A' : '#57534E', fontWeight: sortKey === d.key ? 700 : 400 }}>
                      {d.fmt(r[d.key] as number)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function LeagueStandardStatsSection({ rows }: { rows: LeagueTeamStatRow[] }) {
  const teamOptions = useMemo(
    () => MLB_TEAMS
      .map(t => ({ ...t, present: rows.some(r => r.teamId === t.id) }))
      .filter(t => t.present)
      .sort((a, b) => a.short.localeCompare(b.short)),
    [rows]
  )
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(teamOptions[0]?.id ?? null)

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4 text-[11px] text-[#8A8577] text-center py-10">
        League stats unavailable right now.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#E8E4DC] bg-[#FAF8F3] p-4">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <div>
          <div className="text-[17px] font-serif font-bold text-[#1A1A1A]">League skyline</div>
          <div className="text-[11px] text-[#8A8577] mt-0.5 max-w-[520px]">
            All 30 teams, positioned by their real season total — pick a team to light it up across every stat at once.
          </div>
        </div>
        <select
          value={selectedTeamId ?? ''}
          onChange={e => setSelectedTeamId(Number(e.target.value))}
          className="text-[12px] font-bold text-[#1A1A1A] bg-white border border-[#DEDACE] rounded-full px-3 py-1.5 cursor-pointer"
        >
          {teamOptions.map(t => (
            <option key={t.id} value={t.id}>{t.short}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3">
        {STANDARD_STAT_DEFS.map(def => (
          <StatStrip key={def.key} def={def} rows={rows} selectedTeamId={selectedTeamId} />
        ))}
      </div>

      <div className="text-[13px] font-serif font-bold text-[#1A1A1A] mt-5">Comprehensive leaderboard</div>
      <div className="text-[10.5px] text-[#8A8577] mt-0.5">Every team, every standard stat — click a column to sort by it. Click a team to open its page.</div>
      <TeamLeaderboardTable rows={rows} selectedTeamId={selectedTeamId} />
    </div>
  )
}
