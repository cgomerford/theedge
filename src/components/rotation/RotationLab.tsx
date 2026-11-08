'use client'

// The Rotation Lab: one club's rotation as a dashboard. Cards for the five starters (status, the signals that fired, a speed line), a signal matrix across
// the rotation, one pitcher opened in full (charts, the reasons in words, links to the other labs), the depth and injured arms, and every club's rotation
// ranked by flags. Everything arrives from the server already worked out (src/lib/rotation/flags.ts); this file only draws it.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { C, SANS } from '@/components/team/ui'
import { Headshot, TeamBadge } from '@/components/front-office/pitching/Avatar'
import { inningsText, wmean, type PitcherRead, type Signal, type Status, type TeamRotation } from '@/lib/rotation/flags'
import { ArmChart, LoadChart, ReleaseChart, VeloChart } from './Charts'

export type TeamHead = { abbr: string; name: string; id: number; primary: string; text: string }
export type TeamOption = { abbr: string; name: string; group: string }
export type LeagueLite = { abbr: string; name: string; id: number; flagged: number; watch: number; steady: number; thin: number; out: number; rotation: number; lead: { name: string; why: string } | null }

const STATUS: Record<Status, { fg: string; bg: string; label: string }> = {
  steady: { fg: '#1D6B50', bg: '#E3F3EC', label: 'Steady' },
  watch: { fg: '#8A6508', bg: '#FBF1D2', label: 'Watch' },
  flagged: { fg: '#A8321F', bg: '#FBE3DD', label: 'Flagged' },
  out: { fg: '#3d4f63', bg: '#E1E9F1', label: 'Injured list' },
  thin: { fg: '#6E6A60', bg: '#F3F0E8', label: 'Too few starts' },
}
const LEVEL = {
  ok: { fg: '#1D6B50', bg: '#E3F3EC' }, watch: { fg: '#8A6508', bg: '#FBF1D2' }, flag: { fg: '#A8321F', bg: '#FBE3DD' }, na: { fg: '#a89e8c', bg: '#F3F0E8' },
}
const MATRIX: Signal['key'][] = ['velo', 'late', 'load', 'rest', 'slot', 'miss']
const MATRIX_LABEL: Record<Signal['key'], string> = { velo: 'Fastball speed', late: 'Late-outing speed', load: 'Pitch count', rest: 'Rest', slot: 'Release & arm slot', miss: 'Strikes won' }

const md = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—')
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const fired = (p: PitcherRead) => p.signals.filter(s => s.key !== 'miss' && (s.level === 'watch' || s.level === 'flag'))

const CSS = `
.rl-grid5{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
.rl-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}
.rl-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.rl-card{transition:box-shadow .12s,border-color .12s}
.rl-card:hover{box-shadow:0 4px 14px #1a1a1a14}
.rl-card:focus-visible,.rl-link:focus-visible,.rl-row:focus-visible{outline:2px solid #FF5722;outline-offset:2px}
.rl-row:hover{background:#FFF8F0}
@media (max-width:1180px){.rl-grid5{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:760px){.rl-grid5{grid-template-columns:repeat(2,minmax(0,1fr))}.rl-two,.rl-three{grid-template-columns:minmax(0,1fr)}}
@media (max-width:480px){.rl-grid5{grid-template-columns:minmax(0,1fr)}}
`

function Chip({ status }: { status: Status }) {
  const s = STATUS[status]
  return <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: s.fg, background: s.bg, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>{s.label}</span>
}

function Spark({ p }: { p: PitcherRead }) {
  const pts = p.series.slice(-12).map(x => x.v)
  const vals = pts.filter((v): v is number => v != null)
  if (vals.length < 3) return <div style={{ height: 30, fontSize: 11, color: C.faint, display: 'flex', alignItems: 'center' }}>No fastball line yet</div>
  const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(0.6, hi - lo)
  const W = 120, H = 30
  const xy = pts.map((v, i) => (v == null ? null : [(i / Math.max(1, pts.length - 1)) * (W - 6) + 3, H - 4 - ((v - lo) / span) * (H - 8)] as const))
  const line = xy.filter((q): q is readonly [number, number] => q != null).map(q => q.join(',')).join(' ')
  const tail = xy.slice(-3).filter((q): q is readonly [number, number] => q != null)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Fastball speed by outing, last twelve starts" style={{ display: 'block' }}>
      <polyline points={line} fill="none" stroke="#c9c2b2" strokeWidth="1.6" />
      {tail.length > 1 && <polyline points={tail.map(q => q.join(',')).join(' ')} fill="none" stroke={C.orange} strokeWidth="2.4" />}
      {tail.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r="2.2" fill={C.orange} />)}
    </svg>
  )
}

