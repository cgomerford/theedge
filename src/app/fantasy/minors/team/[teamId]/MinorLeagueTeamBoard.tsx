// src/app/fantasy/minors/team/[teamId]/MinorLeagueTeamBoard.tsx
//
// Styled to match TeamMiniDugout (the MLB team page): hero panel with
// colored background, a 3-card snapshot grid below it, then full detail
// sections in rounded-lg white containers — same visual language, same
// spacing scale, same "⊕ label" header treatment.
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import PlayerHeadshot from '@/components/fantasy/PlayerHeadshot'
import type {
  MinorLeagueTeamMeta,
  MinorLeaguerMeta,
  MinorLeaguerSeasonLine,
} from '@/lib/fantasy-minors'

// ─── Brand ───────────────────────────────────────────────────────────────────
// Minor league teams don't carry primary/secondary colors the way MLB
// teams do in this app, so the hero uses a fixed pairing that already
// reads as "prospect / farm system" elsewhere on the site.
const ACCENT = '#7C3AED'
const ACCENT_2 = '#FF5722'

type PositionGroup = 'SP' | 'RP' | 'C' | 'IF' | 'OF' | 'DH' | 'OTHER'

const GROUP_LABELS: Record<PositionGroup, string> = {
  SP: 'Starting pitchers',
  RP: 'Relief pitchers',
  C: 'Catchers',
  IF: 'Infielders',
  OF: 'Outfielders',
  DH: 'Designated hitters',
  OTHER: 'Other / two-way',
}
const GROUP_ORDER: PositionGroup[] = ['SP', 'RP', 'C', 'IF', 'OF', 'DH', 'OTHER']

// ─── Position bucketing ─────────────────────────────────────────────────────
function bucket(pos: string | null, posType: string | null): PositionGroup {
  const p = (pos ?? '').toUpperCase()
  const t = (posType ?? '').toLowerCase()
  if (t.includes('pitcher') || ['P', 'SP', 'RP'].includes(p)) {
    if (p === 'SP') return 'SP'
    if (p === 'RP') return 'RP'
    return 'SP'
  }
  if (p === 'C') return 'C'
  if (['1B', '2B', '3B', 'SS', 'IF'].includes(p)) return 'IF'
  if (['LF', 'CF', 'RF', 'OF'].includes(p)) return 'OF'
  if (p === 'DH') return 'DH'
  return 'OTHER'
}
function isPitcherGroup(g: PositionGroup): boolean {
  return g === 'SP' || g === 'RP'
}

// ─── Hot/cold thresholds against level baselines ────────────────────────────
const LEVEL_OPS_BASELINE: Record<string, number> = {
  AAA: 0.740, AA: 0.720, 'High-A': 0.710, 'Low-A': 0.700, Rookie: 0.720,
}
function statusForOps(ops: number | null, levelBaseline: number): 'hot' | 'cold' | 'neutral' {
  if (ops == null) return 'neutral'
  if (ops - levelBaseline > 0.150) return 'hot'
  if (levelBaseline - ops > 0.150) return 'cold'
  return 'neutral'
}

// ─── Formatting ─────────────────────────────────────────────────────────────
function fmt(n: number | null, digits = 3): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}
function fmtInt(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  return String(Math.round(n))
}

