'use client'

// src/components/stuff-lab/StuffLab.tsx
//
// x9Stuff Lab: the in-house pitch grades (mockups/front-office-pitch-grades.html in the site's lab layout). Three views:
//   Pitcher       grade card (Stuff / Command / Overall), the arsenal, why a pitch grades the way it does, how the pitch has actually ended, its movement,
//                 stuff against results, and the pressure profile. Choose a pitch on the left; the balls turn the way each pitch turns.
//   Leaderboard   every graded pitcher, sortable, with a minimum-pitches filter
//   How we grade  the scale and the method
// Scale: 100 = league average, every 10 points = one standard deviation, grades are defense-neutral and leverage is not part of the grade.
// A value the model has not written yet is null and shows a "Pending" block. Below 100 pitches a grade shows "Small sample (n = X)". Nothing here is a prediction.

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Headshot } from '@/components/home/Logo'
import SpinBall, { SpinBallStyles, type SpinInfo } from '@/components/home/SpinBall'
import PendingBlock from '@/components/data/PendingBlock'
import SmallSample from '@/components/data/SmallSample'
import { InfoButton } from '@/components/InfoButton'
import { C, SANS } from '@/components/team/ui'
import { pitchColor, pitchLabel } from '@/lib/lab/pitch-meta'
import type { Outcomes, PitchGrade, PitcherGrade, StuffBoard, StuffDetail } from '@/lib/stuff-lab/data'
import { Pills, kick, note, star, tile } from '@/components/pitching-lab/LocationExplorer'

const MIN = 100
const MIN_LB = [0, 250, 500]
const TIPS: Record<string, string> = {
  stuff: 'What the ball does on its own: speed, spin, movement and release, before location. 100 is league average.',
  command: 'Where the pitch went for the count. 100 is league average.',
  overall: 'Stuff and command together, weighted the way they predict future results.',
  usage: 'The share of his pitches that are this type.', velo: 'Average release speed in miles per hour.',
  ivb: 'Induced vertical break, in inches: how much more a pitch rises (or drops less) than gravity alone would allow.',
  hb: 'Horizontal break in inches. Positive is toward the pitcher\'s arm side, negative toward the glove side.',
  spin: 'Average spin rate, in revolutions per minute.',
  miss: 'How often hitters swing and miss at this pitch, compared with the league for the pitch type.',
  chase: 'How often hitters swing at it outside the zone. More swings at balls help the pitcher.',
  steal: 'How often it gets a called strike where a take would usually be a ball.',
  gb: 'How often a ball in play is on the ground. Ground balls rarely go for extra bases.',
  pop: 'How often a ball in play is an infield pop-up. Infield pop-ups are nearly as good as a strikeout.',
  weak: 'How softly balls in play are hit, by exit speed and angle, not by whether they became hits.',
  actual: 'Runs saved per 100 pitches from what really happened. Positive is better than average for the pitcher.',
  expected: 'Runs saved per 100 pitches that the pitch\'s stuff suggests. Positive is better than average for the pitcher.',
}
const Tip = ({ k, label }: { k: keyof typeof TIPS; label: string }) => <InfoButton title={label} align="left"><p style={{ margin: 0 }}>{TIPS[k]}</p></InfoButton>
type Spin = Record<string, { rpm: number | null; ivb: number | null; hb: number | null }>
const dt: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }
const f0 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(0))
const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1))
const sg = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`)
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)
const shade = (g: number | null): string | undefined => { if (g == null) return undefined; const d = Math.max(-25, Math.min(25, g - 100)); return d >= 0 ? `rgba(255,87,34,${(0.08 + (d / 25) * 0.5).toFixed(2)})` : `rgba(94,90,80,${(0.06 + (-d / 25) * 0.28).toFixed(2)})` }

/** A grade on a 70 to 130 bar with a mark at 100: orange to the right of it (above average), grey to the left. */
function GradeBar({ g }: { g: number }) {
  const lo = 70, hi = 130, pos = Math.max(0, Math.min(100, ((g - lo) / (hi - lo)) * 100)), mid = ((100 - lo) / (hi - lo)) * 100
  return (
    <div style={{ marginTop: 10 }}>
      <div role="img" aria-label={`${g.toFixed(0)} on a 70 to 130 scale, 100 is average`} style={{ position: 'relative', height: 14, background: C.soft, border: `1px solid ${C.line}`, borderRadius: 7 }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${g >= 100 ? mid : pos}%`, width: `${Math.abs(pos - mid)}%`, background: g >= 100 ? C.orange : '#b9b5aa', borderRadius: 7 }} />
        <div style={{ position: 'absolute', top: -4, bottom: -4, left: `${mid}%`, width: 2, background: C.ink }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.faint, marginTop: 3 }}><span>70</span><span>100</span><span>130</span></div>
    </div>
  )
}