function PitcherCard({ p, on, onPick }: { p: PitcherRead; on: boolean; onPick: () => void }) {
  const last3 = p.series.slice(-3)
  const ppo = avg(p.series.map(s => s.pitches))
  const f = fired(p)
  return (
    <button type="button" onClick={onPick} aria-pressed={on} className="rl-card"
      style={{ textAlign: 'left', cursor: 'pointer', background: C.card, border: `${on ? 2 : 1}px solid ${on ? C.orange : C.line}`, borderRadius: 14, padding: on ? 13 : 14, minWidth: 0, fontFamily: SANS, color: C.ink, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Headshot id={p.id} size={46} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
          <div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>{p.throws === 'L' ? 'LHP' : p.throws === 'R' ? 'RHP' : 'P'} · {p.starts} starts</div>
        </div>
      </div>
      <div><Chip status={p.status} /></div>
      <Spark p={p} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
        {[['IP', inningsText(p.outs)], ['P/outing', ppo == null ? '—' : String(Math.round(ppo))], ['Last', md(p.lastDate)]].map(([k, v]) => (
          <div key={k}><div style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint, fontWeight: 700 }}>{k}</div><div style={{ fontWeight: 800, fontSize: 14 }}>{v}</div></div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 22 }}>
        {p.status === 'out' ? <span style={{ fontSize: 11.5, color: '#3d4f63' }}>{p.ilDesc}</span>
          : p.status === 'thin' ? <span style={{ fontSize: 11.5, color: C.mute }}>{p.starts} starts so far; four are needed to read him.</span>
          : f.length === 0 ? <span style={{ fontSize: 11.5, color: C.mute }}>No signals fired over his last {last3.length} starts.</span>
          : f.map(s => <span key={s.key} style={{ fontSize: 11, fontWeight: 700, color: LEVEL[s.level].fg, background: LEVEL[s.level].bg, borderRadius: 6, padding: '2px 7px' }}>{s.label} {s.value}</span>)}
      </div>
    </button>
  )
}

function Matrix({ pitchers, onPick, sel }: { pitchers: PitcherRead[]; onPick: (id: number) => void; sel: number }) {
  const th: React.CSSProperties = { fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint, fontWeight: 700, textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: SANS, fontSize: 13, minWidth: 760 }}>
        <thead><tr><th style={th}>Pitcher</th>{MATRIX.map(k => <th key={k} style={th}>{MATRIX_LABEL[k]}</th>)}<th style={th}>Status</th></tr></thead>
        <tbody>
          {pitchers.map(p => (
            <tr key={p.id} className="rl-row" tabIndex={0} onClick={() => onPick(p.id)} onKeyDown={e => { if (e.key === 'Enter') onPick(p.id) }}
              style={{ cursor: 'pointer', background: p.id === sel ? '#FFF3EA' : undefined }}>
              <td style={{ padding: '8px 10px', borderBottom: `1px solid ${C.soft}`, fontWeight: 700, whiteSpace: 'nowrap' }}>{p.name}</td>
              {MATRIX.map(k => {
                const s = p.signals.find(x => x.key === k)
                const lv = s ? LEVEL[s.level] : LEVEL.na
                return (
                  <td key={k} title={s?.detail ?? ''} style={{ padding: '6px 6px', borderBottom: `1px solid ${C.soft}` }}>
                    <span style={{ display: 'block', background: lv.bg, color: lv.fg, borderRadius: 6, padding: '4px 8px', fontWeight: 700, fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'center' }}>{s?.value ?? '—'}</span>
                  </td>
                )
              })}
              <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.soft}` }}><Chip status={p.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const LABS = (id: number) => [
  { label: 'Pitching Lab', note: 'Arsenal, locations, trends', href: `/mlb/lab/pitching-lab/${id}` },
  { label: 'Pitch shape', note: 'Ride and run against the league', href: `/mlb/lab/pitching-lab/${id}/shape` },
  { label: 'x9Stuff Lab', note: 'Stuff and command grades', href: `/mlb/lab/stuff?pitcher=${id}` },
  { label: 'Sequencing Lab', note: 'What he throws next', href: `/mlb/lab/sequencing?pitcher=${id}` },
  { label: 'Player page', note: 'Season line and career', href: `/mlb/players/${id}` },
]

function Detail({ p }: { p: PitcherRead }) {
  const recent = p.series.slice(-6).reverse()
  const f = p.signals.filter(s => s.level !== 'na')
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <Headshot id={p.id} size={56} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{p.name}</div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 3 }}>
            {p.throws === 'L' ? 'Left-handed' : p.throws === 'R' ? 'Right-handed' : ''} · {p.starts} starts · {inningsText(p.outs)} IP · {p.k} K, {p.bb} BB
            {p.seasonVelo != null && ` · ${p.fbType === 'SI' ? 'sinker' : 'four-seam'} ${p.seasonVelo.toFixed(1)} mph`}
          </div>
        </div>
        <Chip status={p.status} />
      </div>

      {p.status === 'out' && <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#3d4f63', background: '#E1E9F1', borderRadius: 10, padding: '10px 12px' }}>{p.ilDesc}. The signals below are from his last three starts before that.</p>}
      {p.status === 'thin' && <p style={{ margin: 0, fontSize: 13.5, color: C.mute }}>He has {p.starts} starts this season. The flags compare his last three starts with at least three earlier ones, so none is shown yet.</p>}

      {p.signals.length > 0 && (
        <>
          <div className="rl-three" style={{ marginBottom: 6 }}>
            {f.map(s => {
              const lv = LEVEL[s.level]
              return (
                <div key={s.key} style={{ border: `1px solid ${C.line}`, borderLeft: `4px solid ${lv.fg}`, borderRadius: 10, padding: '9px 12px', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 800, color: C.mute }}>{s.label}</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: lv.fg, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#5b5347', marginTop: 4, lineHeight: 1.4 }}>{s.detail}</div>
                </div>
              )
            })}
          </div>
          <div style={{ height: 14 }} />
          <div className="rl-two">
            <VeloChart series={p.series} fb={p.fbType} />
            <LoadChart series={p.series} />
          </div>
          <div style={{ height: 18 }} />
          <div className="rl-two">
            <ReleaseChart series={p.series} />
            <ArmChart series={p.series} />
          </div>
        </>
      )}

      <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: C.orange, margin: '20px 0 8px' }}>Last six starts</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 560 }}>
          <thead><tr>{['Date', 'Opponent', 'IP', 'Pitches', 'K', 'BB', 'Rest', 'Fastball', 'First 25', 'Last 25'].map(h => <th key={h} style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint, fontWeight: 700, textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${C.line}` }}>{h}</th>)}</tr></thead>
          <tbody>
            {recent.map(s => (
              <tr key={s.date + s.pitches}>
                {[md(s.date), s.opp ?? '—', inningsText(s.outs), s.pitches, s.k, s.bb, s.restDays == null ? '—' : `${s.restDays}d`, s.v?.toFixed(1) ?? '—', s.e?.toFixed(1) ?? '—', s.l?.toFixed(1) ?? '—'].map((c, i) => <td key={i} style={{ padding: '6px 8px', borderBottom: `1px solid ${C.soft}`, fontWeight: i === 3 ? 700 : 400 }}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: C.orange, margin: '20px 0 8px' }}>Take {p.name.split(' ').slice(-1)[0]} into another lab</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {LABS(p.id).map(l => (
          <Link key={l.label} href={l.href} className="rl-link" style={{ textDecoration: 'none', color: C.ink, border: `1px solid ${C.line}`, borderRadius: 10, padding: '8px 12px', background: '#fff', minWidth: 150 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{l.label} →</div>
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1 }}>{l.note}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function Mini({ p, onPick, on }: { p: PitcherRead; onPick: () => void; on: boolean }) {
  return (
    <button type="button" onClick={onPick} className="rl-row" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer', background: on ? '#FFF3EA' : '#fff', border: `1px solid ${on ? C.orange : C.line}`, borderRadius: 10, padding: '8px 10px', fontFamily: SANS, color: C.ink }}>
      <Headshot id={p.id} size={30} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>{p.name}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: C.mute }}>{p.status === 'out' ? p.ilDesc : `${p.starts} starts · last ${md(p.lastDate)}`}</span>
      </span>
      <Chip status={p.status} />
    </button>
  )
}

export default function RotationLab({ team, teams, read, league, asOf, season }: { team: TeamHead; teams: TeamOption[]; read: TeamRotation; league: LeagueLite[]; asOf: string; season: number }) {
  const router = useRouter()
  const all = [...read.rotation, ...read.depth, ...read.out]
  const [sel, setSel] = useState<number>((read.rotation.find(p => p.status === 'flagged') ?? read.rotation[0] ?? all[0])?.id ?? 0)
  const open = all.find(p => p.id === sel) ?? all[0]
  const count = (s: Status) => read.rotation.filter(p => p.status === s).length
  const ppo = avg(read.rotation.flatMap(p => p.series.slice(-3).map(s => s.pitches)))
  const rests = read.rotation.flatMap(p => p.series.slice(-3).map(s => s.restDays).filter((x): x is number => x != null))
  const velo = wmean(read.rotation.filter(p => p.fbType === 'FF'), p => p.seasonVelo, p => p.starts).mean
  const groups = Array.from(new Set(teams.map(t => t.group)))

  return (
    <div style={{ fontFamily: SANS, color: C.ink }}>
      <style>{CSS}</style>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 14px' }}>
        <label htmlFor="rl-team" style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: C.mute }}>Club</label>
        <select id="rl-team" value={team.abbr} onChange={e => router.push(`/mlb/lab/rotation?team=${e.target.value}`)}
          style={{ fontFamily: SANS, fontSize: 14, fontWeight: 700, padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.line}`, background: '#fff', color: C.ink }}>
          {groups.map(g => <optgroup key={g} label={g}>{teams.filter(t => t.group === g).map(t => <option key={t.abbr} value={t.abbr}>{t.name}</option>)}</optgroup>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.mute }}>Data through {md(asOf)}, {season} regular season</span>
      </div>

      <div style={{ background: team.primary, color: team.text, borderRadius: 16, padding: '20px 24px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <TeamBadge id={team.id} size={64} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 700, opacity: .8 }}>{season} rotation</div>
          <div style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{team.name}</div>
          <div style={{ fontSize: 14, marginTop: 6, opacity: .92 }}>
            {read.rotation.length === 0 ? 'No starts on record.'
              : count('flagged') + count('watch') === 0 ? `${count('steady')} of ${read.rotation.length} starters steady. No signals fired.`
              : `${count('flagged')} flagged, ${count('watch')} on watch, ${count('steady')} steady, out of ${read.rotation.length} starters.`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[['Pitches per outing', ppo == null ? '—' : String(Math.round(ppo)), 'last three starts'], ['Days of rest', rests.length ? (avg(rests) as number).toFixed(1) : '—', 'before them'], ['Four-seam', velo == null ? '—' : velo.toFixed(1), 'mph, season']].map(([k, v, n]) => (
            <div key={k} style={{ background: '#ffffff26', borderRadius: 12, padding: '8px 14px', minWidth: 112 }}>
              <div style={{ fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 700, opacity: .85 }}>{k}</div>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              <div style={{ fontSize: 10.5, opacity: .8 }}>{n}</div>
            </div>
          ))}
        </div>
      </div>

      {read.rotation.length === 0 ? (
        <p style={{ padding: '40px 0', textAlign: 'center', color: C.faint, fontStyle: 'italic' }}>No starters found for this club in the data.</p>
      ) : (
        <>
          <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: C.orange, margin: '24px 0 4px' }}>The rotation</div>
          <p style={{ margin: '0 0 10px', fontSize: 13.5, color: '#5b5347' }}>His five most-used starters over the club&apos;s last 35 days. Select one to open him below.</p>
          <div className="rl-grid5">{read.rotation.map(p => <PitcherCard key={p.id} p={p} on={p.id === sel} onPick={() => setSel(p.id)} />)}</div>

          <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: C.orange, margin: '28px 0 4px' }}>Signal board</div>
          <p style={{ margin: '0 0 10px', fontSize: 13.5, color: '#5b5347' }}>Each cell compares his last three starts with his earlier ones this season. Green is steady, amber is worth watching, red is flagged. Hover a cell for the numbers.</p>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '6px 8px' }}>
            <Matrix pitchers={read.rotation} onPick={setSel} sel={sel} />
          </div>
        </>
      )}

      {open && (
        <>
          <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: C.orange, margin: '28px 0 10px' }}>Pitcher detail</div>
          <Detail key={open.id} p={open} />
        </>
      )}

      {(read.depth.length > 0 || read.out.length > 0) && (
        <div className="rl-two" style={{ marginTop: 24, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: C.orange, margin: '0 0 8px' }}>Other starters</div>
            <div style={{ display: 'grid', gap: 8 }}>{read.depth.length ? read.depth.map(p => <Mini key={p.id} p={p} on={p.id === sel} onPick={() => setSel(p.id)} />) : <span style={{ fontSize: 13, color: C.faint }}>None with three or more starts.</span>}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: C.orange, margin: '0 0 8px' }}>Injured starters</div>
            <div style={{ display: 'grid', gap: 8 }}>{read.out.length ? read.out.map(p => <Mini key={p.id} p={p} on={p.id === sel} onPick={() => setSel(p.id)} />) : <span style={{ fontSize: 13, color: C.faint }}>No starter with five or more starts is on the injured list.</span>}</div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 700, color: C.orange, margin: '32px 0 4px' }}>Around the league</div>
      <p style={{ margin: '0 0 10px', fontSize: 13.5, color: '#5b5347' }}>Every club&apos;s rotation, most flags first. Select a club to open it.</p>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '6px 8px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
          <thead><tr>{['Club', 'Flagged', 'Watch', 'Steady', 'Most signals'].map(h => <th key={h} style={{ fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.faint, fontWeight: 700, textAlign: 'left', padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>{h}</th>)}</tr></thead>
          <tbody>
            {league.map(t => (
              <tr key={t.abbr} className="rl-row" style={{ background: t.abbr === team.abbr ? '#FFF3EA' : undefined }}>
                <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.soft}` }}>
                  <Link href={`/mlb/lab/rotation?team=${t.abbr}`} className="rl-link" style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.ink, textDecoration: 'none', fontWeight: 700 }}><TeamBadge id={t.id} size={26} />{t.name}</Link>
                </td>
                {[t.flagged, t.watch, t.steady].map((n, i) => (
                  <td key={i} style={{ padding: '6px 10px', borderBottom: `1px solid ${C.soft}`, fontVariantNumeric: 'tabular-nums', fontWeight: n ? 800 : 400, color: n ? [STATUS.flagged.fg, STATUS.watch.fg, STATUS.steady.fg][i] : C.faint }}>{n}</td>
                ))}
                <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.soft}`, color: '#5b5347', fontSize: 12.5 }}>{t.lead ? <><b style={{ color: C.ink }}>{t.lead.name}</b> · {t.lead.why}</> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ background: C.soft, borderRadius: 14, padding: '16px 20px', marginTop: 28, fontSize: 12.5, lineHeight: 1.6, color: '#5b5347' }}>
        <div style={{ fontWeight: 800, color: C.ink, marginBottom: 4 }}>How the flags work</div>
        Every signal sets a pitcher&apos;s last three starts against his earlier starts this season, so a pitcher who has always thrown 93 is not flagged for throwing 93.
        <b> Fastball speed</b>: his main fastball&apos;s average speed; watch at 0.5 mph down, flagged at 1.0. <b>Late-outing speed</b>: the speed he loses between his first 25 and last 25 pitches in outings of 70 or more; watch when it is 0.8 mph wider than usual, flagged at 1.5.
        <b> Pitch count</b>: watch at an average of 95 or a 110-pitch outing, flagged at 100 or 115. <b>Rest</b>: starts on three days of rest or fewer among the last four; watch at one, flagged at two.
        <b> Release &amp; arm slot</b>: release height and arm angle on that fastball; watch at 0.15 ft lower or 3 degrees, flagged at 0.25 ft or 5 degrees. <b>Strikes won</b>: called plus swinging strikes per pitch, shown for context and never changes the status.
        <b> Flagged</b> means fastball speed is down 1 mph or more, or two signals fired with one of them red. <b>Watch</b> means one or more fired. These are trends in public tracking data, not medical assessments, and a flag describes what already happened.
        Source: Baseball Savant pitch data and the MLB Stats API (injured list), refreshed daily. Starters are the first pitcher each club used in a game. Pitchers traded in-season are read across both clubs.
      </div>
    </div>
  )
}