// ─── Sort options ───────────────────────────────────────────────────────────
type SortKey = 'name' | 'age' | 'ops' | 'era' | 'recent'
const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name', age: 'Age', ops: 'OPS', era: 'ERA', recent: 'L14 OPS',
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MinorLeagueTeamBoard({
  team, roster, seasonStats, recentOps,
}: {
  team: MinorLeagueTeamMeta
  roster: MinorLeaguerMeta[]
  seasonStats: Map<number, MinorLeaguerSeasonLine>
  recentOps: Map<number, number>
}) {
  const [sortKey, setSortKey] = useState<SortKey>('ops')
  const [posFilter, setPosFilter] = useState<'ALL' | 'HITTERS' | 'PITCHERS'>('ALL')

  const levelBaseline = LEVEL_OPS_BASELINE[team.level] ?? 0.720

  // Group + sort
  const groups = useMemo(() => {
    const filtered = roster.filter(p => {
      const g = bucket(p.primaryPosition, p.primaryPositionType)
      if (posFilter === 'HITTERS') return !isPitcherGroup(g)
      if (posFilter === 'PITCHERS') return isPitcherGroup(g)
      return true
    })

    const byGroup = new Map<PositionGroup, MinorLeaguerMeta[]>()
    for (const g of GROUP_ORDER) byGroup.set(g, [])
    for (const p of filtered) {
      byGroup.get(bucket(p.primaryPosition, p.primaryPositionType))!.push(p)
    }

    for (const [, players] of byGroup) {
      players.sort((a, b) => compare(a, b, sortKey, seasonStats, recentOps))
    }

    return GROUP_ORDER
      .map(g => ({ group: g, label: GROUP_LABELS[g], players: byGroup.get(g)! }))
      .filter(x => x.players.length > 0)
  }, [roster, sortKey, posFilter, seasonStats, recentOps])

  // ── Snapshot card data ──────────────────────────────────────────────────
  const snapshot = useMemo(() => {
    let hitterCount = 0
    let pitcherCount = 0
    let ageSum = 0
    let ageCount = 0
    for (const p of roster) {
      const g = bucket(p.primaryPosition, p.primaryPositionType)
      if (isPitcherGroup(g)) pitcherCount++
      else hitterCount++
      if (p.age != null) { ageSum += p.age; ageCount++ }
    }
    return {
      rosterSize: roster.length,
      avgAge: ageCount > 0 ? (ageSum / ageCount).toFixed(1) : '—',
      hitterCount,
      pitcherCount,
    }
  }, [roster])

  // ── Hot bats (L14), for the "Recent form" card + leaderboard ───────────
  const hotBats = useMemo(() => {
    const hot: { p: MinorLeaguerMeta; ops: number }[] = []
    for (const p of roster) {
      const ops = recentOps.get(p.playerId)
      if (ops != null) hot.push({ p, ops })
    }
    hot.sort((a, b) => b.ops - a.ops)
    return hot.slice(0, 3)
  }, [roster, recentOps])

  // ── Team leaders — top 2 hitters by season OPS, top 2 pitchers by K ────
  const leaders = useMemo(() => {
    const hitters: { p: MinorLeaguerMeta; value: number; label: string }[] = []
    const pitchers: { p: MinorLeaguerMeta; value: number; label: string }[] = []
    for (const p of roster) {
      const s = seasonStats.get(p.playerId)
      if (!s) continue
      const g = bucket(p.primaryPosition, p.primaryPositionType)
      if (!isPitcherGroup(g) && s.ops != null && (s.atBats ?? 0) >= 20) {
        hitters.push({ p, value: s.ops, label: 'OPS' })
      }
      if (isPitcherGroup(g) && s.strikeOuts != null) {
        pitchers.push({ p, value: s.strikeOuts, label: 'K' })
      }
    }
    hitters.sort((a, b) => b.value - a.value)
    pitchers.sort((a, b) => b.value - a.value)
    return { hitters: hitters.slice(0, 2), pitchers: pitchers.slice(0, 2) }
  }, [roster, seasonStats])

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pb-16">

      {/* ── Back link ─────────────────────────────────────────────────── */}
      <div className="pt-6 mb-8">
        <Link href="/fantasy/prospects" className="text-xs font-mono uppercase tracking-widest text-orange-600 hover:underline">
          ← Back to Prospect Watch
        </Link>
      </div>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl p-8 mb-8 relative overflow-hidden" style={{ background: ACCENT }}>
        <div
          className="absolute inset-0 opacity-10"
          style={{ background: `radial-gradient(circle at 80% 50%, ${ACCENT_2}, transparent 60%)` }}
        />
        <div className="relative">
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] mb-2 opacity-70 text-white">
            ⊕ The Edge · {team.league ?? 'Minor League Baseball'} · {team.level} affiliate
          </div>
          <h1 className="font-serif text-4xl md:text-5xl font-bold leading-none tracking-tight mb-1 text-white">
            {team.name}<span style={{ color: ACCENT_2 }}>.</span>
          </h1>
          <div className="text-sm font-mono mt-3 opacity-80 text-white">
            {team.parentOrgName ? `${team.parentOrgName} organization` : 'Independent affiliate'}
            {team.venue ? ` · ${team.venue}` : ''}
          </div>
        </div>
      </div>

      {/* ── 3-card snapshot grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

        {/* Roster snapshot */}
        <div className="bg-white border border-stone-200 rounded-lg p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
            ⊕ Roster snapshot
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="font-serif text-3xl font-bold" style={{ color: ACCENT }}>
                {snapshot.rosterSize}
              </div>
              <div className="text-[10px] font-mono uppercase text-stone-400 mt-1">On roster</div>
            </div>
            <div>
              <div className="font-serif text-xl font-bold text-stone-900">{snapshot.avgAge}</div>
              <div className="text-[10px] font-mono uppercase text-stone-400 mt-1">Avg age</div>
            </div>
            <div>
              <div className="text-sm font-mono font-bold text-stone-700">{snapshot.hitterCount}</div>
              <div className="text-[10px] font-mono uppercase text-stone-400">Hitters</div>
            </div>
            <div>
              <div className="text-sm font-mono font-bold text-stone-700">{snapshot.pitcherCount}</div>
              <div className="text-[10px] font-mono uppercase text-stone-400">Pitchers</div>
            </div>
          </div>
        </div>

        {/* Recent form */}
        <div className="bg-white border border-stone-200 rounded-lg p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
            ⊕ Recent form
          </div>
          {hotBats.length > 0 ? (
            <div>
              <div className="text-[10px] font-mono uppercase text-stone-400 mb-2">Hottest bat · L14</div>
              <div className="font-serif text-2xl font-light text-stone-900 mb-1">
                {hotBats[0].p.fullName}
              </div>
              <div className="text-xs font-mono text-stone-400 mb-4">
                {hotBats[0].p.primaryPosition ?? '—'} · L14 OPS{' '}
                <span className="font-bold text-green-600">{hotBats[0].ops.toFixed(3)}</span>
              </div>
              <Link
                href={`/fantasy/player/${hotBats[0].p.playerId}?from=prospects`}
                className="text-[10px] font-mono uppercase tracking-widest text-orange-600 hover:underline"
              >
                View full profile →
              </Link>
            </div>
          ) : (
            <div className="text-stone-400 font-mono text-sm">No qualifying recent form yet.</div>
          )}
        </div>

        {/* Team leaders */}
        <div className="bg-white border border-stone-200 rounded-lg p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500 mb-4">
            ⊕ Team leaders
          </div>
          {leaders.hitters.length === 0 && leaders.pitchers.length === 0 ? (
            <div className="text-stone-400 font-mono text-sm">Not enough season data yet.</div>
          ) : (
            <div className="space-y-3">
              {leaders.hitters.map(({ p, value, label }) => (
                <LeaderRow key={p.playerId} p={p} label={label} value={fmt(value)} accent={ACCENT} />
              ))}
              {leaders.pitchers.length > 0 && (
                <div className="border-t border-stone-100 pt-3 mt-3 space-y-3">
                  {leaders.pitchers.map(({ p, value, label }) => (
                    <LeaderRow key={p.playerId} p={p} label={label} value={fmtInt(value)} accent={ACCENT} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Hot bats leaderboard — top 3, full width ────────────────────── */}
      {hotBats.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-stone-100">
            <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500">
              ⊕ Hot bats · L14
            </div>
          </div>
          {hotBats.map(({ p, ops }, i) => (
            <Link
              key={p.playerId}
              href={`/fantasy/player/${p.playerId}?from=prospects`}
              className="flex items-center gap-4 py-3 px-5 border-b border-stone-100 last:border-0 hover:bg-stone-50 transition"
            >
              <span className="font-mono text-[10px] text-stone-300 w-4">{i + 1}</span>
              <PlayerHeadshot
                playerId={p.playerId}
                size={80}
                className="w-10 h-10 rounded-full object-cover border border-stone-200 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <span className="font-serif font-semibold text-sm text-[#1A1A1A]">{p.fullName}</span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400 ml-2">
                  {p.primaryPosition ?? '—'} · {p.age ?? '?'} yr
                </span>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-[9px] uppercase tracking-widest text-stone-300">L14 OPS</div>
                <div className="font-mono text-sm font-bold text-green-600 tabular-nums">{ops.toFixed(3)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <FilterButton active={posFilter === 'ALL'} onClick={() => setPosFilter('ALL')}>All</FilterButton>
        <FilterButton active={posFilter === 'HITTERS'} onClick={() => setPosFilter('HITTERS')}>Hitters</FilterButton>
        <FilterButton active={posFilter === 'PITCHERS'} onClick={() => setPosFilter('PITCHERS')}>Pitchers</FilterButton>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">Sort</span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="font-mono text-[10px] uppercase tracking-widest border border-stone-300 rounded-md bg-white px-2 py-1"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Position groups — full roster ────────────────────────────── */}
      {groups.length === 0 ? (
        <div className="border border-dashed border-stone-300 bg-stone-50 rounded-lg px-4 py-8 text-center">
          <p className="font-serif italic text-sm text-stone-400">No roster returned for this team.</p>
        </div>
      ) : (
        groups.map(({ group, label, players }) => {
          const isPitchers = isPitcherGroup(group)
          return (
            <div key={group} className="bg-white border border-stone-200 rounded-lg overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-stone-100">
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500">
                  ⊕ {label} · {players.length}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50">
                      <th className="text-left py-2.5 px-3 font-mono text-[9px] uppercase tracking-widest text-stone-500">Player</th>
                      <th className="text-center py-2.5 px-2 font-mono text-[9px] uppercase tracking-widest text-stone-500 hidden sm:table-cell">Pos</th>
                      <th className="text-center py-2.5 px-2 font-mono text-[9px] uppercase tracking-widest text-stone-500 hidden sm:table-cell">Age</th>
                      <th className="text-center py-2.5 px-2 font-mono text-[9px] uppercase tracking-widest text-stone-500 hidden md:table-cell">B/T</th>
                      {isPitchers ? (
                        <>
                          <th className="text-right py-2.5 px-2 font-mono text-[9px] uppercase tracking-widest text-stone-500">ERA</th>
                          <th className="text-right py-2.5 px-2 font-mono text-[9px] uppercase tracking-widest text-stone-500 hidden sm:table-cell">IP</th>
                          <th className="text-right py-2.5 px-2 font-mono text-[9px] uppercase tracking-widest text-stone-500 hidden sm:table-cell">K</th>
                        </>
                      ) : (
                        <>
                          <th className="text-right py-2.5 px-2 font-mono text-[9px] uppercase tracking-widest text-stone-500">OPS</th>
                          <th className="text-right py-2.5 px-2 font-mono text-[9px] uppercase tracking-widest text-stone-500 hidden sm:table-cell">HR</th>
                          <th className="text-right py-2.5 px-2 font-mono text-[9px] uppercase tracking-widest text-stone-500 hidden sm:table-cell">SB</th>
                          <th className="text-right py-2.5 px-2 font-mono text-[9px] uppercase tracking-widest text-stone-500">L14</th>
                        </>
                      )}
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(p => {
                      const stats = seasonStats.get(p.playerId)
                      const recent = recentOps.get(p.playerId) ?? null
                      const heat = statusForOps(recent, levelBaseline)
                      return (
                        <tr key={p.playerId} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 transition">
                          <td className="py-2 px-3">
                            <Link href={`/fantasy/player/${p.playerId}?from=prospects`} className="flex items-center gap-3">
                              <PlayerHeadshot
                                playerId={p.playerId}
                                size={80}
                                className="w-8 h-8 rounded-full object-cover border border-stone-200 shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="font-serif font-semibold text-sm text-[#1A1A1A] truncate">{p.fullName}</div>
                                {p.status && p.status !== 'Active' && (
                                  <div className="font-mono text-[9px] uppercase tracking-widest text-amber-600">{p.status}</div>
                                )}
                              </div>
                            </Link>
                          </td>
                          <td className="text-center py-2 px-2 font-mono text-[10px] text-stone-500 hidden sm:table-cell">{p.primaryPosition ?? '—'}</td>
                          <td className="text-center py-2 px-2 font-mono text-sm tabular-nums text-stone-700 hidden sm:table-cell">{p.age ?? '—'}</td>
                          <td className="text-center py-2 px-2 font-mono text-[10px] text-stone-500 hidden md:table-cell">
                            {p.bats ?? '—'}/{p.throws ?? '—'}
                          </td>
                          {isPitchers ? (
                            <>
                              <td className="text-right py-2 px-2 font-mono text-sm tabular-nums text-stone-700">{fmt(stats?.era ?? null, 2)}</td>
                              <td className="text-right py-2 px-2 font-mono text-sm tabular-nums text-stone-700 hidden sm:table-cell">{stats?.inningsPitched ?? '—'}</td>
                              <td className="text-right py-2 px-2 font-mono text-sm tabular-nums text-stone-700 hidden sm:table-cell">{fmtInt(stats?.strikeOuts ?? null)}</td>
                            </>
                          ) : (
                            <>
                              <td className="text-right py-2 px-2 font-mono text-sm tabular-nums text-stone-700">{fmt(stats?.ops ?? null)}</td>
                              <td className="text-right py-2 px-2 font-mono text-sm tabular-nums text-stone-700 hidden sm:table-cell">{fmtInt(stats?.hr ?? null)}</td>
                              <td className="text-right py-2 px-2 font-mono text-sm tabular-nums text-stone-700 hidden sm:table-cell">{fmtInt(stats?.sb ?? null)}</td>
                              <td className={`text-right py-2 px-2 font-mono text-sm tabular-nums font-bold ${
                                heat === 'hot' ? 'text-green-600' : heat === 'cold' ? 'text-red-500' : 'text-stone-500'
                              }`}>
                                {fmt(recent)}
                              </td>
                            </>
                          )}
                          <td className="py-2 pr-3 text-right">
                            {!isPitchers && heat === 'hot' && (
                              <span title="Hot bat, last 14 days" className="text-green-600">▲</span>
                            )}
                            {!isPitchers && heat === 'cold' && (
                              <span title="Cold bat, last 14 days" className="text-red-500">▼</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      <div className="pt-6 border-t border-stone-200">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-300">
          Roster and stats from MLB Stats API · Updated hourly
        </p>
      </div>
    </div>
  )
}

// ─── Small subcomponents ────────────────────────────────────────────────────

function LeaderRow({
  p, label, value, accent,
}: {
  p: MinorLeaguerMeta
  label: string
  value: string
  accent: string
}) {
  return (
    <Link
      href={`/fantasy/player/${p.playerId}?from=prospects`}
      className="flex items-center justify-between hover:opacity-80 transition"
    >
      <div className="flex items-center gap-3">
        <PlayerHeadshot
          playerId={p.playerId}
          size={64}
          className="w-8 h-8 rounded-full object-cover bg-stone-100 border border-stone-200"
        />
        <div>
          <div className="text-sm font-semibold text-stone-900 leading-tight">
            {p.fullName.split(' ').slice(-1)[0]}
          </div>
          <div className="text-[9px] font-mono uppercase text-stone-400">{label}</div>
        </div>
      </div>
      <div className="font-serif text-lg font-bold" style={{ color: accent }}>
        {value}
      </div>
    </Link>
  )
}

function FilterButton({
  active, children, onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-md border transition ${
        active
          ? 'border-[#FF5722] text-[#FF5722] bg-white'
          : 'border-stone-300 text-stone-500 bg-white hover:border-stone-500'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Sort comparator ────────────────────────────────────────────────────────

function compare(
  a: MinorLeaguerMeta, b: MinorLeaguerMeta,
  key: 'name' | 'age' | 'ops' | 'era' | 'recent',
  seasonStats: Map<number, MinorLeaguerSeasonLine>,
  recentOps: Map<number, number>,
): number {
  const sa = seasonStats.get(a.playerId)
  const sb = seasonStats.get(b.playerId)
  switch (key) {
    case 'name':
      return a.fullName.localeCompare(b.fullName)
    case 'age':
      return (a.age ?? 999) - (b.age ?? 999)
    case 'ops':
      return (sb?.ops ?? -1) - (sa?.ops ?? -1)
    case 'era':
      return (sa?.era ?? 999) - (sb?.era ?? 999)
    case 'recent':
      return (recentOps.get(b.playerId) ?? -1) - (recentOps.get(a.playerId) ?? -1)
  }
}
