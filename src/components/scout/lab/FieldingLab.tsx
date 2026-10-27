'use client'

// src/components/scout/lab/FieldingLab.tsx
//
// Scout Report → Fielding, in the lab layout. The page is one DEFENSE at a time (club pills) against the lineup it faces tonight. A selector down the left: the defense,
// then the opposing hitters it faces, then its fielders. The defense has two views:
//   Alignment   infield and outfield alignment as shares of pitches (all hitters, by side of the plate), the last 5 games, and the field drawn for each side
//   Range       the club's Outs Above Average by unit and every fielder across directions
// A hitter opens to his pull rate, how this defense has lined up against his side of the plate and against him, and the field drawn for his side.
// A fielder opens to his Outs Above Average by direction and against right- and left-handed hitters.
// The shift is banned, so alignment is Statcast's label for each pitch: Standard, Strategic (any other look) or Infield shade (infielders slide toward the pull side).
// Shade direction is a convention, not tracked coordinates. Everything is a count of what has happened; nothing here is a prediction.

import { useState } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import { C, SANS } from '@/components/team/ui'
import type { DefenseDesk, FielderLine, Tally } from '@/lib/scout/defense'
import { Pills, kick, note, star, tile } from '@/components/pitching-lab/LocationExplorer'
import LineChart, { CHART_BLUE, CHART_ORANGE } from '../charts/LineChart'

