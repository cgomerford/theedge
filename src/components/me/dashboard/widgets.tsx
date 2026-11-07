'use client'
// src/components/me/dashboard/widgets.tsx
//
// The six widget bodies of the My x9Lab dashboard. Each reads the league rows the slicers have already filtered, or the follows the page loaded, and says plainly when
// there is nothing to show. Nothing is estimated: a player without a stat is left out of that stat.

import Link from 'next/link'
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { Widget } from '@/lib/dashboard/layout'
import { kpi, leagueMean, ranked, scatterPoints, type LeagueRow, type Point } from '@/lib/dashboard/compute'
import { fmtStat, statDef, type Role } from '@/lib/dashboard/stats'
import { useRoster } from '@/components/pitch-shape/useRoster'
import { C, GREY, NUMS, ROWLINE, SANS, dateShort } from '../ui'
import type { RoleData } from './useLeagueData'

export type PlayerSummary = { id: number; name: string; team: string | null; isPitcher: boolean; stats: { v: string; l: string }[]; lastGame: string | null; next: string | null }
export type TeamSummary = { slug: string; name: string; abbrev: string; id: number; record: string | null; last: string | null; next: string | null }

const note = (t: React.ReactNode) => <div style={{ fontSize: 13.5, color: GREY, lineHeight: 1.5, padding: '6px 0' }}>{t}</div>

/** What a league-backed widget shows until it has rows. */
export function dataNote(d: RoleData, role: Role): React.ReactNode | null {
  if (d.status === 'loading') return note('Loading league stats…')
  if (d.status === 'error') return note('League stats could not be read just now.')
  if (d.status === 'empty') return note(`The league ${role} stats are not built yet. They fill from the daily league-stats job.`)
  return null
}

const AGG = { leader: 'League leader', average: 'League average', median: 'League median', total: 'League total' } as const
export const widgetTitle = (w: Widget): string => {
  if (w.kind === 'kpi') return `${AGG[w.agg]} · ${statDef(w.role, w.stat)?.label ?? w.stat}`
  if (w.kind === 'leaders') return `${w.dir === 'best' ? 'Top' : 'Bottom'} ${w.n} · ${statDef(w.role, w.stat)?.label ?? w.stat} (${w.role === 'batter' ? 'hitters' : 'pitchers'})`
  if (w.kind === 'scatter') return `${statDef(w.role, w.y)?.label ?? w.y} by ${statDef(w.role, w.x)?.label ?? w.x}`
  return w.kind === 'myPlayers' ? 'My players' : w.kind === 'myTeams' ? 'My teams' : 'Starred pitchers'
}

export function KpiBody({ w, rows, data }: { w: Extract<Widget, { kind: 'kpi' }>; rows: LeagueRow[]; data: RoleData }) {
  const miss = dataNote(data, w.role)
  if (miss) return <>{miss}</>
  const def = statDef(w.role, w.stat)
  const k = kpi(rows, w.role, w.stat, w.agg)
  if (!def || k.value == null) return note('No players pass the slicers.')
  return (
    <div>
      <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05, color: '#2F8F6B', ...NUMS }}>{fmtStat(def, w.agg === 'total' || w.agg === 'leader' ? k.value : k.value)}</div>
      <div style={{ fontSize: 13, color: GREY, marginTop: 4, ...NUMS }}>{k.who ?? `${k.n.toLocaleString()} players`}</div>
    </div>
  )
}

export function LeadersBody({ w, rows, data, mineIds }: { w: Extract<Widget, { kind: 'leaders' }>; rows: LeagueRow[]; data: RoleData; mineIds: Set<number> }) {
  const miss = dataNote(data, w.role)
  if (miss) return <>{miss}</>
  const def = statDef(w.role, w.stat)
  const top = ranked(rows, w.role, w.stat, w.dir).slice(0, w.n)
  if (!def || top.length === 0) return note('No players pass the slicers.')
  const max = Math.max(...top.map(r => Math.abs(r.s[w.stat])), 1e-9)
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {top.map(r => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1.6fr)', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <Link href={`/mlb/players/${r.id}`} style={{ color: C.ink, textDecoration: 'none', fontWeight: mineIds.has(r.id) ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${r.name}${r.team ? ` · ${r.team}` : ''}`}>{r.name}{r.team ? <span style={{ color: GREY, fontWeight: 500 }}> {r.team}</span> : null}</Link>
          <div style={{ background: '#3558A8', color: '#fff', borderRadius: 2, height: 22, width: `${Math.max(12, (Math.abs(r.s[w.stat]) / max) * 100)}%`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 7px', fontWeight: 800, fontSize: 12.5, ...NUMS, boxSizing: 'border-box' }}>{fmtStat(def, r.s[w.stat])}</div>
        </div>
      ))}
    </div>
  )
}

