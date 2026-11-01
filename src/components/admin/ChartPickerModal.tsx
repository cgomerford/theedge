'use client'

// components/admin/ChartPickerModal.tsx
//
// The article writer's chart picker: choose a chart, search a player, preview it, insert it as an image (captured with html-to-image, uploaded through /api/admin/upload).
// Every chart reads real stored or public data and shows its sample and source underneath; with no data it shows an empty state, which is not captured.
// Pitcher charts read Baseball Savant's pitch-arsenal table (/api/pitcher-arsenal) or our pitch_arsenals table; percentiles read player_percentiles (admin route).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { loadFFmpegInstance } from '@/lib/video-export'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import type { ArsenalRow } from '@/app/api/pitcher-arsenal/route'
import type { PitchMovementRow } from '@/lib/pitcher-full-stats'
import type { PctBlock } from '@/lib/follows/percentiles'
import PitchUsageDonut from '@/components/PitchUsageDonut'
import PitchVeloChart from '@/components/PitchVeloChart'
import SprayChart from '@/components/SprayChart'
import PitchPathsPlayer from '@/components/admin/story-v5/remotion/scenes/paths'
import type { ArsenalPitch } from '@/components/admin/story-v5/types'
import { MLB_TEAMS, type Team } from '@/lib/teams'
import type { PitcherArm } from '@/lib/lab/team-pitch-makeup.server-fetch-allowed'
import type { PitLine } from '@/lib/team-profile/league'

/** Animation progress for the chart on show: 0 at the start, 1 when finished. Charts read it through useEase(); 1 means fully drawn (the normal still picture). */
const ProgressCtx = createContext(1)
const useEase = () => { const t = useContext(ProgressCtx); return 1 - Math.pow(1 - t, 3) }
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

type Person = { id: number; fullName: string; primaryPosition: string }
type Who = 'pitcher' | 'batter' | 'team'
interface Props { onInsert: (url: string) => void; onClose: () => void }

const SEASON = new Date().getFullYear()
const sourceLine = (what: string) => `${what}, ${SEASON}. Independent, not affiliated with MLB.`

function useJson<T>(url: string | null): { data: T | null; state: 'idle' | 'loading' | 'done' | 'error' } {
  const [s, set] = useState<{ data: T | null; state: 'idle' | 'loading' | 'done' | 'error' }>({ data: null, state: 'idle' })
  useEffect(() => {
    if (!url) { set({ data: null, state: 'idle' }); return }
    let live = true
    set({ data: null, state: 'loading' })
    fetch(url).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then(d => live && set({ data: d as T, state: 'done' })).catch(() => live && set({ data: null, state: 'error' }))
    return () => { live = false }
  }, [url])
  return s
}

const Note = ({ text }: { text: string }) => <div style={{ padding: '36px 12px', textAlign: 'center', fontSize: 13, color: C.mute }}>{text}</div>
const Head = ({ title, name, sub }: { title: string; name: string; sub?: string }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange }}>{title}</div>
    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{name}</div>
    {sub && <div style={{ fontSize: 12, color: '#5B5347' }}>{sub}</div>}
  </div>
)
const Foot = ({ text }: { text: string }) => <div style={{ fontSize: 9.5, color: '#8A8275', marginTop: 10 }}>{text}</div>

type Ctx = { playerId: number; name: string; team: Team }

/** Arsenal rows from Savant's pitch-arsenal table. */
function useArsenal(c: Ctx) { return useJson<{ rows: ArsenalRow[] }>(`/api/pitcher-arsenal?pitcherId=${c.playerId}&season=${SEASON}`) }
function useMovement(c: Ctx) { return useJson<{ rows: PitchMovementRow[] }>(`/api/admin/chart-data?kind=movement&playerId=${c.playerId}&season=${SEASON}`) }

function PitchMix(c: Ctx) {
  const { data, state } = useArsenal(c)
  if (state === 'loading') return <Note text="Loading…" />
  const rows = (data?.rows ?? []).filter(r => r.usage > 0)
  if (!rows.length) return <Note text="No pitch-mix data on record for this pitcher yet." />
  const n = rows.reduce((s, r) => s + r.pitches, 0)
  return <><Head title="Pitch mix" name={c.name} sub={`How often he throws each pitch · ${n.toLocaleString()} pitches`} /><PitchUsageDonut rows={rows} /><Foot text={sourceLine('Source: Baseball Savant pitch arsenal')} /></>
}