export type Fielder = FielderLine & { front: number | null; to3B: number | null; to1B: number | null; back: number | null; vsR: number | null; vsL: number | null; actual: string | null; est: string | null }
export type DefenseSide = { club: { id: number; abbr: string; name: string }; oppAbbr: string; desk: DefenseDesk | null; fielders: Fielder[] }
type View = 'align' | 'range'
const VIEWS: [View, string][] = [['align', 'Alignment'], ['range', 'Range']]
const STD = '#d6d3d1'
const dt: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }
const sh = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null)
const fp = (v: number | null | undefined) => (v == null ? '—' : `${v}%`)
const signed = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}`)
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`
const ord = (n: number) => { const v = n % 100; return v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th' }
const oaaColor = (v: number | null) => (v == null ? C.mute : v > 0 ? C.good : v < 0 ? C.bad : C.ink)

function Stack({ label, parts, n, min }: { label: string; parts: { label: string; value: number; color: string }[]; n: number; min: number }) {
  return (
    <div title={`n=${n} pitches`} style={{ opacity: n < min ? 0.45 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 800 }}>
        <span>{label}</span><span style={{ fontWeight: 600, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{parts.map(p => `${p.label} ${fp(sh(p.value, n))}`).join(' · ')} · n={n}{n < min && star}</span>
      </div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 3, gap: 2 }}>
        {parts.map(p => <span key={p.label} style={{ width: `${sh(p.value, n) ?? 0}%`, background: p.color }} />)}
      </div>
    </div>
  )
}
const ifParts = (t: Tally) => [{ label: 'Standard', value: t.ifStd, color: STD }, { label: 'Strategic', value: t.ifStrat, color: CHART_BLUE }, { label: 'Shade', value: t.ifShade, color: CHART_ORANGE }]
const ofParts = (t: Tally) => [{ label: 'Standard', value: t.ofStd, color: STD }, { label: 'Strategic', value: t.ofStrat, color: CHART_BLUE }]

// A schematic infield seen from behind home plate (first base on the right), drawn in feet from the plate. Hollow dots = the usual spots; orange dots = where an infield shade
// moves them (a few steps toward the hitter's pull side, left for a right-handed hitter). Positions illustrate the convention; they are not tracked coordinates.
const FT = 1.2, OX = 150, OY = 206
const px = (x: number) => OX + x * FT, py = (y: number) => OY - y * FT
const INFIELD = [{ pos: '1B', x: 56, y: 88 }, { pos: '2B', x: 30, y: 134 }, { pos: 'SS', x: -30, y: 134 }, { pos: '3B', x: -56, y: 88 }]
function Field({ stand, t, min, title }: { stand: 'L' | 'R'; t: Tally; min: number; title: string }) {
  const dir = stand === 'R' ? -1 : 1
  const H = [px(0), py(0)], B1 = [px(63.6), py(63.6)], B2 = [px(0), py(127.3)], B3 = [px(-63.6), py(63.6)], foulY = py(150)
  return (
    <figure style={{ margin: 0, opacity: t.n < min ? 0.55 : 1 }}>
      <figcaption style={{ ...dt, marginBottom: 4 }}>{title}</figcaption>
      <svg viewBox="0 0 300 222" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 10 }} role="img" aria-label={`Infield alignment against ${stand === 'R' ? 'right' : 'left'}-handed hitters`}>
        <rect width="300" height="222" fill="#e7e5e4" />
        <path d={`M${H[0]} ${H[1]} L${px(-150)} ${foulY} L${px(-150)} 0 L${px(150)} 0 L${px(150)} ${foulY} Z`} fill="#e3ecd9" />
        <circle cx={px(0)} cy={py(60.5)} r={95 * FT} fill="#e6d6b8" />
        <path d={`M${H[0]} ${H[1]} L${B1[0]} ${B1[1]} L${B2[0]} ${B2[1]} L${B3[0]} ${B3[1]} Z`} fill="#e3ecd9" stroke="#fff" strokeWidth={1.5} />
        <path d={`M${H[0]} ${H[1]} L${px(-150)} ${foulY} M${H[0]} ${H[1]} L${px(150)} ${foulY}`} stroke="#fff" strokeWidth={1.5} />
        <circle cx={px(0)} cy={py(60.5)} r={4.5} fill="#cdb98f" />
        {[B1, B2, B3].map((b, i) => <rect key={i} x={b[0] - 4} y={b[1] - 4} width={8} height={8} fill="#fff" stroke="#a8a29e" transform={`rotate(45 ${b[0]} ${b[1]})`} />)}
        <circle cx={px(stand === 'R' ? -8 : 8)} cy={py(-3)} r={5} fill="#57534e" />
        <text x={stand === 'R' ? 8 : 292} y={14} textAnchor={stand === 'R' ? 'start' : 'end'} fontSize={10} fill="#57534e" fontWeight={700}>{stand === 'R' ? '← pull side' : 'pull side →'}</text>
        {INFIELD.map(f => {
          const x2 = f.x + dir * 16
          return (
            <g key={f.pos}>
              <line x1={px(f.x)} y1={py(f.y)} x2={px(x2)} y2={py(f.y)} stroke={CHART_ORANGE} strokeWidth={2} strokeDasharray="3 2" />
              <circle cx={px(f.x)} cy={py(f.y)} r={7} fill="#fff" stroke="#57534e" strokeWidth={1.6} />
              <circle cx={px(x2)} cy={py(f.y)} r={7} fill={CHART_ORANGE} stroke="#fff" strokeWidth={1.6}><title>{`${f.pos}: where an infield shade moves him`}</title></circle>
              <text x={px(f.x)} y={py(f.y) + 3} textAnchor="middle" fontSize={8} fill="#57534e" fontWeight={700}>{f.pos}</text>
            </g>
          )
        })}
      </svg>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#5b5347' }}><b style={{ color: CHART_ORANGE }}>{fp(sh(t.ifShade, t.n))}</b> shade · <b style={{ color: CHART_BLUE }}>{fp(sh(t.ifStrat, t.n))}</b> strategic · <b>{fp(sh(t.ifStd, t.n))}</b> standard · n={t.n}{t.n < min && star}</p>
    </figure>
  )
}
function FieldKey() {
  return <p style={{ ...note, marginTop: 8 }}>Key: white dot = the usual spot · orange dot = where an infield shade moves that fielder (toward the pull side) · dashed line = the move. Drawings show direction, not distance.</p>
}