export function ScatterBody({ w, rows, data, mineIds }: { w: Extract<Widget, { kind: 'scatter' }>; rows: LeagueRow[]; data: RoleData; mineIds: Set<number> }) {
  const miss = dataNote(data, w.role)
  if (miss) return <>{miss}</>
  const xd = statDef(w.role, w.x), yd = statDef(w.role, w.y)
  const pts = scatterPoints(rows, w.x, w.y)
  if (!xd || !yd || pts.length === 0) return note('No players pass the slicers.')
  const mine = pts.filter(p => mineIds.has(p.id)), rest = pts.filter(p => !mineIds.has(p.id))
  const mx = leagueMean(rows, w.x), my = leagueMean(rows, w.y)
  type TipProps = { active?: boolean; payload?: { payload: Point }[] }
  const Tip = ({ active, payload }: TipProps) => {
    const p = active && payload && payload[0]?.payload
    return p ? <div style={{ background: C.ink, color: '#fff', fontSize: 12, padding: '6px 9px', borderRadius: 4, fontFamily: SANS }}><b>{p.name}</b>{p.team ? ` · ${p.team}` : ''}<br />{xd.label} {fmtStat(xd, p.x)} · {yd.label} {fmtStat(yd, p.y)}</div> : null
  }
  return (
    <div>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 8, right: 14, bottom: 22, left: 4 }}>
            <CartesianGrid stroke="#ece8de" />
            <XAxis type="number" dataKey="x" name={xd.label} domain={['auto', 'auto']} tick={{ fontSize: 11, fill: GREY }} tickFormatter={(v: number) => fmtStat(xd, v)} label={{ value: xd.label, position: 'insideBottom', offset: -12, fontSize: 11, fill: GREY }} />
            <YAxis type="number" dataKey="y" name={yd.label} domain={['auto', 'auto']} tick={{ fontSize: 11, fill: GREY }} tickFormatter={(v: number) => fmtStat(yd, v)} width={46} />
            <Tooltip content={<Tip />} cursor={{ strokeDasharray: '3 3' }} />
            {mx != null && <ReferenceLine x={mx} stroke="#9a948a" strokeDasharray="3 3" />}
            {my != null && <ReferenceLine y={my} stroke="#E36A5B" strokeDasharray="3 3" />}
            <Scatter data={rest} fill="#9BB04A" fillOpacity={0.55} isAnimationActive={false} />
            <Scatter data={mine} fill="#FF5722" stroke="#1A1A1A" isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize: 11, color: GREY }}>{pts.length.toLocaleString()} players. Dotted lines are the average of those shown.{mine.length ? ' Orange dots are players you follow.' : ''} Source: Baseball Savant, season to date.</div>
    </div>
  )
}

export function MyPlayersBody({ players }: { players: PlayerSummary[] }) {
  if (players.length === 0) return note(<>You are not following any players yet. Open a player&apos;s page and choose Follow.</>)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
      {players.map(p => (
        <Link key={p.id} href={`/mlb/players/${p.id}`} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', textDecoration: 'none', color: C.ink, background: '#FAF8F3' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{p.name} <span style={{ color: GREY, fontWeight: 500, fontSize: 12.5 }}>{p.team ?? ''}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 4, margin: '6px 0' }}>
            {p.stats.slice(0, 4).map(s => <div key={s.l}><div style={{ fontSize: 9.5, letterSpacing: '.08em', color: GREY, fontWeight: 800 }}>{s.l}</div><div style={{ fontWeight: 800, fontSize: 16, ...NUMS }}>{s.v}</div></div>)}
          </div>
          <div style={{ fontSize: 12, color: GREY }}>{p.lastGame ?? 'No game line yet'}{p.next ? ` · Next ${p.next}` : ''}</div>
        </Link>
      ))}
    </div>
  )
}

export function MyTeamsBody({ teams }: { teams: TeamSummary[] }) {
  if (teams.length === 0) return note('You are not following any teams yet. Choose a team in your preferences.')
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {teams.map(t => (
        <Link key={t.slug} href={`/mlb/teams/${t.slug}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', textDecoration: 'none', color: C.ink, background: '#FAF8F3' }}>
          <div><div style={{ fontWeight: 800, fontSize: 15 }}>{t.name}</div><div style={{ fontSize: 12, color: GREY }}>{t.last ?? 'No recent game'}{t.next ? ` · Next ${t.next}` : ''}</div></div>
          <div style={{ fontWeight: 800, fontSize: 20, ...NUMS, alignSelf: 'center' }}>{t.record ?? 'pending'}</div>
        </Link>
      ))}
    </div>
  )
}

/** Pitchers starred in the Pitch Shape Lab (kept in this browser), with their season line from the league rows. */
export function StarredBody({ pitchers, data }: { pitchers: LeagueRow[]; data: RoleData }) {
  const { ids } = useRoster()
  const miss = dataNote(data, 'pitcher')
  if (miss) return <>{miss}</>
  const mine = ids.map(id => pitchers.find(r => r.id === id)).filter((r): r is LeagueRow => !!r)
  if (mine.length === 0) return note(<>No starred pitchers yet. Star a pitcher in the <Link href="/mlb/lab/pitch-shape" style={{ color: C.orange, fontWeight: 800 }}>Pitch Shape Lab</Link> and they appear here.</>)
  const cols: [string, string][] = [['p_era', 'ERA'], ['xera', 'xERA'], ['k_pct', 'K%'], ['p_ip', 'IP']]
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {mine.map(r => (
        <Link key={r.id} href={`/mlb/players/${r.id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) repeat(4, minmax(0,.6fr))', gap: 6, alignItems: 'center', padding: '7px 0', borderTop: ROWLINE, textDecoration: 'none', color: C.ink, fontSize: 13 }}>
          <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}<span style={{ color: GREY, fontWeight: 500 }}> {r.team ?? ''}</span></b>
          {cols.map(([k, l]) => <span key={k} style={{ ...NUMS, textAlign: 'right' }}><span style={{ color: GREY, fontSize: 10 }}>{l} </span><b>{fmtStat(statDef('pitcher', k)!, r.s[k])}</b></span>)}
        </Link>
      ))}
    </div>
  )
}

export { dateShort }
