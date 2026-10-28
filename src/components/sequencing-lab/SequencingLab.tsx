'use client'

// src/components/sequencing-lab/SequencingLab.tsx
//
// The league-wide Sequencing Lab. Three views:
//   Compare pitchers  every pitcher in one sortable table: how often he repeats a pitch, goes from a fastball to something slower (and back), starts with a fastball,
//                     and what he throws with two strikes, each against the league. Filter by hitter side, throwing hand and name.
//   Pitcher           one pitcher in full: what he throws after each pitch (a grid, with the league beside it), what he throws in each count, and where he goes in that count
//                     (Statcast's 13 zones, because exact location is not stored)
//   League            the same two grids for the whole league
// Movement and foul types need data that is not stored yet, so they sit in marked "Pending" blocks. Nothing is estimated. Every rate shows the follow-ups behind it, and a
// pitcher under the minimum shows "Small sample (n = X)" instead of a rate.

import LeagueFinder from './LeagueFinder'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import SmallSample from '@/components/data/SmallSample'
import SpinBall, { SpinBallStyles, type SpinInfo } from '@/components/home/SpinBall'
import PitchExplorer from './PitchExplorer'
import { C, SANS } from '@/components/team/ui'
import { PITCH_ORDER, pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import type { Board, BoardRow, Detail, PitcherShape, SeqSplit } from '@/lib/sequencing-lab/data'
import type { SeqPitch } from '@/lib/sequencing-lab/sequence'
import { MLB_TEAMS } from '@/lib/teams'
import { NEUTRAL, ORANGE, Pills, VH, VW, cellRect, kick, labelAt, mix, note, px, pz, star, tile } from '@/components/pitching-lab/LocationExplorer'

type View = 'compare' | 'pitcher' | 'league'
const SPLIT_PILLS: [SeqSplit, string][] = [['all', 'All hitters'], ['vs_lhb', 'vs left-handed'], ['vs_rhb', 'vs right-handed']]
const COUNTS = ['0-0', '1-0', '0-1', '1-1', '2-0', '0-2', '2-1', '1-2', '3-0', '3-1', '2-2', '3-2']
type MetricKey = 'repeat' | 'fbToOff' | 'offToFb' | 'firstFb' | 'twoOff' | 'topShare'
const COLS: { k: MetricKey; label: string; hint: string }[] = [
  { k: 'repeat', label: 'Repeats the pitch', hint: 'The next pitch is the same type as the last one' },
  { k: 'fbToOff', label: 'Fastball, then slower', hint: 'After a fastball, the next pitch is not a fastball' },
  { k: 'offToFb', label: 'Slower, then fastball', hint: 'After a pitch that is not a fastball, the next one is a fastball' },
  { k: 'firstFb', label: 'First-pitch fastball', hint: 'Fastball share of the first pitch (0-0)' },
  { k: 'twoOff', label: 'Two strikes, not a fastball', hint: 'Share of two-strike pitches that are not fastballs' },
  { k: 'topShare', label: 'Most-used pitch', hint: 'The share of all his pitches that is his single most-used pitch' },
]
const ordinal = (n: number) => { const v = n % 100; return `${n}${v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}` }
const f1 = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`)
const ZONE_NAME = (z: string) => (Number(z) <= 9 ? `zone ${z}` : ({ '11': 'up and in', '12': 'up and away', '13': 'down and in', '14': 'down and away' } as Record<string, string>)[z] ?? `zone ${z}`)
const dt: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }
const order = (codes: string[]) => [...codes].sort((a, b) => (PITCH_ORDER.indexOf(a) + 100) % 100 - (PITCH_ORDER.indexOf(b) + 100) % 100)

/** The pitch's ball (it turns the way that pitch turns when its spin is known) and its name. Colour is never the only cue: the name is always beside it. */
function PitchTag({ code, spin }: { code: string; spin?: SpinInfo | null }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}><SpinBall code={code} spin={spin ?? null} size={18} />{pitchLabel(code)}</span>
}

/** A rate against the league: above it leans orange, below it blue; the colour is only a cue, the number and the league value are always printed. */
function tint(v: number | null, league: number | null): string | undefined {
  if (v == null || league == null) return undefined
  const d = Math.max(-1, Math.min(1, (v - league) / 20))
  return d >= 0 ? mix(NEUTRAL, ORANGE, d * 0.8) : mix(NEUTRAL, [108, 171, 221], -d * 0.8)
}

export default function SequencingLab({ board, detail, events, shape, selectedId, split: initialSplit, minSeq, season }: { board: Board; detail: Detail | null; events: SeqPitch[]; shape: PitcherShape; selectedId: number | null; split: SeqSplit; minSeq: number; season: number }) {
  const router = useRouter()
  const [view, setView] = useState<View>(selectedId && detail ? 'pitcher' : 'compare')
  const [split, setSplit] = useState<SeqSplit>(initialSplit)
  const [hand, setHand] = useState<'all' | 'L' | 'R'>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<MetricKey | 'n' | 'name'>('n')
  const [desc, setDesc] = useState(true)
  const [count, setCount] = useState('0-0')
  const [pitchSel, setPitchSel] = useState<string | null>(null)
  const [versus, setVersus] = useState(true)
  const lg = board.league[split]
  const spinOf = (code: string): SpinInfo | null => { const x = shape[code] ?? board.spin[code]; return x ? { rpm: x.rpm, ivb: x.ivb, hb: x.hb } : null }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = board.rows[split].filter(r => (hand === 'all' || r.hand === hand) && (!needle || r.name.toLowerCase().includes(needle)))
    const key = (r: BoardRow) => (sort === 'name' ? r.name : sort === 'n' ? r.n : (r[sort] ?? -1))
    list.sort((a, b) => { const x = key(a), y = key(b); const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number); return desc ? -c : c })
    return list
  }, [board, split, hand, q, sort, desc])

  const sel = selectedId ? board.rows[split].find(r => r.id === selectedId) ?? board.rows.all.find(r => r.id === selectedId) : undefined
  const rankOf = (k: MetricKey) => { if (!sel || sel[k] == null) return null; const pool = board.rows[split].filter(r => r.n >= minSeq && r[k] != null); const v = sel[k] as number; return { rank: pool.filter(r => (r[k] as number) > v).length + 1, of: pool.length } }
  const open = (id: number) => router.push(`?pitcher=${id}&split=${split}`, { scroll: false })
  const th = (k: MetricKey | 'n' | 'name', label: string, title?: string, left?: boolean) => (
    <th title={title} style={{ textAlign: left ? 'left' : 'center', position: left ? 'sticky' : undefined, left: left ? 0 : undefined, background: left ? '#fff' : undefined, zIndex: left ? 2 : undefined }}>
      <button type="button" onClick={() => (sort === k ? setDesc(!desc) : (setSort(k), setDesc(true)))} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', color: sort === k ? C.ink : 'inherit', fontWeight: 800 }}>{label}{sort === k ? (desc ? ' ▼' : ' ▲') : ''}</button>
    </th>
  )

  // ── detail data for the chosen split
  const tr = detail?.transitions[split] ?? {}
  const cnt = detail?.counts[split] ?? {}
  const fromCodes = order(Object.keys(tr))
  const toCodes = order([...new Set(Object.values(tr).flatMap(t => t.next.map(n => n.code)))])
  const leagueMat = board.matrix[split], leagueCnt = board.counts[split]
  const cell = cnt[count] ?? []
  const activePitch = pitchSel && cell.some(p => p.code === pitchSel) ? pitchSel : null

  return (
    <div className="sq" style={{ fontFamily: SANS }}>
      <SpinBallStyles />
      <style>{`.sq-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.sq-span2{grid-column:span 2}.sq-span3{grid-column:1 / -1}.sq-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.sq-tbl th{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8;vertical-align:bottom}.sq-tbl th:first-child,.sq-tbl td:first-child{text-align:left}.sq-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #f1eee6}.sq-tbl td:first-child{position:sticky;left:0;z-index:1;background:#fff}@media (max-width:1100px){.sq-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:760px){.sq-tiles{grid-template-columns:minmax(0,1fr)}.sq-span2{grid-column:auto}}`}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Pills items={[['compare', 'Compare pitchers'], ['pitcher', 'Pitcher'], ['league', 'League']] as [View, string][]} value={view} onChange={setView} />
        <Pills items={SPLIT_PILLS} value={split} onChange={setSplit} />
      </div>

      {/* ── compare ── */}
      {view === 'compare' && (
        <div style={{ ...tile, padding: 0 }}>
          <div style={{ padding: '14px 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <div style={kick}>Every pitcher · {season}</div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a pitcher" aria-label="Search a pitcher" style={{ font: 'inherit', fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px', minWidth: 180 }} />
            <Pills items={[['all', 'Either hand'], ['L', 'Left-handed'], ['R', 'Right-handed']] as ['all' | 'L' | 'R', string][]} value={hand} onChange={setHand} />
            <span style={{ fontSize: 12, color: C.mute }}>{rows.length} pitchers · click a row to open him</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="sq-tbl" style={{ minWidth: 980 }}>
              <thead><tr>{th('name', 'Pitcher', undefined, true)}{th('n', 'Follow-ups', 'Pitches thrown right after another pitch in the same at-bat')}{COLS.map(c => th(c.k, c.label, c.hint))}<th>Pitches thrown</th></tr></thead>
              <tbody>
                <tr style={{ background: '#faf8f3' }}>
                  <td style={{ fontWeight: 800, background: '#faf8f3' }}>League</td><td>{lg.n.toLocaleString('en-US')}</td>
                  {COLS.map(c => <td key={c.k} style={{ fontWeight: 800 }}>{f1(lg[c.k])}</td>)}<td />
                </tr>
                {rows.slice(0, 400).map(r => {
                  const small = r.n < minSeq
                  return (
                    <tr key={r.id} onClick={() => open(r.id)} style={{ cursor: 'pointer', ...(r.id === selectedId ? { outline: `2px solid ${C.orange}` } : {}) }}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <Headshot id={r.id} name={r.name} size={30} /><b>{r.name}</b>
                          <span style={{ color: C.mute, fontSize: 12 }}>{r.team ?? ''}{r.hand ? ` · ${r.hand}HP` : ''}</span>
                        </span>
                      </td>
                      <td>{r.n.toLocaleString('en-US')}{small && star}</td>
                      {small ? <td colSpan={COLS.length}><SmallSample n={r.n} /></td> : COLS.map(c => <td key={c.k} title={`League ${f1(lg[c.k])}`} style={{ background: tint(r[c.k], lg[c.k]) }}>{f1(r[c.k])}</td>)}
                      <td style={{ textAlign: 'left' }}><span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{r.mix.filter(m => m.pct >= 5).slice(0, 4).map(m => <span key={m.code} title={`${pitchLabel(m.code)} ${m.pct.toFixed(0)}%`} style={{ fontSize: 11, border: `1px solid ${pitchColor(m.code)}`, borderRadius: 4, padding: '0 4px' }}>{m.code} {m.pct.toFixed(0)}%</span>)}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p style={{ ...note, padding: '0 14px 14px' }}>Orange = more than the league, blue = less, with the league figure on the hover. {star} marks under {minSeq} follow-up pitches, where the rates show as "Small sample" instead. Fastball means four-seam, sinker, cutter and the rare two-seam or generic fastball. Each rate is counts added together, so it is a share of that pitcher&apos;s pitches.</p>
        </div>
      )}

      {/* ── pitcher ── */}
      {view === 'pitcher' && (!detail || !selectedId ? (
        <div style={tile}><p style={{ ...note, margin: 0 }}>Choose a pitcher in the Compare view and he opens here.</p></div>
      ) : (
        <div className="sq-tiles">
          <div className="sq-span3" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Headshot id={detail.id} name={detail.name} size={52} />
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{detail.name}</h2>
            {sel?.team && <TeamMark id={MLB_TEAMS.find(t => t.abbrev === sel.team)?.id ?? 0} abbr={sel.team} size={22} />}
            <span style={{ fontSize: 15, color: '#5b5347' }}>{sel?.hand ? `${sel.hand === 'L' ? 'Left' : 'Right'}-handed` : ''} · {SPLIT_PILLS.find(s => s[0] === split)?.[1]}</span>
            <Link href={`/mlb/lab/pitching-lab/${detail.id}/sequencing`} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: C.orange, textDecoration: 'none' }}>His Pitching Lab sequencing →</Link>
          </div>

          {sel && (
            <div className="sq-span3" style={{ ...tile, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14 }}>
              {sel.n < minSeq ? <SmallSample n={sel.n} /> : COLS.filter(c => ['repeat', 'fbToOff', 'twoOff', 'topShare'].includes(c.k)).map(c => { const rk = rankOf(c.k); return (
                <div key={c.k} title={c.hint}>
                  <div style={dt}>{c.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{f1(sel[c.k])}</div>
                  <div style={{ fontSize: 12, color: C.mute }}>League {f1(lg[c.k])}{rk ? ` · ${ordinal(rk.rank)} of ${rk.of}` : ''} · n {sel.n.toLocaleString('en-US')}</div>
                </div>
              ) })}
            </div>
          )}

          <PitchExplorer events={events} shape={shape} leagueSpin={board.spin} />
          <div className="sq-span3" style={{ ...tile, overflowX: 'auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <div style={kick}>What he throws next</div>
              <Pills items={[['vs', 'Against the league'], ['raw', 'His shares']] as ['vs' | 'raw', string][]} value={versus ? 'vs' : 'raw'} onChange={v => setVersus(v === 'vs')} />
            </div>
            {fromCodes.length === 0 ? <p style={note}>No follow-up pitches on record for this hitter side.</p> : (
              <table className="sq-tbl" style={{ marginTop: 8, minWidth: 520 }}>
                <thead><tr><th>After this pitch</th><th>n</th>{toCodes.map(c => <th key={c}><PitchTag code={c} spin={spinOf(c)} /></th>)}</tr></thead>
                <tbody>
                  {fromCodes.map(f => (
                    <tr key={f}>
                      <td style={{ fontWeight: 800 }}><PitchTag code={f} spin={spinOf(f)} /></td>
                      <td>{tr[f].total.toLocaleString('en-US')}{tr[f].total < 30 && star}</td>
                      {toCodes.map(t => {
                        const n = tr[f].next.find(x => x.code === t), v = n?.pct ?? 0, l = leagueMat[f]?.[t] ?? 0
                        const d = versus ? Math.max(-1, Math.min(1, (v - l) / 25)) : null
                        return <td key={t} title={`${n ? n.n : 0} of ${tr[f].total} · league ${l.toFixed(0)}%`} style={{ background: versus ? (n || l ? (d! >= 0 ? mix(NEUTRAL, ORANGE, d! * 0.85) : mix(NEUTRAL, [108, 171, 221], -d! * 0.85)) : undefined) : (v ? mix(NEUTRAL, ORANGE, Math.min(1, v / 70)) : undefined) }}>{n ? `${v.toFixed(0)}%` : '·'}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={note}>Each row is the pitch just thrown; each column is what came next, as a share of that row. {versus ? 'Orange = he goes there more than the league does after that pitch, blue = less; hover for his count and the league share.' : 'Darker orange = a bigger share.'} {star} marks a row with under 30 follow-ups.</p>
          </div>

          <div className="sq-span2" style={tile}>
            <div style={kick}>By count · choose one</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 6, marginTop: 10 }}>
              {COUNTS.map(ct => {
                const ps = cnt[ct] ?? []
                const tot = ps.reduce((s, p) => s + p.n, 0)
                return (
                  <button key={ct} type="button" onClick={() => { setCount(ct); setPitchSel(null) }} style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${count === ct ? C.orange : C.line}`, background: count === ct ? '#fff1ea' : '#fff', borderRadius: 10, padding: '8px 10px', font: 'inherit', color: C.ink }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14 }}><span>{ct}</span><span style={{ fontWeight: 600, color: C.mute, fontSize: 12 }}>n {tot}{tot > 0 && tot < 30 && star}</span></div>
                    <div style={{ display: 'flex', height: 9, borderRadius: 3, overflow: 'hidden', margin: '6px 0 4px', gap: 1 }} aria-hidden>{ps.map(p => <span key={p.code} style={{ width: `${p.pct}%`, background: pitchColor(p.code) }} />)}</div>
                    <div style={{ fontSize: 12, color: '#5b5347' }}>{ps.slice(0, 3).map(p => `${p.code} ${p.pct.toFixed(0)}%`).join(' · ') || '—'}</div>
                  </button>
                )
              })}
            </div>
            <p style={note}>Balls first, then strikes. The bar is the mix of pitches in that count, labelled with the three most common.</p>
          </div>

          <div style={tile}>
            <div style={kick}>Where he goes · count {count}</div>
            {cell.length === 0 ? <p style={note}>No pitches on record in this count.</p> : (
              <>
                <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', maxWidth: 340, display: 'block', margin: '8px auto 0' }} role="img" aria-label={`Most common zone for each pitch in the ${count} count`}>
                  <rect width={VW} height={VH} fill="#faf8f3" />
                  {['11', '12', '13', '14', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(z => {
                    const r = cellRect(z), hits = cell.filter(p => p.zone === z && (!activePitch || p.code === activePitch))
                    const top = hits[0], lab = labelAt(z)
                    return (
                      <g key={z}>
                        <rect x={px(r.x0)} y={pz(r.z1)} width={px(r.x1) - px(r.x0)} height={pz(r.z0) - pz(r.z1)} fill={top ? pitchColor(top.code) : '#fff'} fillOpacity={top ? 0.85 : 1} stroke="#cfc9ba" />
                        <text x={lab.x} y={lab.y + (hits.length > 1 ? -4 : 5)} textAnchor="middle" fontSize={hits.length ? 15 : 11} fontWeight={800} fill={hits.length ? '#fff' : '#a89e8c'}>{hits.length ? hits.map(h => h.code).join(' ') : z}</text>
                      </g>
                    )
                  })}
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, fontSize: 13 }}>
                  {cell.map(p => (
                    <button key={p.code} type="button" onClick={() => setPitchSel(activePitch === p.code ? null : p.code)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, background: activePitch === p.code ? '#fff1ea' : 'none', border: 0, borderRadius: 6, padding: '2px 4px', cursor: 'pointer', font: 'inherit', color: C.ink, textAlign: 'left' }}>
                      <PitchTag code={p.code} spin={spinOf(p.code)} /><span style={{ color: '#5b5347' }}>{p.pct.toFixed(0)}% · {p.zone ? ZONE_NAME(p.zone) : '—'}{p.n < MIN_PITCHES_ZONE && star}</span>
                    </button>
                  ))}
                </div>
                <p style={note}>Each pitch is drawn in the zone it most often goes to in this count (Statcast&apos;s 13 zones, catcher&apos;s view; the four outer boxes are chase corners). Click a pitch to show only it. {star} = under {MIN_PITCHES_ZONE} pitches.</p>
              </>
            )}
          </div>

        </div>
      ))}

      {/* ── league ── */}
      {view === 'league' && (
        <div className="sq-tiles">
          <LeagueFinder season={season} />
          <div className="sq-span3" style={{ ...tile, overflowX: 'auto' }}>
            <div style={kick}>The league · what comes after each pitch</div>
            <table className="sq-tbl" style={{ marginTop: 8, minWidth: 520 }}>
              <thead><tr><th>After this pitch</th>{order([...new Set(Object.values(leagueMat).flatMap(m => Object.keys(m)))]).filter(c => PITCH_ORDER.includes(c)).slice(0, 12).map(c => <th key={c}><PitchTag code={c} spin={spinOf(c)} /></th>)}</tr></thead>
              <tbody>
                {order(Object.keys(leagueMat)).filter(c => PITCH_ORDER.includes(c)).slice(0, 12).map(f => (
                  <tr key={f}><td style={{ fontWeight: 800 }}><PitchTag code={f} spin={spinOf(f)} /></td>
                    {order([...new Set(Object.values(leagueMat).flatMap(m => Object.keys(m)))]).filter(c => PITCH_ORDER.includes(c)).slice(0, 12).map(t => { const v = leagueMat[f]?.[t] ?? 0; return <td key={t} style={{ background: v ? mix(NEUTRAL, ORANGE, Math.min(1, v / 70)) : undefined }}>{v >= 0.5 ? `${v.toFixed(0)}%` : '·'}</td> })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={note}>Every pitcher&apos;s follow-up pitches added together ({lg.n.toLocaleString('en-US')} in all), for {SPLIT_PILLS.find(s => s[0] === split)?.[1]}.</p>
          </div>
          <div className="sq-span3" style={tile}>
            <div style={kick}>The league · the mix in each count</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {COUNTS.map(ct => {
                const ps = Object.entries(leagueCnt[ct] ?? {}).sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 1)
                return (
                  <div key={ct} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr)', gap: 10, alignItems: 'center' }}>
                    <b style={{ fontSize: 14 }}>{ct}</b>
                    <div>
                      <div style={{ display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', gap: 1 }} aria-hidden>{ps.map(([c, v]) => <span key={c} style={{ width: `${v}%`, background: pitchColor(c) }} />)}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 3, fontSize: 12, color: '#5b5347' }}>{ps.slice(0, 5).map(([c, v]) => <span key={c}><PitchTag code={c} spin={spinOf(c)} /> {v.toFixed(0)}%</span>)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <p style={{ ...note, marginTop: 14 }}>Through {board.throughDate ?? 'the latest stored game'} · {season} regular season and postseason as stored. Built from the stored sequencing and count tables; nothing is estimated. These describe what pitchers have done, not what they will do.</p>
    </div>
  )
}
const MIN_PITCHES_ZONE = 15
