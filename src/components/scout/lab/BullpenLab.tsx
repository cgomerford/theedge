'use client'

// src/components/scout/lab/BullpenLab.tsx
//
// Scout Report → Bullpen, in the lab layout. A selector down the left lists each club's relievers with how tired they are (a status chip and the pitches of
// the last three and seven days); the chosen arm opens in five views:
//   Use & fatigue       the last seven days of pitches, where he pitches, his season line, his last six outings and his pitches
//   How they come in    the inning he enters, inherited runners, and the save, hold and finish marks (entry leverage is not published, so these stand in)
//   With the load       his results by days of rest and by the pitches of his previous outing, next to where he is tonight, and the whole pen's
//   Against the lineup  every arm against every hitter in the other club's lineup, career (grid, arm by arm)
//   Combined            the whole bullpen against each hitter in that lineup, and each arm against the lineup
// Everything is a count of what has happened. Nothing here is a prediction. Head-to-head comes from the MLB Stats API (/api/scout/bullpen-h2h), fetched
// only when those two views open.

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Headshot } from '@/components/home/Logo'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { fetchLabLog } from '@/lib/lab-log'
import type { PitcherPitchLog } from '@/lib/pitcher-pitch-log'
import type { BullpenArm, BullpenDesk } from '@/lib/scout/bullpen-desk'
import type { ArmUsage, SplitBucket } from '@/lib/scout/bullpen-trends'
import type { H2HCell } from '@/app/api/scout/bullpen-h2h/route'
import { buildPaths } from '@/components/pitching-lab/PitchFlight'
import { Pills, kick, note, star, tile } from '@/components/pitching-lab/LocationExplorer'