export default function FieldingLab({ clubs, minAlign, minVs }: { clubs: { away: DefenseSide; home: DefenseSide }; minAlign: number; minVs: number }) {
  const [side, setSide] = useState<'away' | 'home'>('away')
  const [pick, setPick] = useState('club')
  const [view, setView] = useState<View>('align')
  const k = clubs[side], d = k.desk
  const kind = pick.startsWith('h:') ? 'hitter' : pick.startsWith('f:') ? 'fielder' : 'club'
  const pid = kind === 'club' ? 0 : Number(pick.slice(2))
  const hitter = kind === 'hitter' ? d?.matchup.find(m => m.id === pid) : undefined
  const fielder = kind === 'fielder' ? k.fielders.find(f => f.id === pid) : undefined
  const roll = (() => {
    const g = d?.alignment.games ?? [], w = 5
    return { labels: g.slice(w - 1).map(x => shortDate(x.date)), values: g.map((_, i) => (i < w - 1 ? null : sh(g.slice(i - w + 1, i + 1).reduce((s, x) => s + x.ifStrat + x.ifShade, 0), g.slice(i - w + 1, i + 1).reduce((s, x) => s + x.n, 0)))).slice(w - 1) }
  })()
  const maxAbs = Math.max(3, ...k.fielders.flatMap(f => [f.front, f.to3B, f.to1B, f.back].map(v => Math.abs(v ?? 0))))

  return (
    <div className="fl-grid">
      <style>{`.fl-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:24px;align-items:start}.fl-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.fl-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit}.fl-btn small{display:block;font-weight:600;font-size:11.5px;color:#8a8275}.fl-btn.on{border-color:#FF5722;background:#fff1ea}.fl-h{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a89e8c;margin:8px 2px 0}.fl-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.fl-span2{grid-column:span 2}.fl-span3{grid-column:1 / -1}.fl-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.fl-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8}.fl-tbl th:first-child,.fl-tbl td:first-child{text-align:left}.fl-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #f1eee6}@media (max-width:1180px){.fl-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.fl-grid{grid-template-columns:minmax(0,1fr)}.fl-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.fl-h{display:none}.fl-btn{width:auto;white-space:nowrap}.fl-tiles{grid-template-columns:minmax(0,1fr)}.fl-span2{grid-column:auto}}`}</style>

      <nav className="fl-side" aria-label="Fielding subjects">
        <Pills items={[['away', `${clubs.away.club.abbr} defense`], ['home', `${clubs.home.club.abbr} defense`]] as ['away' | 'home', string][]} value={side} onChange={v => { setSide(v); setPick('club') }} />
        <button type="button" className={`fl-btn${kind === 'club' ? ' on' : ''}`} onClick={() => setPick('club')}><TeamMark id={k.club.id} abbr={k.club.abbr} size={28} /><span style={{ minWidth: 0 }}>The defense<small>vs the {k.oppAbbr} lineup</small></span></button>
        <div className="fl-h">Hitters it faces</div>
        {(d?.matchup ?? []).length === 0 && <p style={{ ...note, margin: '0 2px' }}>No lineup is available yet.</p>}
        {(d?.matchup ?? []).map(m => (
          <button key={m.id} type="button" className={`fl-btn${pick === `h:${m.id}` ? ' on' : ''}`} onClick={() => setPick(`h:${m.id}`)}>
            <Headshot id={m.id} name={m.name} size={32} />
            <span style={{ minWidth: 0 }}>{m.order}. {m.name}<small>bats {m.switchHitter ? `${m.stand} (switch)` : m.stand}{m.pullPct != null ? ` · pull ${m.pullPct.toFixed(0)}%` : ''}</small></span>
          </button>
        ))}
        <div className="fl-h">Fielders</div>
        {k.fielders.length === 0 && <p style={{ ...note, margin: '0 2px' }}>No lineup is available yet.</p>}
        {k.fielders.map(f => (
          <button key={f.id} type="button" className={`fl-btn${pick === `f:${f.id}` ? ' on' : ''}`} onClick={() => setPick(`f:${f.id}`)}>
            <Headshot id={f.id} name={f.name} size={32} />
            <span style={{ minWidth: 0 }}>{f.name}<small>{f.pos} · OAA {signed(f.oaa)}</small></span>
          </button>
        ))}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {kind === 'club' && <TeamMark id={k.club.id} abbr={k.club.abbr} size={44} />}
          {hitter && <Headshot id={hitter.id} name={hitter.name} size={52} />}
          {fielder && <Headshot id={fielder.id} name={fielder.name} size={52} />}
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{hitter?.name ?? fielder?.name ?? `${k.club.name} defense`}</h2>
          <span style={{ fontSize: 15, color: '#5b5347' }}>{hitter ? `${k.club.abbr} defense vs a ${hitter.stand === 'R' ? 'right' : 'left'}-handed hitter` : fielder ? `${k.club.abbr} · ${fielder.pos}` : `Against the ${k.oppAbbr} lineup`}</span>
        </div>

        {kind === 'club' && <Pills items={VIEWS} value={view} onChange={setView} />}
        {!d && kind === 'club' && view === 'align' && <p style={{ fontSize: 14, color: C.mute }}>Alignment data is unavailable for {k.club.abbr} right now.</p>}

        {kind === 'club' && d && view === 'align' && (
          <div className="fl-tiles">
            <div className="fl-span2" style={tile}>
              <div style={kick}>Infield alignment · share of pitches</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <Stack label="All hitters" parts={ifParts(d.alignment.all)} n={d.alignment.all.n} min={minAlign} />
                <Stack label="vs left-handed hitters" parts={ifParts(d.alignment.L)} n={d.alignment.L.n} min={minAlign} />
                <Stack label="vs right-handed hitters" parts={ifParts(d.alignment.R)} n={d.alignment.R.n} min={minAlign} />
              </div>
              <div style={{ ...kick, marginTop: 16 }}>Outfield alignment · share of pitches</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <Stack label="All hitters" parts={ofParts(d.alignment.all)} n={d.alignment.all.n} min={minAlign} />
                <Stack label="vs left-handed hitters" parts={ofParts(d.alignment.L)} n={d.alignment.L.n} min={minAlign} />
                <Stack label="vs right-handed hitters" parts={ofParts(d.alignment.R)} n={d.alignment.R.n} min={minAlign} />
              </div>
              <p style={note}>Grey = standard, blue = strategic, orange = infield shade (infielders slide toward the pull side). The last ~40 days of pitches. {star} marks under {minAlign} pitches.</p>
            </div>
            <div style={tile}>
              <div style={kick}>Not standard · last 5 games</div>
              {roll.values.length > 0 ? <LineChart labels={roll.labels} series={[{ key: 'a', label: `${k.club.abbr} non-standard infield`, color: CHART_ORANGE, values: roll.values }]} format={v => `${v.toFixed(0)}%`} height={150} ariaLabel={`${k.club.abbr} non-standard infield alignment, rolling 5 games`} /> : <p style={note}>Fewer than 5 games of pitches.</p>}
              <p style={note}>Share of pitches where the infield was strategic or shaded, rolling 5 games.</p>
            </div>
            <div className="fl-span3" style={tile}>
              <div style={kick}>The field · what a shade looks like</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginTop: 8 }}>
                <Field stand="R" t={d.alignment.R} min={minAlign} title="Against right-handed hitters" />
                <Field stand="L" t={d.alignment.L} min={minAlign} title="Against left-handed hitters" />
              </div>
              <FieldKey />
            </div>
            <div className="fl-span3" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>The {k.oppAbbr} lineup · how {k.club.abbr} has lined up</div>
              <table className="fl-tbl" style={{ marginTop: 6, minWidth: 560 }}>
                <thead><tr><th>Hitter</th><th>Bats</th><th>Pull</th><th>GB</th><th>Shade vs his side</th><th>Shade vs him</th></tr></thead>
                <tbody>
                  {d.matchup.map(m => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 800, cursor: 'pointer' }} onClick={() => setPick(`h:${m.id}`)}>{m.order}. {m.name}</td>
                      <td>{m.stand}{m.switchHitter ? ' (sw)' : ''}</td>
                      <td>{m.pullPct != null ? `${m.pullPct.toFixed(0)}%` : '—'}{m.bip > 0 && m.bip < 25 && star}</td>
                      <td>{m.gbPct != null ? `${m.gbPct.toFixed(0)}%` : '—'}</td>
                      <td>{fp(sh(m.vsSide.ifShade, m.vsSide.n))}<span style={{ color: C.faint, fontSize: 11 }}> n={m.vsSide.n}</span></td>
                      <td>{m.vsHim.n >= minVs ? <>{fp(sh(m.vsHim.ifShade, m.vsHim.n))}<span style={{ color: C.faint, fontSize: 11 }}> n={m.vsHim.n}</span></> : <span style={{ color: C.faint }}>n={m.vsHim.n}{star}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={note}>{star} on pull = under 25 balls in play; on &ldquo;vs him&rdquo; = under {minVs} pitches. Pull is the share of his balls in play hit to his pull side. Switch hitters bat opposite the probable starter.</p>
            </div>
          </div>
        )}

        {kind === 'club' && view === 'range' && (
          <div className="fl-tiles">
            <div style={tile}>
              <div style={kick}>Outs Above Average · the club</div>
              {d && d.team.oaa != null ? (
                <>
                  <p style={{ margin: '10px 0 0', fontSize: 38, fontWeight: 800, color: oaaColor(d.team.oaa), lineHeight: 1 }}>{signed(d.team.oaa)}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5b5347' }}>{d.team.rank ? `${d.team.rank}${ord(d.team.rank)} of ${d.team.of}` : ''}</p>
                  <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, margin: '12px 0 0' }}>
                    <div><dt style={dt}>Infield</dt><dd style={{ margin: 0, fontSize: 22, fontWeight: 800, color: oaaColor(d.team.infield) }}>{signed(d.team.infield)}</dd></div>
                    <div><dt style={dt}>Outfield</dt><dd style={{ margin: 0, fontSize: 22, fontWeight: 800, color: oaaColor(d.team.outfield) }}>{signed(d.team.outfield)}</dd></div>
                  </dl>
                </>
              ) : <p style={note}>No club OAA on record.</p>}
              <p style={note}>Outs Above Average: the outs a fielder or club made above what an average fielder would on the same plays. Green above zero, red below.</p>
            </div>
            <div className="fl-span2" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>Tonight&apos;s fielders · OAA by direction</div>
              {k.fielders.length === 0 ? <p style={note}>No lineup is available yet.</p> : (
                <table className="fl-tbl" style={{ marginTop: 6, minWidth: 520 }}>
                  <thead><tr><th>Fielder</th><th>Pos</th><th>OAA</th><th>In front</th><th>To 3B</th><th>To 1B</th><th>Behind</th><th>Runs</th></tr></thead>
                  <tbody>
                    {k.fielders.map(f => (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 800, cursor: 'pointer' }} onClick={() => setPick(`f:${f.id}`)}>{f.name}</td><td>{f.pos}</td>
                        <td style={{ fontWeight: 800, color: oaaColor(f.oaa) }}>{signed(f.oaa)}</td>
                        {[f.front, f.to3B, f.to1B, f.back].map((v, i) => <td key={i} style={{ color: oaaColor(v) }}>{signed(v)}</td>)}
                        <td>{signed(f.frp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p style={note}>Direction columns split a fielder&apos;s OAA by where the ball went: in front of him, toward third base, toward first base, or behind him. Runs = fielding runs prevented. A player with no entry did not meet the leaderboard minimum.</p>
            </div>
          </div>
        )}

        {hitter && d && (
          <div className="fl-tiles">
            <div style={tile}>
              <div style={kick}>Where he hits it</div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                <div><dt style={dt}>Pull</dt><dd style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>{hitter.pullPct != null ? `${hitter.pullPct.toFixed(0)}%` : '—'}</dd></div>
                <div><dt style={dt}>Ground balls</dt><dd style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>{hitter.gbPct != null ? `${hitter.gbPct.toFixed(0)}%` : '—'}</dd></div>
              </dl>
              <p style={note}>{hitter.bip} balls in play{hitter.bip < 25 && <> {star} under 25: a small sample</>}. He bats {hitter.switchHitter ? `${hitter.stand}, opposite the probable starter` : hitter.stand}.</p>
            </div>
            <div style={tile}>
              <div style={kick}>How {k.club.abbr} has lined up</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                <Stack label={`vs ${hitter.stand === 'R' ? 'right' : 'left'}-handed hitters`} parts={ifParts(hitter.vsSide)} n={hitter.vsSide.n} min={minAlign} />
                <Stack label="vs him" parts={ifParts(hitter.vsHim)} n={hitter.vsHim.n} min={minVs} />
              </div>
              <p style={note}>Infield alignment as a share of pitches, the last ~40 days. {star} marks a small sample.</p>
            </div>
            <div style={tile}>
              <Field stand={hitter.stand} t={hitter.vsSide} min={minAlign} title={`Against ${hitter.stand === 'R' ? 'right' : 'left'}-handed hitters`} />
              <FieldKey />
            </div>
          </div>
        )}

        {fielder && (
          <div className="fl-tiles">
            <div style={tile}>
              <div style={kick}>Outs Above Average</div>
              <p style={{ margin: '10px 0 0', fontSize: 38, fontWeight: 800, color: oaaColor(fielder.oaa), lineHeight: 1 }}>{signed(fielder.oaa)}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5b5347' }}>{fielder.frp != null ? `${signed(fielder.frp)} fielding runs prevented` : 'Not on the leaderboard'}</p>
              {fielder.actual && fielder.est && <p style={note}>Made {fielder.actual} of the plays he was given; an average fielder would make {fielder.est}.</p>}
            </div>
            <div className="fl-span2" style={tile}>
              <div style={kick}>By direction</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {([['In front of him', fielder.front], ['Toward third base', fielder.to3B], ['Toward first base', fielder.to1B], ['Behind him', fielder.back], ['Against right-handed hitters', fielder.vsR], ['Against left-handed hitters', fielder.vsL]] as [string, number | null][]).map(([l, v]) => (
                  <div key={l} style={{ display: 'grid', gridTemplateColumns: '170px minmax(0,1fr) 40px', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ fontWeight: 800 }}>{l}</span>
                    <span style={{ position: 'relative', height: 12, background: C.soft, borderRadius: 6 }}>
                      <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#a89e8c' }} />
                      {v != null && <span style={{ position: 'absolute', top: 0, bottom: 0, left: v >= 0 ? '50%' : `${50 - (Math.abs(v) / maxAbs) * 50}%`, width: `${(Math.abs(v) / maxAbs) * 50}%`, background: oaaColor(v), borderRadius: 6 }} />}
                    </span>
                    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 800, color: oaaColor(v) }}>{signed(v)}</span>
                  </div>
                ))}
              </div>
              <p style={note}>Outs above average on plays in each direction; green to the right is better than average, red to the left worse. Season to date.</p>
            </div>
          </div>
        )}

        <p style={{ ...note, margin: 0 }}>Alignment: Statcast&apos;s label for each pitch over the last ~40 days (the full shift is banned since 2023). Outs Above Average: the Statcast leaderboard. Shade direction is a convention, not a tracked fielder position. This describes what has happened; it is not a prediction.</p>
      </div>
    </div>
  )
}