function SortTh({ k, label, tip, sort, set }: { k: string; label: string; tip?: keyof typeof TIPS; sort: { key: string; dir: number }; set: (s: { key: string; dir: number }) => void }) {
  return (
    <th aria-sort={sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'} scope="col">
      <button type="button" onClick={() => set({ key: k, dir: sort.key === k ? -sort.dir : k === 'name' || k === 'type' ? 1 : -1 })} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', color: sort.key === k ? C.ink : 'inherit', fontWeight: 800 }}>{label}{sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button>
      {tip && <span style={{ marginLeft: 4 }}><Tip k={tip} label={label} /></span>}
    </th>
  )
}

export default function StuffLab({ board, selected, detail, season, preview, embedded }: { board: StuffBoard; selected: PitcherGrade | null; detail: StuffDetail | null; season: number; preview?: boolean; embedded?: boolean }) {
  const router = useRouter()
  const [view, setView] = useState<'pitcher' | 'board' | 'method'>(selected || embedded ? 'pitcher' : 'board')
  const [pitchSel, setPitchSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [minp, setMinp] = useState(250)
  const [asort, setAsort] = useState({ key: 'usage', dir: -1 })
  const [bsort, setBsort] = useState<{ key: string; dir: number }>({ key: 'stuff', dir: -1 })

  const open = (id: number) => router.push(`?pitcher=${id}`, { scroll: false })
  const matches = useMemo(() => { const s = q.trim().toLowerCase(); return s.length < 2 ? [] : board.pitchers.filter(p => p.name.toLowerCase().includes(s)).sort((a, b) => b.pitches - a.pitches).slice(0, 8) }, [q, board])

  const shape = detail?.shape ?? {}
  const spinOf = (code: string): SpinInfo | null => { const s = shape[code] ?? detail?.league[code]; return s ? { rpm: s.rpm, ivb: s.ivb, hb: s.hb } : null }
  const rows: PitchGrade[] = useMemo(() => (detail?.pitchGrades ?? []).map(r => ({ ...r, velo: r.velo ?? shape[r.type]?.velo ?? null, ivb: r.ivb ?? shape[r.type]?.ivb ?? null, hb: r.hb ?? shape[r.type]?.hb ?? null, spin: r.spin ?? (shape[r.type]?.rpm != null ? Math.round(shape[r.type].rpm as number) : null) })), [detail, shape])
  const sortedRows = useMemo(() => [...rows].sort((a, b) => { const k = asort.key as keyof PitchGrade; const x = a[k], y = b[k]; return asort.key === 'type' ? asort.dir * pitchLabel(a.type).localeCompare(pitchLabel(b.type)) : asort.dir * (((x as number | null) ?? -1) - ((y as number | null) ?? -1)) }), [rows, asort])
  const cur = rows.find(r => r.type === pitchSel) ?? [...rows].sort((a, b) => b.pitches - a.pitches)[0]
  const full = board.full
  const lbRows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return board.pitchers.filter(p => p.pitches >= minp && (!s || p.name.toLowerCase().includes(s))).sort((a, b) => { const k = bsort.key as keyof PitcherGrade; return bsort.key === 'name' ? bsort.dir * a.name.localeCompare(b.name) : bsort.dir * (((a[k] as number | null) ?? -1) - ((b[k] as number | null) ?? -1)) }).slice(0, 300)
  }, [board, minp, q, bsort])

  return (
    <div className="st" style={{ fontFamily: SANS }}>
      <SpinBallStyles />
      <style>{`.st-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.st-span2{grid-column:span 2}.st-span3{grid-column:1 / -1}.st-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:20px;align-items:start}.st-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.st-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit}.st-btn small{display:block;font-weight:600;font-size:11.5px;color:#8a8275}.st-btn.on{border-color:#FF5722;background:#fff1ea}.st-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.st-tbl th{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8;vertical-align:bottom;white-space:nowrap}.st-tbl th:first-child,.st-tbl td:first-child{text-align:left}.st-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #f1eee6;white-space:nowrap}.st-tbl td:first-child{position:sticky;left:0;z-index:1;background:#fff}.st-tbl tr[aria-current="true"] td{outline:0;background:#fff1ea}.st-tbl tr.pick{cursor:pointer}@media (max-width:1100px){.st-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.st-grid{grid-template-columns:minmax(0,1fr)}.st-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.st-btn{width:auto;white-space:nowrap}.st-tiles{grid-template-columns:minmax(0,1fr)}.st-span2{grid-column:auto}}`}</style>

      {preview && <div role="note" style={{ background: '#FDE047', border: '1px solid #1A1A1A', padding: '8px 12px', fontWeight: 800, fontSize: 13, marginBottom: 14 }}>MOCKUP DATA · NOT REAL · invented pitchers and numbers (dev preview only)</div>}

      {embedded ? (
        <p style={{ ...note, margin: '0 0 14px' }}>{board.pitchers.length} pitchers graded · {season}. <a href={`/mlb/lab/stuff${selected ? `?pitcher=${selected.id}` : ''}`} style={{ color: C.orange, fontWeight: 800 }}>Open the full x9Stuff Lab</a> for the leaderboard and how we grade.</p>
      ) : (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <Pills items={[['pitcher', 'Pitcher'], ['board', 'Leaderboard'], ['method', 'How we grade']] as ['pitcher' | 'board' | 'method', string][]} value={view} onChange={setView} />
        <div style={{ position: 'relative' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a pitcher" aria-label="Find a pitcher" style={{ font: 'inherit', fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px', minWidth: 200 }} />
          {matches.length > 0 && view !== 'board' && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, minWidth: 260, maxHeight: 320, overflowY: 'auto' }}>
              {matches.map(m => <button key={m.id} type="button" onClick={() => { setQ(''); setView('pitcher'); open(m.id) }} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '6px 10px', border: 0, background: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}><Headshot id={m.id} name={m.name} size={28} /><b>{m.name}</b><span style={{ color: C.mute, fontSize: 12 }}>{m.pitches.toLocaleString('en-US')} pitches</span></button>)}
            </div>
          )}
        </div>
        <span style={{ fontSize: 12, color: C.mute }}>{board.pitchers.length} pitchers graded · {season}</span>
      </div>
      )}

      {/* ── pitcher ── */}
      {view === 'pitcher' && (!selected || !detail ? (
        <div style={tile}><p style={{ ...note, margin: 0 }}>{embedded ? 'This pitcher has no grade yet this season. A pitcher needs enough pitches thrown to be graded.' : 'Find a pitcher above, or open one from the Leaderboard.'}</p></div>
      ) : (
        <div className="st-grid">
          <nav className="st-side" aria-label="Pitches">
            <div style={{ ...dt, margin: '2px 2px 0' }}>Choose a pitch</div>
            {[...rows].sort((a, b) => b.pitches - a.pitches).map(r => (
              <button key={r.type} type="button" className={`st-btn${cur?.type === r.type ? ' on' : ''}`} onClick={() => setPitchSel(r.type)}>
                <SpinBall code={r.type} spin={spinOf(r.type)} size={28} />
                <span style={{ minWidth: 0 }}>{pitchLabel(r.type)}<small>{r.usage != null ? `${r.usage.toFixed(0)}% · ` : ''}{r.pitches.toLocaleString('en-US')}{r.stuff != null && r.pitches >= MIN ? ` · Stuff ${r.stuff.toFixed(0)}` : ''}</small></span>
              </button>
            ))}
          </nav>

          <div className="st-tiles">
            <div className="st-span3" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Headshot id={selected.id} name={selected.name} size={52} />
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{selected.name}</h2>
              <span style={{ fontSize: 15, color: '#5b5347' }}>{detail.hand ? `${detail.hand === 'L' ? 'Left' : 'Right'}-handed · ` : ''}{selected.pitches.toLocaleString('en-US')} pitches{selected.velo != null ? ` · ${selected.velo.toFixed(1)} mph` : ''}</span>
            </div>

            {([['stuff', 'Stuff', 'What the ball does.', selected.stuff], ['command', 'Command', 'Where it went for the count.', selected.command], ['overall', 'Overall', 'Both together.', selected.overall]] as [keyof typeof TIPS, string, string, number | null][]).map(([k, l, w, g]) => (
              <div key={k} style={tile}>
                <div style={kick}>{l} <Tip k={k} label={l} /></div>
                {g == null ? <PendingBlock label={`${l} (the full pitch model has not written it yet)`} /> : selected.pitches < MIN ? <div style={{ marginTop: 8 }}><SmallSample n={selected.pitches} /></div> : (
                  <>
                    <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', marginTop: 6 }}>{g.toFixed(0)}</div>
                    <div style={{ fontSize: 13, color: C.mute }}>{w}</div>
                    <GradeBar g={g} />
                  </>
                )}
              </div>
            ))}
            <div className="st-span3" style={{ ...tile, background: C.soft, borderLeft: `4px solid ${C.orange}` }}>
              <p style={{ margin: 0, fontSize: 14, color: '#3a352c', lineHeight: 1.55 }}><b>How to read the scale.</b> 100 is league average. Every 10 points is one standard deviation, so 110 is clearly good and 120 is rare. Grades are defense-neutral: a ball in play is graded by how it was hit, not by who fielded it. Leverage is not part of the grade: a pitch in a blowout counts the same as one in a tight game.{selected.note ? <> <b style={{ color: C.orange }}>{selected.note}.</b></> : null}</p>
            </div>

            <div className="st-span3" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>Arsenal · choose a row</div>
              <table className="st-tbl" style={{ marginTop: 6, minWidth: 640 }}>
                <thead><tr><SortTh k="type" label="Pitch" sort={asort} set={setAsort} /><SortTh k="usage" label="Usage" tip="usage" sort={asort} set={setAsort} /><SortTh k="velo" label="Velo" tip="velo" sort={asort} set={setAsort} /><SortTh k="ivb" label="IVB" tip="ivb" sort={asort} set={setAsort} /><SortTh k="hb" label="HB" tip="hb" sort={asort} set={setAsort} /><SortTh k="spin" label="Spin" tip="spin" sort={asort} set={setAsort} /><SortTh k="stuff" label="Stuff" tip="stuff" sort={asort} set={setAsort} /><SortTh k="command" label="Command" tip="command" sort={asort} set={setAsort} /><SortTh k="overall" label="Overall" tip="overall" sort={asort} set={setAsort} /></tr></thead>
                <tbody>
                  {sortedRows.map(r => (
                    <tr key={r.type} className="pick" aria-current={cur?.type === r.type ? 'true' : undefined} onClick={() => setPitchSel(r.type)}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800 }}><SpinBall code={r.type} spin={spinOf(r.type)} size={20} />{pitchLabel(r.type)}</span>{r.note && <span style={{ marginLeft: 8, fontSize: 11, background: '#FDE047', border: '1px solid #1A1A1A', padding: '0 6px', borderRadius: 4, fontWeight: 800 }}>{r.note}</span>}</td>
                      <td>{r.usage != null ? `${r.usage.toFixed(0)}%` : '—'}</td><td>{f1(r.velo)}</td><td>{f1(r.ivb)}</td><td>{f1(r.hb)}</td><td>{r.spin != null ? r.spin.toLocaleString('en-US') : '—'}</td>
                      {([r.stuff, r.command, r.overall]).map((g, i) => <td key={i} style={{ background: r.pitches >= MIN ? shade(g) : undefined, fontWeight: 800 }}>{g == null ? '—' : r.pitches < MIN ? <SmallSample n={r.pitches} /> : g.toFixed(0)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={note}>Velo, IVB, HB and spin are his measured averages. Grade cells are shaded by their distance from 100: orange above, grey below. A dash means the model has not written that grade yet.</p>
            </div>

            {cur && (
              <div className="st-span2" style={tile}>
                <div style={kick}>Why it grades this way · {pitchLabel(cur.type)}</div>
                {cur.miss == null ? <PendingBlock label="The six things a pitch can do for a pitcher: miss bats, chase, steal strikes, ground balls, pop-ups, weak contact (the full pitch model has not written them yet)" /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                    {([['miss', 'Miss bats', cur.miss], ['chase', 'Chase', cur.chase], ['steal', 'Steal strikes', cur.steal], ['gb', 'Ground balls', cur.gb], ['pop', 'Pop-ups', cur.pop], ['weak', 'Weak contact', cur.weak]] as [keyof typeof TIPS, string, number | null][]).map(([k, l, g]) => (
                      <div key={k}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}><span>{l} <Tip k={k} label={l} /></span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{g == null ? '—' : g.toFixed(0)}</span></div>
                        {g != null && <GradeBar g={g} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {cur && <Tree o={detail.outcomes[cur.type]} type={cur.type} />}

            <div className="st-span2" style={tile}>
              <div style={kick}>Movement</div>
              <Movement rows={rows} league={detail.league} cur={cur?.type ?? null} />
            </div>

            <div style={tile}>
              <div style={kick}>Stuff vs results</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
                {[...rows].sort((a, b) => b.pitches - a.pitches).filter(r => r.expected != null).map(r => (
                  <div key={r.type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}><span>{pitchLabel(r.type)}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{sg(r.expected)}{r.actual != null ? ` · ${sg(r.actual)}` : ''}</span></div>
                    <div style={{ height: 8, background: C.soft, borderRadius: 4, overflow: 'hidden', marginTop: 2 }}><div style={{ height: '100%', width: `${Math.min(100, Math.abs(r.expected as number) * 20)}%`, background: (r.expected as number) >= 0 ? C.orange : '#b9b5aa' }} /></div>
                  </div>
                ))}
              </div>
              <div style={note}>Expected runs saved per 100 pitches from the stuff <Tip k="expected" label="Expected" />. {rows.some(r => r.actual != null) ? 'The second number is what actually happened.' : 'Actual run results by pitch are pending (the full pitch model has not written them yet).'}</div>
              {(selected.era != null || selected.xera != null) && (
                <p style={{ ...note, color: '#3a352c' }}>Season: ERA <b>{f1(selected.era)}</b>, xERA <b>{f1(selected.xera)}</b>, K-BB% <b>{selected.kbb != null ? `${selected.kbb.toFixed(1)}%` : '—'}</b>{selected.pitches < MIN ? ' (small sample)' : ''}. When results trail the stuff, it can be sequencing, defense or noise; the stuff is the stickier signal.</p>
              )}
            </div>

            <div className="st-span3" style={tile}>
              <div style={kick}>Pressure profile</div>
              {detail.pressure.length < 2 ? <PendingBlock label="High pressure against normal situations (7th inning or later, within 2 runs, runner on): the full pitch model has not written it yet" /> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginTop: 10 }}>
                  {(['high', 'normal'] as const).map(k => { const r = detail.pressure.find(x => x.pressure === k); if (!r) return null; return (
                    <div key={k} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{k === 'high' ? 'High pressure' : 'Normal situations'}</div>
                      <div style={{ fontSize: 12, color: C.mute, marginBottom: 6 }}>{k === 'high' ? '7th or later · within 2 runs · runner on' : 'every other pitch'}</div>
                      {([['Pitches', r.pitches.toLocaleString('en-US')], ['Overall', f0(r.overall)], ['Command', f0(r.command)], ['Fastball %', r.fastballPct != null ? `${r.fastballPct.toFixed(0)}%` : '—'], ['Runs saved per 100', sg(r.actual)]] as [string, string][]).map(([a, b]) => <div key={a} style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.soft}`, padding: '5px 0', fontSize: 14 }}><span>{a}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{b}</b></div>)}
                    </div>
                  ) })}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* ── leaderboard ── */}
      {view === 'board' && (
        <div style={{ ...tile, padding: 0 }}>
          <div style={{ padding: '14px 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <div style={kick}>Every graded pitcher · {season}</div>
            <Pills items={MIN_LB.map(v => [String(v), v === 0 ? 'All' : `${v}+ pitches`] as [string, string])} value={String(minp)} onChange={v => setMinp(Number(v))} />
            <span style={{ fontSize: 12, color: C.mute }}>{lbRows.length} shown · click a row to open him</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="st-tbl" style={{ minWidth: full ? 900 : 480 }}>
              <thead><tr>
                <SortTh k="name" label="Pitcher" sort={bsort} set={setBsort} /><SortTh k="pitches" label="Pitches" sort={bsort} set={setBsort} /><SortTh k="stuff" label="Stuff" tip="stuff" sort={bsort} set={setBsort} />
                {full && <><SortTh k="command" label="Command" tip="command" sort={bsort} set={setBsort} /><SortTh k="overall" label="Overall" tip="overall" sort={bsort} set={setBsort} /><SortTh k="miss" label="Miss bats" tip="miss" sort={bsort} set={setBsort} /><SortTh k="chase" label="Chase" tip="chase" sort={bsort} set={setBsort} /><SortTh k="steal" label="Steal strikes" tip="steal" sort={bsort} set={setBsort} /><SortTh k="gb" label="Ground balls" tip="gb" sort={bsort} set={setBsort} /><SortTh k="pop" label="Pop-ups" tip="pop" sort={bsort} set={setBsort} /><SortTh k="weak" label="Weak contact" tip="weak" sort={bsort} set={setBsort} /></>}
              </tr></thead>
              <tbody>
                {lbRows.map(p => (
                  <tr key={p.id} className="pick" onClick={() => { setView('pitcher'); open(p.id) }} aria-current={p.id === selected?.id ? 'true' : undefined}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Headshot id={p.id} name={p.name} size={30} /><b>{p.name}</b></span>{p.note && <span style={{ marginLeft: 8, fontSize: 11, background: '#FDE047', border: '1px solid #1A1A1A', padding: '0 6px', borderRadius: 4, fontWeight: 800 }}>{p.note}</span>}</td>
                    <td>{p.pitches.toLocaleString('en-US')}{p.pitches < MIN && star}</td>
                    <td style={{ background: p.pitches >= MIN ? shade(p.stuff) : undefined, fontWeight: 800 }}>{p.stuff == null ? '—' : p.pitches < MIN ? <SmallSample n={p.pitches} /> : p.stuff.toFixed(0)}</td>
                    {full && ([p.command, p.overall, p.miss, p.chase, p.steal, p.gb, p.pop, p.weak]).map((g, i) => <td key={i} style={{ background: shade(g), fontWeight: 800 }}>{g == null ? '—' : g.toFixed(0)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ ...note, padding: '0 14px 14px' }}>{star} marks under {MIN} pitches, where a grade shows as "Small sample". 100 is league average. {full ? '' : 'Command, Overall and the six sub-grades appear here when the full pitch model has written them.'}</p>
        </div>
      )}

      {/* ── method ── */}
      {view === 'method' && (
        <div className="st-tiles">
          {[['Outcome tree', 'Every pitch is followed down a tree (take or swing, then strike, ball, miss, foul or ball in play) and each ending is priced by its average effect on runs across the league.'],
            ['The 100 scale', 'The model\'s grade is set so 100 is league average and every 10 points is one standard deviation. Most pitches land between 80 and 125.'],
            ['Defense-neutral', 'Balls in play are graded by how they were hit (speed and angle), not by whether a fielder made the play.'],
            ['Stuff', 'What the ball does on its own: speed, spin, movement and release. It is the same in any count, and it is reliable early, within a few hundred pitches.'],
            ['Command and the count', 'Command is where the pitch went for the count. The count is accounted for in Command and Overall only. Command needs about 400 pitches before it settles.'],
            ['Leverage', 'Leverage is not part of any grade. Game situation is shown separately in the pressure profile.'],
          ].map(([t, b]) => <div key={t} style={tile}><div style={kick}>{t}</div><p style={{ margin: '8px 0 0', fontSize: 14, color: '#3a352c', lineHeight: 1.55 }}>{b}</p></div>)}
          <div className="st-span3" style={{ ...tile, background: C.soft }}><p style={{ margin: 0, fontSize: 13, color: '#5b5347', lineHeight: 1.55 }}>Model version {board.version || 'not recorded'}{board.updated ? ` · loaded ${board.updated}` : ''}. Today the lab carries Stuff Grade{board.full ? ', Command, Overall and the six sub-grades' : '; Command, Overall, the six sub-grades, actual run results and the pressure profile arrive with the full pitch model'}. These describe pitches that were thrown; they are not predictions.</p></div>
        </div>
      )}
    </div>
  )
}

/** How the selected pitch has actually ended: take or swing, then the result, then the kind of ball in play. Real shares from his stored pitches. */
function Tree({ o, type }: { o: Outcomes | undefined; type: string }) {
  if (!o || o.n < 20) return <div className="st-span3" style={tile}><div style={kick}>How this pitch has ended · {pitchLabel(type)}</div><p style={note}>Not enough stored pitches of this type yet.</p></div>
  const P = (v: number, of: number) => `${(pct(v, of)).toFixed(of === o.n ? (pct(v, of) < 10 ? 1 : 0) : 0)}%`
  const W = 940, H = 470, bw = 184, bh = 36
  type Nd = { id: string; x: number; y: number; label: string; share: string; leaf?: boolean }
  const leaves: [string, string, number][] = [['pop', 'Pop-up', o.pop], ['wgb', 'Weak grounder', o.weakGb], ['hgb', 'Hard grounder', o.hardGb], ['line', 'Line drive', o.line], ['wfb', 'Weak fly ball', o.weakFb], ['hfb', 'Hard fly ball', o.hardFb]]
  if (o.unclassified > 0) leaves.push(['unk', 'In play, not yet classified', o.unclassified])
  const step = 46, top = 235 - ((leaves.length - 1) * step) / 2 + 40
  const nodes: Nd[] = [
    { id: 'root', x: 100, y: 235, label: 'Pitch', share: '100%' }, { id: 'take', x: 320, y: 130, label: 'Take', share: P(o.take, o.n) }, { id: 'swing', x: 320, y: 340, label: 'Swing', share: P(o.swing, o.n) },
    { id: 'cs', x: 560, y: 40, label: 'Called strike', share: P(o.calledStrike, o.n), leaf: true }, { id: 'ball', x: 560, y: 100, label: 'Ball', share: P(o.ball, o.n), leaf: true }, { id: 'hbp', x: 560, y: 160, label: 'Hit by pitch', share: P(o.hbp, o.n), leaf: true },
    { id: 'whiff', x: 560, y: 235, label: 'Whiff (incl. foul tip)', share: P(o.whiff, o.n), leaf: true }, { id: 'foul', x: 560, y: 295, label: 'Foul', share: P(o.foul, o.n), leaf: true }, { id: 'inplay', x: 560, y: 380, label: 'In play', share: P(o.inPlay, o.n) },
    ...leaves.map(([id, label, v], i) => ({ id, x: 810, y: top + i * step, label, share: P(v, o.n), leaf: true })),
  ]
  const by = Object.fromEntries(nodes.map(x => [x.id, x]))
  const edges: [string, string, string][] = [['root', 'take', P(o.take, o.n)], ['root', 'swing', P(o.swing, o.n)], ['take', 'cs', P(o.calledStrike, o.take)], ['take', 'ball', P(o.ball, o.take)], ['take', 'hbp', P(o.hbp, o.take)], ['swing', 'whiff', P(o.whiff, o.swing)], ['swing', 'foul', P(o.foul, o.swing)], ['swing', 'inplay', P(o.inPlay, o.swing)], ...leaves.map(([id, , v]) => ['inplay', id, P(v, o.inPlay)] as [string, string, string])]
  return (
    <div className="st-span3" style={{ ...tile, overflowX: 'auto' }}>
      <div style={kick}>How this pitch has ended · {pitchLabel(type)}</div>
      <div style={{ minWidth: 760 }}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`How ${pitchLabel(type)} pitches have ended: ${P(o.take, o.n)} taken, ${P(o.swing, o.n)} swung at`} style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }}>
          {edges.map(([a, b, t]) => { const A = by[a], B = by[b], x1 = A.x + bw / 2, x2 = B.x - bw / 2, mx = (x1 + x2) / 2; return (
            <g key={a + b}><path d={`M${x1} ${A.y} C ${mx} ${A.y}, ${mx} ${B.y}, ${x2} ${B.y}`} fill="none" stroke="#cfc9ba" strokeWidth={1.4} /><rect x={mx - 21} y={(A.y + B.y) / 2 - 9} width={42} height={18} rx={4} fill="#fff" /><text x={mx} y={(A.y + B.y) / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#FF5722">{t}</text></g>
          ) })}
          {nodes.map(nd => (
            <g key={nd.id}><rect x={nd.x - bw / 2} y={nd.y - bh / 2} width={bw} height={bh} rx={8} fill={nd.leaf ? '#fff' : '#1A1A1A'} stroke={nd.leaf ? '#cfc9ba' : '#1A1A1A'} />
              <text x={nd.x} y={nd.y - 1} textAnchor="middle" fontSize={12} fontWeight={800} fill={nd.leaf ? '#1A1A1A' : '#FAF8F3'}>{nd.label}</text>
              <text x={nd.x} y={nd.y + 12} textAnchor="middle" fontSize={10} fill={nd.leaf ? '#8a8275' : '#FDE047'}>{nd.share} of pitches</text></g>
          ))}
        </svg>
      </div>
      <p style={note}>{o.n.toLocaleString('en-US')} of his {pitchLabel(type)} pitches. The percentages on the branches are the share of the pitches at the branch before it. Each ending is priced by its average effect on runs across the league; this tree shows how often the pitch has actually taken each path.{o.unclassified > 0 ? ` ${o.unclassified} balls in play have no speed or angle stored yet.` : ''}</p>
    </div>
  )
}

/** His pitch types on induced rise (up) against horizontal break (right = arm side), sized by how often he throws each; the dashed dot is the league average for that pitch type. */
function Movement({ rows, league, cur }: { rows: PitchGrade[]; league: Record<string, { ivb: number | null; hb: number | null }>; cur: string | null }) {
  const pts = rows.filter(r => r.ivb != null && r.hb != null)
  if (pts.length === 0) return <p style={note}>No measured movement is stored for him yet.</p>
  const W = 560, H = 400, ml = 54, mr = 14, mt = 14, mb = 46, x0 = -22, x1 = 22, y0 = -16, y1 = 22
  const X = (v: number) => ml + ((v - x0) / (x1 - x0)) * (W - ml - mr), Y = (v: number) => mt + (1 - (v - y0) / (y1 - y0)) * (H - mt - mb)
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Induced vertical break against horizontal break for each pitch type" style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }}>
        {[-20, -10, 0, 10, 20].map(v => <g key={v}><line x1={X(v)} y1={mt} x2={X(v)} y2={H - mb} stroke={v === 0 ? '#1A1A1A' : '#e7e2d8'} /><text x={X(v)} y={H - mb + 15} textAnchor="middle" fontSize={11} fill="#8a8275">{v}</text></g>)}
        {[-10, 0, 10, 20].map(v => <g key={v}><line x1={ml} y1={Y(v)} x2={W - mr} y2={Y(v)} stroke={v === 0 ? '#1A1A1A' : '#e7e2d8'} /><text x={ml - 7} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="#8a8275">{v}</text></g>)}
        <text x={(ml + W - mr) / 2} y={H - 6} textAnchor="middle" fontSize={11} fontWeight={800} fill="#5b5347">HORIZONTAL BREAK (inches; glove side ← → arm side)</text>
        <text transform={`translate(13 ${(mt + H - mb) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fontWeight={800} fill="#5b5347">INDUCED VERTICAL BREAK (inches)</text>
        {pts.map(r => { const lg = league[r.type]; return lg?.hb != null && lg?.ivb != null ? <circle key={`l${r.type}`} cx={X(lg.hb)} cy={Y(lg.ivb)} r={7} fill="none" stroke="#1A1A1A" strokeDasharray="3 3" opacity={0.5}><title>{`League average ${pitchLabel(r.type)}: ${lg.hb.toFixed(1)} in, ${lg.ivb.toFixed(1)} in`}</title></circle> : null })}
        {[...pts].sort((a, b) => b.pitches - a.pitches).map(r => { const rad = 6 + (r.usage ?? 10) * 0.26; return (
          <g key={r.type}><circle cx={X(r.hb as number)} cy={Y(r.ivb as number)} r={rad} fill={pitchColor(r.type)} fillOpacity={0.85} stroke="#1A1A1A" strokeWidth={cur === r.type ? 3 : 1}><title>{`${pitchLabel(r.type)}: ${(r.hb as number).toFixed(1)} in HB, ${(r.ivb as number).toFixed(1)} in IVB`}</title></circle>
            <text x={X(r.hb as number)} y={Y(r.ivb as number) - rad - 5} textAnchor="middle" fontSize={11} fontWeight={800} fill="#1A1A1A">{pitchLabel(r.type)}</text></g>
        ) })}
      </svg>
      <p style={note}>Solid dots are his pitches (sized by how often he throws them, outlined when selected); dashed dots are the league average for that pitch type. Inches toward the arm side (right) and induced rise (up; negative means it falls more than gravity alone would make it).</p>
    </>
  )
}