export type ClubPen = {
  club: { id: number; abbr: string; name: string }
  oppAbbr: string
  desk: BullpenDesk | null
  usage: Record<number, ArmUsage>
  pen: { byRest: SplitBucket[]; byPrevLoad: SplitBucket[]; loadVsRuns: SplitBucket[]; team: { apps: number; games: number; enterWithRunnersPct: number | null; pitchesPerApp: number | null; multiInningPct: number | null; ipPerGame: number | null } } | null
  lineup: { id: number; name: string; order: number; pos: string }[]
  lineupSource: string
}
type View = 'use' | 'entry' | 'load' | 'lineup' | 'combined'
const VIEWS: [View, string][] = [['use', 'Use & fatigue'], ['entry', 'How they come in'], ['load', 'With the load'], ['lineup', 'Against the lineup'], ['combined', 'Combined']]
const FLAG: Record<string, { word: string; color: string }> = {
  overworked: { word: 'Heavy use', color: '#D4533B' }, shaky: { word: 'Shaky', color: '#D4533B' }, sharp: { word: 'Effective', color: '#1D9E75' },
  rested: { word: 'Rested', color: '#1D9E75' }, steady: { word: 'Steady', color: '#8a8275' },
}
const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1))
const f2 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))
const f3 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const ipOf = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`
const dow = (d: string) => 'SMTWTFS'[new Date(`${d}T12:00:00Z`).getUTCDay()]
const days = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000)
const SRC: Record<string, string> = { confirmed: 'confirmed lineup', projected_from_previous_game: 'taken from the last game', unavailable: 'not available' }

function Bucket({ rows, here }: { rows: SplitBucket[]; here?: number }) {
  return (
    <table className="bl-tbl" style={{ marginTop: 6 }}>
      <thead><tr><th></th><th>Outings</th><th>IP</th><th>ERA</th><th>K%</th><th>BB%</th></tr></thead>
      <tbody>
        {rows.map((b, i) => (
          <tr key={b.label} style={i === here ? { outline: `2px solid ${C.orange}`, background: '#fff1ea' } : undefined}>
            <td style={{ fontWeight: 800 }}>{b.label}</td><td>{b.n}{b.n < 8 && b.n > 0 && star}</td><td>{b.n ? ipOf(b.outs) : '—'}</td>
            <td>{b.outs ? f2((b.er * 27) / b.outs) : '—'}</td><td>{b.bf ? `${((b.k / b.bf) * 100).toFixed(0)}%` : '—'}</td><td>{b.bf ? `${((b.bb / b.bf) * 100).toFixed(0)}%` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function BullpenLab({ gameDate, clubs }: { gameDate: string; clubs: { away: ClubPen; home: ClubPen } }) {
  const season = Number(gameDate.slice(0, 4))
  const [side, setSide] = useState<'away' | 'home'>('away')
  const pen = clubs[side]
  const arms = pen.desk?.arms ?? []
  const [armId, setArmId] = useState<number | null>(clubs.away.desk?.arms[0]?.id ?? null)
  const [view, setView] = useState<View>('use')
  const [h2h, setH2h] = useState<Record<string, H2HCell[] | 'loading' | 'error'>>({})
  const [logs, setLogs] = useState<Record<number, PitcherPitchLog | null>>({})
  const arm: BullpenArm | undefined = arms.find(a => a.id === armId) ?? arms[0]
  const use = arm ? pen.usage[arm.id] : undefined

  useEffect(() => {
    if (!arm || logs[arm.id] !== undefined) return
    let off = false
    fetchLabLog('pitcher', arm.id, season).then(l => { if (!off) setLogs(x => ({ ...x, [arm.id]: l })) })
    return () => { off = true }
  }, [arm?.id, season]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if ((view !== 'lineup' && view !== 'combined') || h2h[side] !== undefined || arms.length === 0 || pen.lineup.length === 0) return
    let off = false
    setH2h(x => ({ ...x, [side]: 'loading' }))
    fetch(`/api/scout/bullpen-h2h?arms=${arms.slice(0, 12).map(a => a.id).join(',')}&hitters=${pen.lineup.slice(0, 12).map(l => l.id).join(',')}`)
      .then(r => r.json()).then(j => { if (!off) setH2h(x => ({ ...x, [side]: j.error ? 'error' : (j.cells as H2HCell[]) })) }).catch(() => { if (!off) setH2h(x => ({ ...x, [side]: 'error' })) })
    return () => { off = true }
  }, [view, side]) // eslint-disable-line react-hooks/exhaustive-deps

  const sLog = arm ? logs[arm.id] : undefined
  const paths = useMemo(() => (sLog ? buildPaths(sLog) : []), [sLog])
  const cells = h2h[side]
  const cellMap = new Map<string, H2HCell>()
  if (Array.isArray(cells)) for (const c of cells) cellMap.set(`${c.arm}-${c.hitter}`, c)

  if (!pen.desk || arms.length === 0) return <p style={{ fontFamily: SANS, fontSize: 14, color: C.mute }}>No bullpen log for {pen.club.abbr} yet.</p>
  const scope = pen.desk.scope
  const prev = use?.recent[use.recent.length - 1]
  const rest = prev ? Math.max(0, days(prev.date, gameDate) - 1) : null
  const hereRest = rest == null ? undefined : rest === 0 ? 0 : rest === 1 ? 1 : 2
  const herePrev = prev ? (prev.pitches < 15 ? 0 : prev.pitches < 25 ? 1 : 2) : undefined
  const maxDay = Math.max(30, ...(arm?.byDate ?? [0]))

  return (
    <div className="bl-grid">
      <style>{`.bl-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:24px;align-items:start}.bl-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.bl-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit}.bl-btn small{display:block;font-weight:600;font-size:11.5px;color:#8a8275}.bl-btn.on{border-color:#FF5722;background:#fff1ea}.bl-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.bl-span2{grid-column:span 2}.bl-span3{grid-column:1 / -1}.bl-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.bl-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8}.bl-tbl th:first-child,.bl-tbl td:first-child{text-align:left}.bl-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #f1eee6}@media (max-width:1180px){.bl-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.bl-grid{grid-template-columns:minmax(0,1fr)}.bl-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.bl-btn{width:auto;white-space:nowrap}.bl-tiles{grid-template-columns:minmax(0,1fr)}.bl-span2{grid-column:auto}}`}</style>
      <SpinBallStyles />

      <nav className="bl-side" aria-label="Relievers">
        <Pills items={[['away', clubs.away.club.abbr], ['home', clubs.home.club.abbr]] as ['away' | 'home', string][]} value={side} onChange={v => { setSide(v); setArmId(clubs[v].desk?.arms[0]?.id ?? null) }} />
        {arms.map(a => (
          <button key={a.id} type="button" className={`bl-btn${arm?.id === a.id ? ' on' : ''}`} onClick={() => setArmId(a.id)}>
            <Headshot id={a.id} name={a.name} size={32} />
            <span style={{ minWidth: 0 }}>{a.name}<small>{a.role} · {a.hand ? `${a.hand}HP` : '—'} · L3 {a.p3} · L7 {a.p7}</small></span>
            <span style={{ marginLeft: 'auto', width: 9, height: 9, borderRadius: 999, background: FLAG[a.flag]?.color ?? C.mute, flexShrink: 0 }} title={`${FLAG[a.flag]?.word ?? a.flag}: ${a.flagReason}`} />
          </button>
        ))}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        {arm && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Headshot id={arm.id} name={arm.name} size={52} />
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{arm.name}</h2>
            <span style={{ fontSize: 15, color: '#5b5347' }}>{pen.club.abbr} · {arm.role}{arm.hand ? ` · ${arm.hand === 'L' ? 'left' : 'right'}-handed` : ''}</span>
            <span title={arm.flagReason} style={{ fontSize: 13, fontWeight: 800, color: FLAG[arm.flag]?.color, border: `1px solid ${FLAG[arm.flag]?.color}`, borderRadius: 999, padding: '2px 10px' }}>{FLAG[arm.flag]?.word}</span>
            <Link href={`/mlb/lab/pitching-lab/${arm.id}/arsenal`} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: C.orange, textDecoration: 'none' }}>Pitching Lab →</Link>
          </div>
        )}
        <Pills items={VIEWS} value={view} onChange={setView} />
        {scope.kind !== 'regular' && (
          <p style={{ ...note, margin: 0 }}>
            {scope.kind === 'combined' ? `Early in the postseason (${scope.postGames} played), so the seven days count the regular season (${scope.windowRegular} games) and the postseason (${scope.windowPostseason}) together.` : `Postseason games only in the last seven days (${scope.windowPostseason}); ${scope.postGames} played this postseason.`} Read from the box scores.
          </p>
        )}

        {arm && view === 'use' && (
          <div className="bl-tiles">
            <div style={tile}>
              <div style={kick}>Last seven days</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110, marginTop: 10 }}>
                {pen.desk.dates.map((d, i) => (
                  <div key={d} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: C.mute }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.ink, minHeight: 14 }}>{arm.byDate[i] || ''}</div>
                    <div title={`${d}: ${arm.byDate[i]} pitches`} style={{ height: Math.max(2, (arm.byDate[i] / maxDay) * 80), background: arm.byDate[i] ? C.orange : C.soft, borderRadius: 4, margin: '2px 0' }} />
                    {dow(d)}
                  </div>
                ))}
              </div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                {[['Last 3 days', `${arm.p3}`], ['Last 7 days', `${arm.p7}`], ['Outings', `${arm.apps7}`]].map(([k, v]) => <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{v}</dd></div>)}
              </dl>
              <p style={note}>{FLAG[arm.flag]?.word}: {arm.flagReason}.{arm.post && arm.post.apps > 0 ? ` Postseason so far: ${arm.post.apps} outings, ${arm.post.pitches} pitches, ${arm.post.ip} IP${arm.post.era != null ? `, ${f2(arm.post.era)} ERA` : ''}.` : ''}</p>
            </div>

            <div style={tile}>
              <div style={kick}>Where he pitches</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {[5, 6, 7, 8, 9].map(n => { const v = arm.innings[n] ?? 0, mx = Math.max(1, ...Object.values(arm.innings)); return (
                  <div key={n} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) 30px', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ fontWeight: 800 }}>{n === 9 ? '9th+' : `${n}th`}</span>
                    <span style={{ height: 12, background: C.soft, borderRadius: 6, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(v / mx) * 100}%`, background: C.orange }} /></span>
                    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                  </div>
                ) })}
              </div>
              <p style={note}>Season outings that began in each inning.</p>
            </div>

            <div style={tile}>
              <div style={kick}>Season line · relief</div>
              {use ? (
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px 8px', margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                  {([['Outings', String(use.apps)], ['IP', ipOf(use.outs)], ['ERA', f2(use.era)], ['K', use.kPct != null ? `${use.kPct.toFixed(0)}%` : '—'], ['BB', use.bbPct != null ? `${use.bbPct.toFixed(0)}%` : '—'], ['Strikes', use.strikePct != null ? `${use.strikePct.toFixed(0)}%` : '—'], ['Pitches / outing', f1(use.pitchesPerApp)], ['Multi-inning', use.multiInningPct != null ? `${use.multiInningPct.toFixed(0)}%` : '—'], ['SV · HLD · BS', `${use.save} · ${use.hold} · ${use.bs}`]] as [string, string][]).map(([k, v]) => <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{v}</dd></div>)}
                </dl>
              ) : <p style={note}>No relief log on record.</p>}
            </div>

            <div className="bl-span2" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>Last six outings</div>
              {use && use.recent.length > 0 ? (
                <table className="bl-tbl" style={{ marginTop: 6, minWidth: 460 }}>
                  <thead><tr><th>Date</th><th>IP</th><th>Pitches</th><th>BF</th><th>K</th><th>BB</th><th>ER</th><th>Inherited</th></tr></thead>
                  <tbody>{[...use.recent].reverse().map(o => <tr key={`${o.pk}`}><td style={{ fontWeight: 800 }}>{o.date}</td><td>{ipOf(o.outs)}</td><td>{o.pitches}</td><td>{o.bf}</td><td>{o.k}</td><td>{o.bb}</td><td>{o.er}</td><td>{o.inhR ? `${o.inhRS} of ${o.inhR} scored` : '—'}</td></tr>)}</tbody>
                </table>
              ) : <p style={note}>No recent outings.</p>}
            </div>

            <div style={tile}>
              <div style={kick}>His pitches</div>
              {sLog === undefined ? <p style={note}>Loading…</p> : !sLog || sLog.pitches.length === 0 ? <p style={note}>No pitches on record this season.</p> : (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {paths.slice(0, 5).map(p => (
                    <div key={p.type} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1fr) 92px', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <SpinBall code={p.type} size={26} spin={{ rpm: p.spin, ivb: p.ivb, hb: p.hb }} />
                      <span><b>{p.name}</b> <span style={{ color: C.faint }}>{(p.share * 100).toFixed(0)}%</span></span>
                      <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.velo != null ? `${p.velo.toFixed(1)} mph` : '—'}</span>
                    </div>
                  ))}
                  <p style={note}>{sLog.pitches.length} pitches; the ball turns the way the pitch spins. Full detail in his Pitching Lab.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {arm && view === 'entry' && (
          <div className="bl-tiles">
            <div style={tile}>
              <div style={kick}>The inning he comes in</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {(() => { const tot = Object.values(arm.innings).reduce((a, b) => a + b, 0); return [5, 6, 7, 8, 9].map(n => { const v = arm.innings[n] ?? 0; return (
                  <div key={n} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) 64px', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ fontWeight: 800 }}>{n === 9 ? '9th+' : `${n}th`}</span>
                    <span style={{ height: 12, background: C.soft, borderRadius: 6, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${tot ? (v / tot) * 100 : 0}%`, background: C.orange }} /></span>
                    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{tot ? `${((v / tot) * 100).toFixed(0)}%` : '—'} <span style={{ color: C.faint }}>({v})</span></span>
                  </div>
                ) }) })()}
              </div>
            </div>
            <div style={tile}>
              <div style={kick}>Runners he inherits</div>
              {use ? (
                <>
                  <p style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{use.inhR ? `${use.inhRS} of ${use.inhR}` : '—'}</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#5b5347' }}>{use.inhR ? `${((use.inhRS / use.inhR) * 100).toFixed(0)}% of the runners on base when he came in scored.` : 'He has not inherited a runner this season.'}</p>
                  <p style={note}>{use.inhR < MIN_SAMPLE.h2hPA ? <>{star} Under {MIN_SAMPLE.h2hPA} inherited runners: a small sample. </> : ''}The whole pen enters with runners on in {pen.pen?.team.enterWithRunnersPct != null ? `${pen.pen.team.enterWithRunnersPct.toFixed(0)}%` : '—'} of its outings.</p>
                </>
              ) : <p style={note}>No relief log on record.</p>}
            </div>
            <div style={tile}>
              <div style={kick}>Save, hold and finish marks</div>
              {use ? (
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px 8px', margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                  {([['Saves', use.save], ['Holds', use.hold], ['Blown saves', use.bs], ['Games finished', use.gf]] as [string, number][]).map(([k, v]) => <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{v}</dd></div>)}
                </dl>
              ) : null}
              <p style={note}>The score and leverage when a reliever enters are not published, so saves, holds and blown saves stand in for the close, late spots.</p>
            </div>
            <div className="bl-span3" style={tile}>
              <div style={kick}>How long he works</div>
              {use ? (
                <p style={{ margin: '8px 0 0', fontSize: 15, color: '#3a352c', lineHeight: 1.5 }}>
                  {f1(use.pitchesPerApp)} pitches an outing, and {use.multiInningPct != null ? `${use.multiInningPct.toFixed(0)}%` : '—'} of his outings go four or more outs ({use.apps} outings). {arm.role === 'Closer' ? 'He is the closer.' : arm.role === 'High-leverage' ? 'He pitches in the high-leverage innings.' : 'He is a bridge arm.'}
                </p>
              ) : <p style={note}>No relief log on record.</p>}
            </div>
          </div>
        )}

        {arm && view === 'load' && (
          <div className="bl-tiles">
            <div style={tile}>
              <div style={kick}>Where he is tonight</div>
              <p style={{ margin: '10px 0 0', fontSize: 15, color: '#3a352c', lineHeight: 1.55 }}>
                {prev ? <>Last pitched on <b>{prev.date}</b>: <b>{prev.pitches}</b> pitches, <b>{rest === 0 ? 'no days of rest' : rest === 1 ? '1 day of rest' : `${rest} days of rest`}</b> before tonight. {arm.p3} pitches in the last three days.</> : 'No earlier outings on record.'}
              </p>
              <p style={note}>The highlighted rows to the right are the ones that match tonight.</p>
            </div>
            <div className="bl-span2" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>His results by days of rest</div>
              {use ? <Bucket rows={use.byRest} here={hereRest} /> : <p style={note}>No relief log on record.</p>}
              <div style={{ ...kick, marginTop: 14 }}>By the pitches of his previous outing</div>
              {use ? <Bucket rows={use.byPrevLoad} here={herePrev} /> : null}
              <p style={note}>Relief outings this season, regular season and postseason. {star} marks fewer than 8 outings, too few to read into.</p>
            </div>
            {pen.pen && (
              <div className="bl-span3" style={{ ...tile, overflowX: 'auto' }}>
                <div style={kick}>The whole {pen.club.abbr} pen</div>
                <div className="bl-tiles" style={{ marginTop: 6 }}>
                  <div><div style={{ fontSize: 12, fontWeight: 800, color: C.mute }}>By days of rest</div><Bucket rows={pen.pen.byRest} /></div>
                  <div><div style={{ fontSize: 12, fontWeight: 800, color: C.mute }}>By the previous outing</div><Bucket rows={pen.pen.byPrevLoad} /></div>
                  <div><div style={{ fontSize: 12, fontWeight: 800, color: C.mute }}>Runs allowed by the pen&apos;s load in the three days before</div>{pen.pen.loadVsRuns.length ? <Bucket rows={pen.pen.loadVsRuns} /> : <p style={note}>Not enough games yet.</p>}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {(view === 'lineup' || view === 'combined') && (
          <div style={{ ...tile, overflowX: 'auto' }}>
            <div style={kick}>{view === 'lineup' ? `${pen.club.abbr} arms against the ${pen.oppAbbr} lineup` : `The ${pen.club.abbr} bullpen, combined, against the ${pen.oppAbbr} lineup`} · career</div>
            <p style={{ ...note, marginTop: 4 }}>Lineup: {SRC[pen.lineupSource] ?? pen.lineupSource}. Each cell is hits for at-bats, head to head over their careers.</p>
            {pen.lineup.length === 0 ? <p style={note}>No lineup is available yet.</p> : cells === undefined || cells === 'loading' ? <p style={note}>Loading the head-to-head…</p> : cells === 'error' ? <p style={note}>Couldn&apos;t load the head-to-head right now.</p> : view === 'lineup' ? (
              <table className="bl-tbl" style={{ marginTop: 8, minWidth: 520 }}>
                <thead><tr><th>Hitter</th>{arms.map(a => <th key={a.id} title={a.name}>{a.name.split(' ').slice(-1)[0]}</th>)}<th>Pen</th></tr></thead>
                <tbody>
                  {pen.lineup.map(l => {
                    const row = arms.map(a => cellMap.get(`${a.id}-${l.id}`))
                    const t = row.reduce((s, c) => ({ h: s.h + (c?.h ?? 0), ab: s.ab + (c?.ab ?? 0), k: s.k + (c?.k ?? 0), bb: s.bb + (c?.bb ?? 0), pa: s.pa + (c?.pa ?? 0) }), { h: 0, ab: 0, k: 0, bb: 0, pa: 0 })
                    return (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 800 }}>{l.order}. {l.name} <span style={{ color: C.faint, fontWeight: 600, fontSize: 11 }}>{l.pos}</span></td>
                        {row.map((c, i) => <td key={arms[i].id} title={c ? `${c.pa} PA · ${c.k} K · ${c.bb} BB · ${c.hr} HR${c.ops != null ? ` · ${f3(c.ops)} OPS` : ''}` : ''} style={{ background: c && c.ab >= 3 ? (c.avg ?? 0) >= 0.3 ? 'rgba(212,83,59,.22)' : (c.avg ?? 0) <= 0.15 ? 'rgba(108,171,221,.28)' : undefined : undefined }}>{c && c.pa ? `${c.h}-${c.ab}` : '—'}</td>)}
                        <td style={{ fontWeight: 800 }} title={`${t.pa} PA · ${t.k} K · ${t.bb} BB`}>{t.pa ? `${t.h}-${t.ab}` : '—'}{t.pa > 0 && t.pa < MIN_SAMPLE.h2hPA && star}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ fontWeight: 800 }}>
                    <td>Lineup</td>
                    {arms.map(a => { const t = pen.lineup.reduce((s, l) => { const c = cellMap.get(`${a.id}-${l.id}`); return { h: s.h + (c?.h ?? 0), ab: s.ab + (c?.ab ?? 0), pa: s.pa + (c?.pa ?? 0) } }, { h: 0, ab: 0, pa: 0 }); return <td key={a.id}>{t.pa ? `${t.h}-${t.ab}` : '—'}</td> })}
                    <td />
                  </tr>
                </tbody>
              </table>
            ) : (
              <table className="bl-tbl" style={{ marginTop: 8, minWidth: 520 }}>
                <thead><tr><th>Hitter</th><th>PA</th><th>H-AB</th><th>AVG</th><th>HR</th><th>BB</th><th>K</th><th>Arms faced</th></tr></thead>
                <tbody>
                  {pen.lineup.map(l => {
                    const cs = arms.map(a => cellMap.get(`${a.id}-${l.id}`)).filter((c): c is H2HCell => !!c && c.pa > 0)
                    const t = cs.reduce((s, c) => ({ pa: s.pa + c.pa, ab: s.ab + c.ab, h: s.h + c.h, hr: s.hr + c.hr, bb: s.bb + c.bb, k: s.k + c.k }), { pa: 0, ab: 0, h: 0, hr: 0, bb: 0, k: 0 })
                    return (
                      <tr key={l.id}>
                        <td style={{ fontWeight: 800 }}>{l.order}. {l.name}</td>
                        <td>{t.pa}{t.pa < MIN_SAMPLE.h2hPA && star}</td><td>{t.h}-{t.ab}</td><td>{t.ab ? f3(t.h / t.ab) : '—'}</td><td>{t.hr}</td><td>{t.bb}</td><td>{t.k}</td>
                        <td style={{ textAlign: 'left', color: C.mute, fontSize: 12 }}>{cs.length ? cs.sort((a, b) => b.pa - a.pa).slice(0, 3).map(c => `${arms.find(a => a.id === c.arm)?.name.split(' ').slice(-1)[0]} ${c.h}-${c.ab}`).join(' · ') : 'none'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <p style={note}>{star} marks fewer than {MIN_SAMPLE.h2hPA} plate appearances. These are past results between these players; they say nothing about tonight.</p>
          </div>
        )}
      </div>
    </div>
  )
}