type Metric = { key: 'whiffPct' | 'estWoba' | 'hardHitPct' | 'kPct' | 'runValuePer100'; label: string; blurb: string; fmt: (v: number) => string }
const METRICS: Metric[] = [
  { key: 'whiffPct', label: 'Whiff%', blurb: 'Misses per swing, by pitch', fmt: v => `${v.toFixed(1)}%` },
  { key: 'estWoba', label: 'xwOBA against', blurb: 'Expected damage on contact, by pitch (lower is better for him)', fmt: v => v.toFixed(3).replace(/^0/, '') },
  { key: 'hardHitPct', label: 'Hard-hit%', blurb: 'Share of batted balls at 95+ mph, by pitch', fmt: v => `${v.toFixed(1)}%` },
  { key: 'kPct', label: 'K%', blurb: 'Strikeouts per plate appearance ending on the pitch', fmt: v => `${v.toFixed(1)}%` },
  { key: 'runValuePer100', label: 'Runs per 100 pitches', blurb: 'Runs above average per 100 pitches, Savant (negative is good for him)', fmt: v => v.toFixed(1) },
]
function PitchResults(c: Ctx & { metric: Metric }) {
  const { data, state } = useArsenal(c)
  if (state === 'loading') return <Note text="Loading…" />
  const e = useEase()
  const rows = (data?.rows ?? []).filter(r => r[c.metric.key] != null && r.pitches >= 50).map(r => ({ name: r.pitchName, type: r.pitchType, v: Number(r[c.metric.key]), n: r.pitches, shown: Number(r[c.metric.key]) * e }))
  if (!rows.length) return <Note text="No pitch with 50 or more pitches on record yet." />
  rows.sort((a, b) => b.v - a.v)
  return (
    <>
      <Head title={c.metric.label} name={c.name} sub={`${c.metric.blurb} · pitches thrown 50 or more times`} />
      <div style={{ height: rows.length * 44 + 20 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 72, top: 0, bottom: 0 }}>
            <XAxis type="number" hide domain={[Math.min(0, ...rows.map(r => r.v)), Math.max(...rows.map(r => r.v))]} />
            <YAxis type="category" dataKey="name" width={104} axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#1A1A1A', fontFamily: SANS }} />
            <Bar dataKey="shown" barSize={20} isAnimationActive={false}>
              {rows.map(r => <Cell key={r.type} fill={pitchColor(r.type)} />)}
              <LabelList dataKey="shown" position="right" formatter={(v: unknown) => c.metric.fmt(Number(v))} style={{ fontSize: 13, fontWeight: 800, fill: '#1A1A1A', fontFamily: SANS }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Foot text={`${rows.map(r => `${r.name} n = ${r.n.toLocaleString()}`).join(' · ')}. ${sourceLine('Source: Baseball Savant pitch arsenal')}`} />
    </>
  )
}

/** The pitch-movement chart is the Story v5 catcher-view animation: each pitch type's average real path flies to the plate, with its card. */
function Movement(c: Ctx) {
  const t = useContext(ProgressCtx)
  const { data, state } = useJson<{ pitches: ArsenalPitch[]; error?: string }>(`/api/admin/chart-data?kind=pitch-paths&playerId=${c.playerId}&season=${SEASON}`)
  if (state === 'loading') return <Note text="Loading his pitches from Baseball Savant… (about 10 to 20 seconds)" />
  const pitches = data?.pitches ?? []
  if (!pitches.length) return <Note text={data?.error ?? 'No pitch with 20 or more tracked pitches on record for this pitcher yet.'} />
  return <><PitchPathsPlayer name={c.name} season={SEASON} pitches={pitches} t={t} /><Foot text={`Average path of each pitch type with 20 or more pitches, from Statcast tracking. ${sourceLine('Source: Baseball Savant')}`} /></>
}
function Velocity(c: Ctx) {
  const { data, state } = useMovement(c)
  if (state === 'loading') return <Note text="Loading…" />
  const entries = (data?.rows ?? []).filter(r => r.avgVelocity != null).map(r => ({ pitchName: r.pitchName, pitchType: r.pitchType, avgVelo: Number(r.avgVelocity) })).sort((a, b) => b.avgVelo - a.avgVelo)
  if (!entries.length) return <Note text="No velocity data on record for this pitcher yet." />
  return <><Head title="Pitch velocity" name={c.name} sub="Average speed of each pitch, mph" /><PitchVeloChart entries={entries} /><Foot text={sourceLine('Source: Statcast pitch tracking')} /></>
}

function Spray(c: Ctx) {
  // isPro is passed explicitly as false: the picture is the free chart, so no Pro-only element can be captured into a public article.
  return <><Head title="Spray chart" name={c.name} sub="Where his batted balls went" /><SprayChart playerId={c.playerId} playerName={c.name} isPro={false} /><Foot text={sourceLine('Source: Baseball Savant batted balls')} /></>
}

function Percentiles(c: Ctx & { who: Who }) {
  const { data, state } = useJson<{ block: PctBlock | null; error?: string }>(`/api/admin/chart-data?kind=percentiles&playerId=${c.playerId}&role=${c.who}&season=${SEASON}`)
  if (state === 'loading') return <Note text="Loading…" />
  const b = data?.block
  if (!b || b.state === 'pending') return <Note text={data?.error ?? 'No percentile ranks on record for him yet.'} />
  if (b.state === 'small') return <Note text={`Too small a sample so far: ${b.n} of the ${b.need} ${c.who === 'pitcher' ? 'batters faced' : 'plate appearances'} needed.`} />
  const e = useEase()
  const tone = (p: number) => (p >= 70 ? '#FF5722' : p <= 30 ? '#5E7A99' : '#B7AF9F')
  return (
    <>
      <Head title="Percentile ranks" name={c.name} sub={`Against MLB, 100 is best · ${b.n.toLocaleString()} ${c.who === 'pitcher' ? 'batters faced' : 'plate appearances'}`} />
      <div style={{ display: 'grid', gap: 7 }}>
        {b.rows.map(r => (
          <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 34px', alignItems: 'center', gap: 10, fontSize: 12.5, fontWeight: 700 }}>
            <span>{r.label}</span>
            <span style={{ height: 14, background: '#F1EEE6', borderRadius: 4, position: 'relative' }}><span style={{ position: 'absolute', inset: 0, width: `${r.pct * e}%`, background: tone(r.pct), borderRadius: 4 }} /></span>
            <span style={{ fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(r.pct * e)}</span>
          </div>
        ))}
      </div>
      <Foot text={`${sourceLine('Source: Baseball Savant percentile rankings')} Orange is 70 or higher, blue is 30 or lower.`} />
    </>
  )
}


// ─── team charts ───
type LeagueRow = { id: number; abbr: string; name: string; all: PitLine | null; sp: PitLine | null; rp: PitLine | null }
const useLeague = () => useJson<{ rows: LeagueRow[]; error?: string }>(`/api/admin/chart-data?kind=league-pitching&season=${SEASON}`)

type TM = { key: string; label: string; lower: boolean; get: (l: PitLine) => number | null; fmt: (v: number) => string }
const d2 = (v: number) => v.toFixed(2), pc = (v: number) => `${(v * 100).toFixed(1)}%`
const TEAM_METRICS: TM[] = [
  { key: 'era', label: 'ERA', lower: true, get: l => l.era, fmt: d2 },
  { key: 'fip', label: 'FIP', lower: true, get: l => l.fip, fmt: d2 },
  { key: 'whip', label: 'WHIP', lower: true, get: l => l.whip, fmt: d2 },
  { key: 'k', label: 'K%', lower: false, get: l => l.kPct, fmt: pc },
  { key: 'bb', label: 'BB%', lower: true, get: l => l.bbPct, fmt: pc },
  { key: 'hr9', label: 'HR/9', lower: true, get: l => l.hr9, fmt: d2 },
]
const ord = (n: number) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th'}`
const rankOf = (rows: LeagueRow[], id: number, role: 'sp' | 'rp', m: TM): { v: number; rank: number; of: number } | null => {
  const vals = rows.flatMap(r => { const l = r[role]; const v = l ? m.get(l) : null; return v == null ? [] : [{ id: r.id, v }] })
  const mine = vals.find(x => x.id === id)
  if (!mine) return null
  return { v: mine.v, rank: 1 + vals.filter(x => (m.lower ? x.v < mine.v : x.v > mine.v)).length, of: vals.length }
}
const rankTone = (rank: number, of: number) => (rank <= 5 ? '#1D9E75' : rank > of - 5 ? '#D4533B' : '#8A8275')

function TeamSplit(c: Ctx) {
  const { data, state } = useLeague()
  if (state === 'loading') return <Note text="Loading…" />
  const rows = data?.rows ?? []
  if (!rows.length) return <Note text={data?.error ?? 'No league pitching table on record.'} />
  const mine = rows.find(r => r.id === c.team.id)
  const ip = (l: PitLine | null | undefined) => (l ? `${Math.round(l.ip)} IP` : '')
  return (
    <>
      <Head title="Starters and bullpen" name={c.team.name} sub={`How each group has pitched, with the rank among ${rows.length} clubs (1st is best)`} />
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: '8px 12px', alignItems: 'center' }}>
        <span /><b style={{ fontSize: 12 }}>Starters <span style={{ fontWeight: 400, color: C.mute }}>{ip(mine?.sp)}</span></b><b style={{ fontSize: 12 }}>Bullpen <span style={{ fontWeight: 400, color: C.mute }}>{ip(mine?.rp)}</span></b>
        {TEAM_METRICS.map(m => (
          <div key={m.key} style={{ display: 'contents' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#5B5347' }}>{m.label}</span>
            {(['sp', 'rp'] as const).map(role => {
              const r = rankOf(rows, c.team.id, role, m)
              return <span key={role} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{r ? m.fmt(r.v) : '—'}</span>
                {r && <span style={{ fontSize: 11, fontWeight: 800, color: rankTone(r.rank, r.of) }}>{ord(r.rank)} of {r.of}</span>}
              </span>
            })}
          </div>
        ))}
      </div>
      <Foot text={`${sourceLine('Source: MLB Stats API season splits for starters and relievers')} FIP uses the league constant for the season.`} />
    </>
  )
}

type LeagueMetric = { id: string; label: string; role: 'sp' | 'rp'; m: TM }
const byKey = (k: string) => TEAM_METRICS.find(m => m.key === k)!
const LEAGUE_METRICS: LeagueMetric[] = (['sp', 'rp'] as const).flatMap(role => TEAM_METRICS.map(m => ({ id: `${role}-${m.key}`, label: `${role === 'sp' ? 'Starter' : 'Bullpen'} ${m.label}`, role, m: byKey(m.key) })))
function LeagueRank(c: Ctx & { lm: LeagueMetric }) {
  const { data, state } = useLeague()
  if (state === 'loading') return <Note text="Loading…" />
  const all = data?.rows ?? []
  const e = useEase()
  const rows = all.flatMap(r => { const l = r[c.lm.role]; const v = l ? c.lm.m.get(l) : null; return v == null ? [] : [{ id: r.id, abbr: r.abbr, v, shown: (v ?? 0) * e }] }).sort((a, b) => (c.lm.m.lower ? a.v - b.v : b.v - a.v))
  if (!rows.length) return <Note text={data?.error ?? 'No league pitching table on record.'} />
  const i = rows.findIndex(r => r.id === c.team.id)
  return (
    <>
      <Head title={`${c.lm.label}, all ${rows.length} clubs`} name={c.team.name} sub={`${i >= 0 ? `${ord(i + 1)} of ${rows.length}` : 'Not ranked'} · ${c.lm.m.lower ? 'lower is better' : 'higher is better'}`} />
      <div style={{ height: rows.length * 20 + 10 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 56, top: 0, bottom: 0 }}>
            <XAxis type="number" hide domain={[0, Math.max(...rows.map(r => r.v))]} />
            <YAxis type="category" dataKey="abbr" width={40} axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 11, fontWeight: 700, fill: '#1A1A1A', fontFamily: SANS }} />
            <Bar dataKey="shown" barSize={13} isAnimationActive={false}>
              {rows.map(r => <Cell key={r.id} fill={r.id === c.team.id ? '#FF5722' : '#D6D2C8'} />)}
              <LabelList dataKey="shown" position="right" formatter={(v: unknown) => c.lm.m.fmt(Number(v))} style={{ fontSize: 11, fontWeight: 800, fill: '#1A1A1A', fontFamily: SANS }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Foot text={sourceLine('Source: MLB Stats API season splits')} />
    </>
  )
}

function TeamArm(c: Ctx & { role: 'all' | 'sp' | 'rp' }) {
  const { data, state } = useJson<{ arms: PitcherArm[]; low: number | null; high: number | null; pitches: number }>(`/api/admin/chart-data?kind=team-arm&teamId=${c.team.id}&role=${c.role}&season=${SEASON}`)
  if (state === 'loading') return <Note text="Loading… (the first load of a club can take a few seconds)" />
  const e = useEase()
  const arms = [...(data?.arms ?? [])].sort((a, b) => b.armAngle - a.armAngle).slice(0, 18)
  if (!arms.length) return <Note text="No arm-angle data on record for this club yet." />
  const max = Math.max(...arms.map(a => a.armAngle), 1)
  const who = c.role === 'sp' ? 'Starters' : c.role === 'rp' ? 'Bullpen' : 'All pitchers'
  return (
    <>
      <Head title={`Arm angle · ${who}`} name={c.team.name} sub="Degrees above horizontal, per pitcher. Higher is more over the top, lower is more sidearm." />
      <div style={{ display: 'grid', gap: 5 }}>
        {arms.map(a => (
          <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 46px', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name.includes(', ') ? a.name.split(', ').reverse().join(' ') : a.name} <span style={{ color: C.mute, fontWeight: 400 }}>{a.throws}</span></span>
            <span style={{ height: 12, background: '#F1EEE6', borderRadius: 3, position: 'relative' }}><span style={{ position: 'absolute', inset: 0, width: `${(a.armAngle / max) * 100 * e}%`, background: c.team.primary_color, borderRadius: 3 }} /></span>
            <span style={{ fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(a.armAngle * e).toFixed(0)}°</span>
          </div>
        ))}
      </div>
      <Foot text={`Each pitcher's average over ${(data?.pitches ?? 0).toLocaleString()} pitches, up to 18 shown. ${sourceLine('Source: Statcast pitch tracking')}`} />
    </>
  )
}

/** Where each pitcher on a club sits on the arm-angle line. League-wide arm angle is not stored (it would take 30 Savant pulls), so this places pitchers against their own staff. */
function TeamArmFit(c: Ctx & { role: 'all' | 'sp' | 'rp' }) {
  const e = useEase()
  const { data, state } = useJson<{ arms: PitcherArm[]; pitches: number }>(`/api/admin/chart-data?kind=team-arm&teamId=${c.team.id}&role=${c.role}&season=${SEASON}`)
  if (state === 'loading') return <Note text="Loading… (the first load of a club can take a few seconds)" />
  const arms = data?.arms ?? []
  if (arms.length < 2) return <Note text="Not enough arm-angle data on record for this club yet." />
  const total = arms.reduce((a, p) => a + p.pitches, 0)
  const avg = arms.reduce((a, p) => a + p.armAngle * p.pitches, 0) / total
  const lo = Math.min(...arms.map(a => a.armAngle)), hi = Math.max(...arms.map(a => a.armAngle))
  const W = 560, L = 20, R = 540, x = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (R - L)
  const low = arms.find(a => a.armAngle === lo)!, high = arms.find(a => a.armAngle === hi)!
  const sorted = [...arms].sort((a, b) => a.armAngle - b.armAngle)
  const stack: Record<number, number> = {}
  sorted.forEach((p, i) => { let h = 0; for (let j = i - 1; j >= 0 && x(p.armAngle) - x(sorted[j].armAngle) < 14; j--) h = Math.max(h, (stack[sorted[j].id] ?? 0) + 1); stack[p.id] = h })
  const nm = (n: string) => (n.includes(', ') ? n.split(', ').reverse().join(' ') : n)
  const who = c.role === 'sp' ? 'starters' : c.role === 'rp' ? 'bullpen' : 'pitchers'
  const shown = sorted.filter((_, i) => e * (sorted.length + 3) > i)
  return (
    <>
      <Head title={`Arm angle · ${who}`} name={c.team.name} sub="Where each pitcher sits between sidearm and over the top. Dot size is pitches thrown." />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '6px 0 4px' }}>
        <span style={{ fontSize: 56, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{(avg * e).toFixed(0)}°</span>
        <span style={{ fontSize: 13, color: '#5B5347' }}>average across {arms.length} pitchers, weighted by pitches</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} 190`} style={{ display: 'block' }}>
        <line x1={L} x2={R} y1={130} y2={130} stroke="#D6D2C8" strokeWidth={2} />
        <line x1={x(avg)} x2={x(avg)} y1={20} y2={138} stroke="#8A8275" strokeDasharray="3 3" />
        <text x={x(avg)} y={156} textAnchor="middle" fontSize={10} fontWeight={700} fill="#5B5347" fontFamily={SANS}>Staff average {avg.toFixed(0)}°</text>
        {shown.map(p => <circle key={p.id} cx={x(p.armAngle)} cy={124 - stack[p.id] * 13} r={4 + Math.sqrt(p.pitches / total) * 14} fill={c.team.primary_color} fillOpacity={0.8} />)}
        <text x={L} y={178} fontSize={10} fontWeight={700} fill="#5B5347" fontFamily={SANS}>Lowest: {nm(low.name)} {lo.toFixed(0)}°</text>
        <text x={R} y={178} textAnchor="end" fontSize={10} fontWeight={700} fill="#5B5347" fontFamily={SANS}>Highest: {nm(high.name)} {hi.toFixed(0)}°</text>
      </svg>
      <Foot text={`Each pitcher's average over ${total.toLocaleString()} pitches. Compared with his own staff, not the league. ${sourceLine('Source: Statcast pitch tracking')}`} />
    </>
  )
}

/** Where a club sits on one stat: the number, its rank, and all 30 clubs as dots on one line with only this club named. */
type FitMetric = { id: string; label: string; role: 'all' | 'sp' | 'rp'; m: TM }
const ROLE_WORD = { all: 'Team', sp: 'Starter', rp: 'Bullpen' } as const
const FIT_METRICS: FitMetric[] = (['all', 'sp', 'rp'] as const).flatMap(role => TEAM_METRICS.map(m => ({ id: `${role}-${m.key}`, label: `${ROLE_WORD[role]} ${m.label}`, role, m })))
const FIT_BLURB: Record<string, string> = { era: 'Runs per nine innings charged to the pitchers', fip: 'ERA with luck and defence taken out: strikeouts, walks, hit batters and home runs only', whip: 'Walks plus hits per inning', k: 'Share of batters faced who strike out', bb: 'Share of batters faced who walk', hr9: 'Home runs allowed per nine innings' }
function TeamFit(c: Ctx & { fm: FitMetric }) {
  const { data, state } = useLeague()
  const e = useEase()
  if (state === 'loading') return <Note text="Loading…" />
  const { role, m } = c.fm
  const pts = (data?.rows ?? []).flatMap(r => { const l = r[role]; const v = l ? m.get(l) : null; return v == null ? [] : [{ id: r.id, abbr: r.abbr, v }] })
  const mine = pts.find(p => p.id === c.team.id)
  if (!mine || pts.length < 2) return <Note text={data?.error ?? `No ${c.fm.label} on record yet.`} />
  const rank = 1 + pts.filter(p => (m.lower ? p.v < mine.v : p.v > mine.v)).length
  const avg = pts.reduce((a, p) => a + p.v, 0) / pts.length
  const lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v))
  const better = m.lower ? mine.v < avg : mine.v > avg
  const W = 560, L = 20, R = 540, x = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (R - L)
  const bestV = m.lower ? lo : hi, worstV = m.lower ? hi : lo
  const best = pts.find(p => p.v === bestV)!, worst = pts.find(p => p.v === worstV)!
  const sorted = [...pts].sort((a, b) => a.v - b.v)
  const stack: Record<number, number> = {}
  sorted.forEach((p, i) => { let h = 0; for (let j = i - 1; j >= 0 && x(p.v) - x(sorted[j].v) < 11; j--) h = Math.max(h, (stack[sorted[j].id] ?? 0) + 1); stack[p.id] = h })
  const shown = sorted.filter((_, i) => e * (sorted.length + 4) > i)
  const landed = clamp01((e - 0.8) / 0.2)
  return (
    <>
      <Head title={c.fm.label} name={c.team.name} sub={FIT_BLURB[m.key]} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, margin: '6px 0 4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.fmt(mine.v * e)}</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: rankTone(rank, pts.length), opacity: landed }}>{ord(rank)} of {pts.length}</span>
        <span style={{ fontSize: 12, color: '#5B5347', opacity: landed }}>{better ? 'Better than' : 'Behind'} the league average of {m.fmt(avg)}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} 180`} style={{ display: 'block' }}>
        <line x1={L} x2={R} y1={124} y2={124} stroke="#D6D2C8" strokeWidth={2} />
        <line x1={x(avg)} x2={x(avg)} y1={20} y2={132} stroke="#8A8275" strokeDasharray="3 3" />
        <text x={x(avg)} y={150} textAnchor="middle" fontSize={10} fontWeight={700} fill="#5B5347" fontFamily={SANS}>League average {m.fmt(avg)}</text>
        {shown.filter(p => p.id !== mine.id).map(p => <circle key={p.id} cx={x(p.v)} cy={118 - stack[p.id] * 11} r={4.5} fill="#B7AF9F" />)}
        <circle cx={x(mine.v)} cy={118 - stack[mine.id] * 11} r={8 * landed} fill="#FF5722" />
        <text x={x(mine.v)} y={118 - stack[mine.id] * 11 - 14} textAnchor="middle" fontSize={11} fontWeight={800} fill="#1A1A1A" opacity={landed} fontFamily={SANS}>{c.team.abbrev}</text>
        <text x={L} y={172} fontSize={10} fontWeight={700} fill={m.lower ? '#1D9E75' : '#D4533B'} fontFamily={SANS}>{m.lower ? `Best: ${best.abbr} ${m.fmt(lo)}` : `Lowest: ${worst.abbr} ${m.fmt(lo)}`}</text>
        <text x={R} y={172} textAnchor="end" fontSize={10} fontWeight={700} fill={m.lower ? '#D4533B' : '#1D9E75'} fontFamily={SANS}>{m.lower ? `Highest: ${worst.abbr} ${m.fmt(hi)}` : `Best: ${best.abbr} ${m.fmt(hi)}`}</text>
      </svg>
      <Foot text={`Each dot is one club; ${m.lower ? 'lower is better' : 'higher is better'}. ${sourceLine('Source: MLB Stats API season pitching')}`} />
    </>
  )
}

type Kind = { id: string; label: string; blurb: string; who: Who[]; render: React.ComponentType<Ctx & { who: Who; metric: Metric; fm: FitMetric }>; /** how it animates: its own bars and numbers move ('own'), or it is revealed left to right ('wipe') */ anim: 'own' | 'wipe'; /** the one-club 'where it fits' version of this chart, when it has one */ fit?: React.ComponentType<Ctx & { who: Who; metric: Metric; fm: FitMetric }> }
const KINDS: Kind[] = [
  { id: 'mix', label: 'Pitch mix', blurb: 'Donut of how often each pitch is thrown', who: ['pitcher'], render: PitchMix, anim: 'wipe' },
  ...METRICS.map((m): Kind => ({ id: `res-${m.key}`, label: `${m.label} by pitch`, blurb: m.blurb, who: ['pitcher'], render: c => <PitchResults {...c} metric={m} /> , anim: 'own' })),
  { id: 'move', label: 'Pitch movement (animated)', blurb: 'Story v5 catcher view: each pitch flies its real average path', who: ['pitcher'], render: Movement, anim: 'own' },
  { id: 'velo', label: 'Pitch velocity', blurb: 'Average mph of each pitch', who: ['pitcher'], render: Velocity, anim: 'wipe' },
  { id: 'spray', label: 'Spray chart', blurb: 'Where a hitter\'s batted balls went', who: ['batter'], render: Spray, anim: 'wipe' },
  { id: 'pct-b', label: 'Percentile ranks (hitter)', blurb: 'Savant percentiles vs MLB', who: ['batter'], render: c => <Percentiles {...c} who="batter" /> , anim: 'own' },
  { id: 'team-era', label: 'Team ERA, where it fits', blurb: 'One club: the number, its rank, and where it sits', who: ['team'], render: c => <TeamFit {...c} fm={FIT_METRICS[0]} />, anim: 'own' },
  { id: 'team-fit', label: 'Where a team sits (any stat)', blurb: 'Choose the stat: team, starters or bullpen', who: ['team'], render: TeamFit, anim: 'own' },
  { id: 'team-split', label: 'Starters vs bullpen', blurb: 'ERA, FIP, WHIP, K%, BB%, HR/9 with league rank', who: ['team'], render: TeamSplit, anim: 'wipe', fit: TeamFit },
  ...LEAGUE_METRICS.map((lm): Kind => ({ id: `lg-${lm.id}`, label: `${lm.label} · all 30`, blurb: 'Every club ranked, this club highlighted', who: ['team'], render: c => <LeagueRank {...c} lm={lm} />, anim: 'own', fit: c => <TeamFit {...c} fm={FIT_METRICS.find(m => m.id === lm.id)!} /> })),
  { id: 'team-arm-all', label: 'Team arm angle', blurb: 'Every pitcher on the club', who: ['team'], render: c => <TeamArm {...c} role="all" />, anim: 'own', fit: c => <TeamArmFit {...c} role="all" /> },
  { id: 'team-arm-sp', label: 'Team arm angle · starters', blurb: 'Starters only', who: ['team'], render: c => <TeamArm {...c} role="sp" />, anim: 'own', fit: c => <TeamArmFit {...c} role="sp" /> },
  { id: 'team-arm-rp', label: 'Team arm angle · bullpen', blurb: 'Relievers only', who: ['team'], render: c => <TeamArm {...c} role="rp" />, anim: 'own', fit: c => <TeamArmFit {...c} role="rp" /> },
  { id: 'pct-p', label: 'Percentile ranks (pitcher)', blurb: 'Savant percentiles vs MLB', who: ['pitcher'], render: c => <Percentiles {...c} who="pitcher" /> , anim: 'own' },
]

export default function ChartPickerModal({ onInsert, onClose }: Props) {
  const [kindId, setKindId] = useState(KINDS[0].id)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Person[]>([])
  const [player, setPlayer] = useState<{ playerId: number; name: string } | null>(null)
  const [teamId, setTeamId] = useState<number | null>(null)
  const [fitId, setFitId] = useState('sp-era')
  const [fitView, setFitView] = useState(false)
  const [t, setT] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState('')
  const raf = useRef(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kind = KINDS.find(k => k.id === kindId) ?? KINDS[0]
  const showFit = !!kind.fit && fitView
  const Chart = showFit && kind.fit ? kind.fit : kind.render
  const who = kind.who[0]
  const team = MLB_TEAMS.find(t => t.id === teamId) ?? MLB_TEAMS[0]
  const ready = who === 'team' ? teamId != null : player != null
  const ctx: Ctx = { playerId: player?.playerId ?? 0, name: who === 'team' ? team.name : player?.name ?? '', team }
  const fm = FIT_METRICS.find(m => m.id === fitId) ?? FIT_METRICS[0]
  const metric = METRICS.find(m => kind.id === `res-${m.key}`) ?? METRICS[0]

  const search = useCallback((v: string) => {
    setQuery(v)
    if (timer.current) clearTimeout(timer.current)
    if (v.trim().length < 2) { setFound([]); return }
    timer.current = setTimeout(async () => {
      try { setFound(((await (await fetch(`/api/lab/search?q=${encodeURIComponent(v.trim())}`)).json()) as { people: Person[] }).people.slice(0, 6)) } catch { setFound([]) }
    }, 250)
  }, [])

  const play = useCallback(() => {
    cancelAnimationFrame(raf.current)
    setPlaying(true)
    const t0 = performance.now(), DUR = 2400
    const step = (now: number) => { const p = Math.min(1, (now - t0) / DUR); setT(p); if (p < 1) raf.current = requestAnimationFrame(step); else setPlaying(false) }
    setT(0); raf.current = requestAnimationFrame(step)
  }, [])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  /** Draws the chart at 30 points along its animation, then asks ffmpeg.wasm (already used for the story videos) to join the pictures into one looping GIF that holds on the finished chart. */
  async function insertAnimated() {
    if (!stage.current || !ready) return
    setBusy(true); setError('')
    try {
      cancelAnimationFrame(raf.current); setPlaying(false)
      const N = 30
      const frames: Uint8Array[] = []
      for (let i = 0; i < N; i++) {
        setStatus(`Drawing frame ${i + 1} of ${N}`)
        setT(i / (N - 1))
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40))))
        const url = await toPng(stage.current, { pixelRatio: 1.2, backgroundColor: '#FAF8F3' })
        frames.push(new Uint8Array(await (await fetch(url)).arrayBuffer()))
      }
      setT(1)
      setStatus('Joining the frames into a GIF (the first time loads the video tool, about 30 MB)')
      const { ffmpeg } = await loadFFmpegInstance()
      for (let i = 0; i < frames.length; i++) await ffmpeg.writeFile(`f${String(i).padStart(3, '0')}.png`, frames[i])
      await ffmpeg.exec(['-framerate', '15', '-i', 'f%03d.png', '-vf', 'tpad=stop_mode=clone:stop_duration=2,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5', '-loop', '0', 'out.gif'])
      const data = (await ffmpeg.readFile('out.gif')) as Uint8Array
      const buf = new ArrayBuffer(data.byteLength); new Uint8Array(buf).set(data)
      const blob = new Blob([buf], { type: 'image/gif' })
      if (blob.size > 4_000_000) throw new Error(`The GIF is ${(blob.size / 1e6).toFixed(1)} MB; the upload limit is about 4 MB. Try a chart with fewer rows.`)
      setStatus('Uploading')
      const form = new FormData(); form.append('file', blob, 'chart.gif')
      const res = await fetch('/api/admin/upload', { method: 'POST', body: form })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Upload failed')
      onInsert(((await res.json()) as { url: string }).url)
      onClose()
    } catch (e) {
      console.error('[ChartPickerModal] animated insert failed:', e instanceof Error ? e.message : e)
      setError(e instanceof Error ? e.message : 'Animation failed')
    } finally { setBusy(false); setStatus(''); setT(1) }
  }

  async function insert() {
    if (!stage.current || !ready) return
    setBusy(true); setError('')
    try {
      await new Promise(r => setTimeout(r, 600)) // let a Recharts / fetch-driven chart finish drawing before the snapshot
      const dataUrl = await toPng(stage.current, { pixelRatio: 2, backgroundColor: '#FAF8F3' })
      const form = new FormData()
      form.append('file', await (await fetch(dataUrl)).blob(), 'chart.png')
      const res = await fetch('/api/admin/upload', { method: 'POST', body: form })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Upload failed')
      onInsert(((await res.json()) as { url: string }).url)
      onClose()
    } catch (e) {
      console.error('[ChartPickerModal] insert failed:', e instanceof Error ? e.message : e)
      setError(e instanceof Error ? e.message : 'Capture failed')
    } finally { setBusy(false) }
  }

  const groups: { title: string; ids: string[] }[] = [
    { title: 'Pitchers', ids: KINDS.filter(k => k.who[0] === 'pitcher').map(k => k.id) },
    { title: 'Hitters', ids: KINDS.filter(k => k.who[0] === 'batter').map(k => k.id) },
    { title: 'Teams', ids: KINDS.filter(k => k.who[0] === 'team').map(k => k.id) },
  ]
  const inp: React.CSSProperties = { width: '100%', padding: '9px 10px', border: `1px solid ${C.line}`, borderRadius: 6, background: '#fff', fontFamily: SANS, fontSize: 14, boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, fontFamily: SANS }}>
      <div style={{ background: '#FAF8F3', border: `1px solid ${C.line}`, borderRadius: 14, padding: 22, width: 'min(1040px, 96vw)', maxHeight: '92vh', overflowY: 'auto', color: C.ink }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>⊕ Insert chart</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: SANS }}>Close</button>
        </div>
        <div className="cp-grid" style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 18 }}>
          <style>{'@media (max-width: 760px){.cp-grid{grid-template-columns:1fr !important}}'}</style>
          <div>
            {groups.map(g => (
              <div key={g.title} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.mute, marginBottom: 5 }}>{g.title}</div>
                {g.ids.map(id => {
                  const k = KINDS.find(x => x.id === id)!
                  return (
                    <button key={id} onClick={() => { setKindId(id); setFound([]); setQuery(''); if (KINDS.find(x => x.id === id)?.who[0] !== who) setPlayer(null) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', marginBottom: 4, borderRadius: 6, border: `1px solid ${id === kindId ? C.orange : C.line}`, background: id === kindId ? '#FFF1EA' : '#fff', cursor: 'pointer', fontFamily: SANS }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{k.label}</div>
                      <div style={{ fontSize: 11, color: C.mute }}>{k.blurb}</div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div>
            {who === 'team' ? (
              <>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.mute, marginBottom: 5 }}>Team</label>
                <select style={inp} value={teamId ?? ''} onChange={e => setTeamId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Choose a team</option>
                  {[...MLB_TEAMS].sort((a, b) => a.name.localeCompare(b.name)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {kind.fit && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {[[false, 'Full chart'], [true, 'Just this club: where it fits']].map(([v, label]) => <button key={String(v)} onClick={() => setFitView(v as boolean)} style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: `1px solid ${fitView === v ? C.orange : C.line}`, background: fitView === v ? '#FFF1EA' : '#fff', cursor: 'pointer', fontFamily: SANS, fontSize: 12.5, fontWeight: 800 }}>{label as string}</button>)}
                  </div>
                )}
                {(kind.id === 'team-fit' || (showFit && kind.id === 'team-split')) && (
                  <select style={{ ...inp, marginTop: 8 }} value={fitId} onChange={e => setFitId(e.target.value)}>
                    {FIT_METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                )}
              </>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: C.mute, marginBottom: 5 }}>{who === 'pitcher' ? 'Pitcher' : 'Hitter'}</label>
                <input style={inp} value={query} placeholder="Search by name" onChange={e => search(e.target.value)} />
                {found.map(p => <button key={p.id} onClick={() => { setPlayer({ playerId: p.id, name: p.fullName }); setQuery(p.fullName); setFound([]) }} style={{ display: 'block', margin: '5px 0 0', padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer', fontFamily: SANS, fontSize: 13 }}>{p.fullName} · {p.primaryPosition}</button>)}
              </>
            )}
            <div style={{ marginTop: 14, border: `1px dashed ${C.line}`, borderRadius: 8, padding: 10, background: '#fff', overflowX: 'auto' }}>
              {ready ? (
                <div ref={stage} style={{ width: 600, padding: 20, background: '#FAF8F3', fontFamily: SANS, color: C.ink }}><ProgressCtx.Provider value={t}><div style={kind.anim === 'wipe' && !showFit && t < 1 ? { clipPath: `inset(0 ${(1 - (1 - Math.pow(1 - t, 3))) * 100}% 0 0)` } : undefined}><Chart key={`${kindId}-${showFit}-${fitId}-${ctx.playerId}-${ctx.team.id}`} {...ctx} who={who} metric={metric} fm={fm} /></div></ProgressCtx.Provider></div>
              ) : <Note text={who === 'team' ? 'Choose a team to see the chart here.' : 'Search and choose a player to see the chart here.'} />}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={play} disabled={!ready || busy || playing} style={{ flex: 1, padding: 11, background: '#fff', color: C.ink, border: `1px solid ${C.ink}`, borderRadius: 6, fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', cursor: ready ? 'pointer' : 'default', opacity: ready && !busy ? 1 : 0.4, fontFamily: SANS }}>{playing ? 'Playing…' : 'Preview animation'}</button>
              <button type="button" onClick={insertAnimated} disabled={!ready || busy} style={{ flex: 1, padding: 11, background: C.orange, color: '#1A1A1A', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', cursor: ready ? 'pointer' : 'default', opacity: ready && !busy ? 1 : 0.4, fontFamily: SANS }}>Insert animated (GIF)</button>
            </div>
            <button type="button" onClick={insert} disabled={!ready || busy} style={{ width: '100%', marginTop: 8, padding: 12, background: C.ink, color: '#FAF8F3', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', cursor: ready ? 'pointer' : 'default', opacity: ready && !busy ? 1 : 0.4, fontFamily: SANS }}>{busy ? (status || 'Capturing…') : 'Insert still picture'}</button>
            {error && <div style={{ marginTop: 10, fontSize: 12, color: '#D4533B' }}>{error}</div>}
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 8 }}>Inserted as a picture of the chart above, with its sample and source line. Check the preview first; a chart that says there is no data should not be inserted.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
