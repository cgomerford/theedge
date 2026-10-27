'use client'

// src/components/pitching-lab/MatchupLab.tsx
//
// Pitching Lab → H2H. One pitcher against one hitter, every time they have met in the Statcast era (2015 on, regular season), from the
// pitcher's career per-pitch log: the totals, how each pitch type has done, where the pitches went, and every plate appearance with
// the pitches in it (type, speed, zone, count, result, exit speed), filterable by season, runners and result.
// Pick an opponent on the left, then a hitter from that club's 40-man roster (hitters this pitcher has faced come first, with the plate
// appearances), or search any player, or take one of the hitters he has faced most.
//
// Data: /api/mlb/pitch-log?range=career&summary=faced (who he has faced), ...&batterId= (the pitches to one hitter), /api/mlb/team-roster,
// /api/lab/search. Counting uses src/lib/zone-stats.ts. Nothing is estimated; a hitter he has not faced says so.

import { useEffect, useMemo, useState } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import SpinBall, { SpinBallStyles } from '@/components/home/SpinBall'
import { C, SANS } from '@/components/team/ui'
import { pitchColor } from '@/lib/mlb'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { MLB_TEAMS } from '@/lib/teams'
import type { PitcherPitchLog, RawPitch } from '@/lib/pitcher-pitch-log'
import { aggregate, metric } from '@/lib/zone-stats'
import { SmoothHeatmap } from './ArsenalExtras'
import { Pills, kick, note, star, tile } from './LocationExplorer'

type Person = { id: number; name: string }
type Faced = { id: number; name: string; pitches: number; pa: number }
type RosterRow = { id: number; name: string; pos: string }
type PA = { key: string; date: string; inning: number | null; runners: string; pitches: RawPitch[]; event: string | null; kind: 'hit' | 'hr' | 'k' | 'bb' | 'out' | 'open'; text: string }

const f3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const pc = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`)
const label = (e: string) => e.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

function resCode(d: string | null): string {
  switch (d) {
    case 'ball': case 'blocked_ball': case 'intent_ball': case 'pitchout': case 'automatic_ball': return 'B'
    case 'called_strike': case 'automatic_strike': return 'CS'
    case 'swinging_strike': case 'swinging_strike_blocked': case 'missed_bunt': case 'foul_tip': return 'SS'
    case 'foul': case 'foul_bunt': return 'F'
    case 'hit_into_play': return 'IP'
    case 'hit_by_pitch': return 'HBP'
    default: return ''
  }
}
const resWord: Record<string, string> = { B: 'Ball', CS: 'Called strike', SS: 'Swinging strike', F: 'Foul', IP: 'In play', HBP: 'Hit by pitch' }

function buildPAs(pitches: RawPitch[]): PA[] {
  const by = new Map<string, RawPitch[]>()
  for (const p of pitches) {
    if (p.gamePk == null || p.atBatNumber == null) continue
    const k = `${p.gamePk}-${p.atBatNumber}`
    if (!by.has(k)) by.set(k, [])
    by.get(k)!.push(p)
  }
  const out: PA[] = []
  for (const [key, ps] of by) {
    ps.sort((a, b) => (a.pitchNumber ?? 0) - (b.pitchNumber ?? 0))
    const first = ps[0], last = ps[ps.length - 1]
    const ended = last.wobaDen != null && last.wobaDen > 0
    const ev = ended ? last.result ?? '' : ''
    let kind: PA['kind'] = 'open', text = 'No result recorded'
    if (ended) {
      if (ev === 'home_run') { kind = 'hr'; text = 'Home run' }
      else if (last.isHit) { kind = 'hit'; text = label(ev) }
      else if (ev.startsWith('strikeout')) { kind = 'k'; text = `Strikeout ${last.description === 'called_strike' ? 'looking' : 'swinging'}` }
      else if (ev === 'walk' || ev === 'intent_walk' || ev === 'hit_by_pitch') { kind = 'bb'; text = label(ev) }
      else { kind = 'out'; text = label(ev || 'Out') }
    }
    const r = [first.onBase.first ? '1B' : '', first.onBase.second ? '2B' : '', first.onBase.third ? '3B' : ''].filter(Boolean).join(' ')
    out.push({ key, date: first.date, inning: first.inning, runners: r || 'Bases empty', pitches: ps, event: ev || null, kind, text })
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.key < b.key ? 1 : -1))
}

export default function MatchupLab({ pitcherId, pitcherName }: { pitcherId: number; pitcherName: string }) {
  const season = new Date().getFullYear()
  const [faced, setFaced] = useState<Faced[] | null>(null)
  const [teamId, setTeamId] = useState<number | null>(null)
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [batter, setBatter] = useState<Person | null>(null)
  const [log, setLog] = useState<PitcherPitchLog | null | 'error'>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: number; fullName: string }[]>([])
  const [yr, setYr] = useState('all')
  const [runners, setRunners] = useState<'any' | 'on' | 'empty'>('any')
  const [kind, setKind] = useState<PA['kind'] | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let off = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${season}&range=career&summary=faced`).then(r => r.json()).then(j => { if (!off) setFaced(j.error ? [] : (j.faced as Faced[])) }).catch(() => { if (!off) setFaced([]) })
    return () => { off = true }
  }, [pitcherId, season])

  useEffect(() => {
    if (teamId == null) return
    let off = false
    fetch(`/api/mlb/team-roster?teamId=${teamId}`).then(r => r.json()).then(j => { if (!off) setRoster(j.error ? [] : (j.players as RosterRow[])) }).catch(() => { if (!off) setRoster([]) })
    return () => { off = true }
  }, [teamId])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    const t = setTimeout(() => {
      fetch(`/api/lab/search?q=${encodeURIComponent(q)}`).then(r => r.json()).then(d => setResults((d.people ?? []).slice(0, 6))).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!batter) return
    let off = false
    fetch(`/api/mlb/pitch-log?playerId=${pitcherId}&season=${season}&range=career&batterId=${batter.id}`).then(r => r.json()).then(j => { if (!off) setLog(j.error ? 'error' : j) }).catch(() => { if (!off) setLog('error') })
    return () => { off = true }
  }, [pitcherId, season, batter])

  const facedMap = useMemo(() => new Map((faced ?? []).map(f => [f.id, f])), [faced])
  const pas = useMemo(() => (log && log !== 'error' ? buildPAs(log.pitches) : []), [log])
  const years = useMemo(() => [...new Set(pas.map(p => p.date.slice(0, 4)))].sort().reverse(), [pas])
  const shown = useMemo(() => pas.filter(p => (yr === 'all' || p.date.startsWith(yr)) && (runners === 'any' || (runners === 'empty') === (p.runners === 'Bases empty')) && (kind === 'all' || p.kind === kind)), [pas, yr, runners, kind])
  const shownPitches = useMemo(() => shown.flatMap(p => p.pitches), [shown])
  const agg = useMemo(() => aggregate(shownPitches), [shownPitches])
  const typeRows = useMemo(() => {
    const by = new Map<string, RawPitch[]>()
    for (const p of shownPitches) { if (!by.has(p.pitchType)) by.set(p.pitchType, []); by.get(p.pitchType)!.push(p) }
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([t, ps]) => {
      const v = ps.filter(p => p.velo != null).map(p => p.velo as number)
      return { t, n: ps.length, velo: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, agg: aggregate(ps).all }
    })
  }, [shownPitches])

  const team = MLB_TEAMS.find(t => t.id === teamId) ?? null
  const rosterSorted = useMemo(() => (roster ?? []).slice().sort((a, b) => (facedMap.get(b.id)?.pa ?? 0) - (facedMap.get(a.id)?.pa ?? 0) || a.name.localeCompare(b.name)), [roster, facedMap])
  const choose = (p: Person) => { setBatter(p); setLog(null); setYr('all'); setRunners('any'); setKind('all'); setOpen(null); setQuery(''); setResults([]) }
  const last = (n: string) => n.split(' ').slice(-1)[0]

  let K = 0, BB = 0, HR = 0
  for (const p of shown) { if (p.kind === 'k') K++; else if (p.kind === 'bb') BB++; if (p.kind === 'hr') HR++ }
  const pa = shown.filter(p => p.kind !== 'open').length

  return (
    <div className="h2-grid">
      <style>{`.h2-grid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.h2-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px;max-height:calc(100vh - 80px);overflow-y:auto;padding-right:2px}.h2-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit;flex-shrink:0}.h2-btn.on{border-color:#FF5722;background:#fff1ea}.h2-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.h2-span2{grid-column:span 2}.h2-span3{grid-column:1 / -1}.h2-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.h2-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:right;padding:6px 8px;border-bottom:1px solid #e7e2d8}.h2-tbl th:first-child,.h2-tbl td:first-child{text-align:left}.h2-tbl td{text-align:right;padding:7px 8px;border-top:1px solid #f1eee6}.h2-pa{width:100%;text-align:left;background:#fff;border:1px solid #e7e2d8;border-radius:12px;padding:10px 12px;cursor:pointer;font-family:inherit}.h2-pa:hover{border-color:#FF5722}@media (max-width:1180px){.h2-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.h2-grid{grid-template-columns:minmax(0,1fr)}.h2-side{position:static;flex-direction:row;overflow-x:auto;max-height:none;padding-bottom:4px}.h2-btn{width:auto;white-space:nowrap}.h2-tiles{grid-template-columns:minmax(0,1fr)}.h2-span2{grid-column:auto}}`}</style>
      <SpinBallStyles />

      <nav className="h2-side" aria-label="Opponent">
        <div style={{ ...kick, margin: '0 2px 2px' }}>Opponent</div>
        {MLB_TEAMS.map(t => (
          <button key={t.id} type="button" className={`h2-btn${teamId === t.id ? ' on' : ''}`} onClick={() => { setTeamId(t.id); setRoster(null) }}>
            <TeamMark id={t.id} abbr={t.abbrev} size={22} /><span style={{ fontWeight: 600, color: C.mute, fontSize: 12 }}>{t.short}</span>
          </button>
        ))}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ ...tile, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={kick}>{pitcherName} against…</div>
          {batter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Headshot id={batter.id} name={batter.name} size={52} />
              <div>
                <b style={{ fontSize: 24, fontWeight: 800 }}>{batter.name}</b>
                <div style={{ fontSize: 13, color: C.mute }}>{log === null ? 'Loading every meeting…' : log === 'error' ? 'Couldn’t load this matchup right now.' : pas.length === 0 ? 'They have not met in the regular-season Statcast data (2015 on).' : `${pas.filter(p => p.kind !== 'open').length} plate appearances since ${years[years.length - 1]}`}</div>
              </div>
              <button type="button" onClick={() => { setBatter(null); setLog(null) }} style={{ marginLeft: 'auto', fontFamily: SANS, fontSize: 12, fontWeight: 800, color: C.orange, background: 'none', border: 0, cursor: 'pointer' }}>Change hitter</button>
            </div>
          )}
          {!batter && (
            <>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search any hitter" aria-label="Search any hitter" style={{ fontFamily: SANS, fontSize: 15, padding: '9px 12px', border: `1px solid ${C.line}`, borderRadius: 10, maxWidth: 360 }} />
              {query.trim().length >= 3 && results.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {results.map(r => <button key={r.id} type="button" onClick={() => choose({ id: r.id, name: r.fullName })} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '4px 12px', border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}>{r.fullName}</button>)}
                </div>
              )}
              {team && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.mute, marginBottom: 6 }}>{team.name} hitters{roster === null ? ' (loading)' : ''}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {rosterSorted.map(r => {
                      const f = facedMap.get(r.id)
                      return (
                        <button key={r.id} type="button" onClick={() => choose({ id: r.id, name: r.name })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '4px 12px 4px 6px', border: `1px solid ${f ? C.orange : C.line}`, background: f ? '#fff1ea' : '#fff', color: f ? C.ink : C.mute, cursor: 'pointer' }}>
                          <Headshot id={r.id} name={r.name} size={24} />{r.name} <span style={{ fontWeight: 600, color: C.faint }}>{r.pos}{f ? ` · ${f.pa} PA` : ''}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {!team && <div style={{ fontSize: 13, color: C.mute }}>Choose an opponent on the left for its hitters, or search for any player. Hitters {pitcherName} has faced are marked with their plate appearances.</div>}
              {faced && faced.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.mute, marginBottom: 6 }}>Faced most</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {faced.slice(0, 12).map(f => <button key={f.id} type="button" onClick={() => choose({ id: f.id, name: f.name })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: SANS, fontSize: 13, fontWeight: 800, borderRadius: 999, padding: '4px 12px 4px 6px', border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}><Headshot id={f.id} name={f.name} size={24} />{f.name} <span style={{ fontWeight: 600, color: C.faint }}>{f.pa} PA</span></button>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {batter && log && log !== 'error' && pas.length > 0 && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center' }}>
              <Pills items={[['all', 'All seasons'], ...years.map(y => [y, y] as [string, string])]} value={yr} onChange={setYr} />
              <Pills items={[['any', 'Any runners'], ['on', 'Runners on'], ['empty', 'Bases empty']] as ['any' | 'on' | 'empty', string][]} value={runners} onChange={setRunners} />
              <Pills items={[['all', 'Any result'], ['hit', 'Hits'], ['hr', 'Home runs'], ['out', 'Outs'], ['k', 'Strikeouts'], ['bb', 'Walks']] as [PA['kind'] | 'all', string][]} value={kind} onChange={setKind} />
            </div>

            <div className="h2-tiles">
              <div className="h2-span2" style={tile}>
                <div style={kick}>{pitcherName} vs {batter.name} · the totals</div>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(86px,1fr))', gap: '12px 10px', margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                  {([
                    ['PA', String(pa)], ['AB', String(agg.all.ab)], ['H', String(agg.all.hits)], ['HR', String(HR)], ['BB', String(BB)], ['K', String(K)],
                    ['AVG', f3(metric(agg.all, 'ba', 0).v)], ['SLG', f3(metric(agg.all, 'slg', 0).v)], ['xwOBA', f3(metric(agg.all, 'xwoba', 0).v)],
                    ['Whiff', pc(metric(agg.all, 'whiff', 0).v)], ['Hard-hit', pc(metric(agg.all, 'hard', 0).v)], ['Pitches', String(agg.all.n)],
                  ] as [string, string][]).map(([k, v]) => <div key={k}><dt style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{v}</dd></div>)}
                </dl>
                <p style={note}>{pa < MIN_SAMPLE.h2hPA ? <>{star} Under {MIN_SAMPLE.h2hPA} plate appearances: a small sample, so read it as a list of what happened, not a trend. </> : ''}Regular season, 2015 on. AVG, SLG, xwOBA, whiff and hard-hit are over the plate appearances and pitches in the filters above.</p>
              </div>

              <SmoothHeatmap pitches={shownPitches} title={`${last(batter.name)} · where it was thrown`} counts={false} />

              <div className="h2-span3" style={{ ...tile, overflowX: 'auto' }}>
                <div style={kick}>Each pitch type</div>
                <table className="h2-tbl" style={{ marginTop: 6, minWidth: 560 }}>
                  <thead><tr><th>Pitch</th><th>Thrown</th><th>Share</th><th>Velo</th><th>Whiff</th><th>AVG</th><th>SLG</th><th>xwOBA</th><th>Hard-hit</th></tr></thead>
                  <tbody>
                    {typeRows.map(r => (
                      <tr key={r.t}>
                        <td style={{ fontWeight: 800 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><SpinBall code={r.t} size={22} spin={null} />{log.pitchNames[r.t] ?? r.t}</span></td>
                        <td>{r.n}</td><td>{pc(r.n / agg.all.n)}</td><td>{r.velo != null ? `${r.velo.toFixed(1)} mph` : '—'}</td>
                        <td>{pc(metric(r.agg, 'whiff', 0).v)}</td><td>{f3(metric(r.agg, 'ba', 0).v)}</td><td>{f3(metric(r.agg, 'slg', 0).v)}</td><td>{f3(metric(r.agg, 'xwoba', 0).v)}</td><td>{pc(metric(r.agg, 'hard', 0).v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={note}>Rates on a few pitches swing a lot: the Thrown column is the count behind each row.</p>
              </div>

              <div className="h2-span3" style={tile}>
                <div style={kick}>Every plate appearance · {shown.length}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {shown.map(p => (
                    <div key={p.key}>
                      <button type="button" className="h2-pa" onClick={() => setOpen(open === p.key ? null : p.key)} aria-expanded={open === p.key}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ width: 92, fontWeight: 800, fontSize: 13 }}>{p.date}</span>
                          <span style={{ width: 70, fontSize: 12, color: C.mute }}>{p.inning != null ? `Inning ${p.inning}` : ''}</span>
                          <span style={{ width: 90, fontSize: 12, color: C.mute }}>{p.runners}</span>
                          <span style={{ display: 'inline-flex', gap: 4 }}>
                            {p.pitches.map((x, q) => <span key={q} title={`${log.pitchNames[x.pitchType] ?? x.pitchType} ${x.velo != null ? x.velo.toFixed(1) + ' mph' : ''} · ${x.balls}-${x.strikes} · ${resWord[resCode(x.description)] ?? x.description ?? ''}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 999, background: pitchColor(x.pitchType), color: '#fff', fontSize: 9, fontWeight: 800 }}>{resCode(x.description)}</span>)}
                          </span>
                          <b style={{ marginLeft: 'auto', fontSize: 14, color: p.kind === 'hit' || p.kind === 'hr' ? '#D4533B' : p.kind === 'k' ? '#1D2D5C' : C.ink }}>{p.text}</b>
                        </div>
                      </button>
                      {open === p.key && (
                        <div style={{ overflowX: 'auto', padding: '6px 4px 2px' }}>
                          <table className="h2-tbl" style={{ minWidth: 520 }}>
                            <thead><tr><th>#</th><th>Count</th><th>Pitch</th><th>Velo</th><th>Zone</th><th>Result</th><th>Exit speed</th></tr></thead>
                            <tbody>
                              {p.pitches.map((x, q) => (
                                <tr key={q}>
                                  <td>{q + 1}</td><td>{x.balls}-{x.strikes}</td>
                                  <td style={{ fontWeight: 800 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: pitchColor(x.pitchType) }} />{log.pitchNames[x.pitchType] ?? x.pitchType}</span></td>
                                  <td>{x.velo != null ? x.velo.toFixed(1) : '—'}</td>
                                  <td>{x.zone ? (Number(x.zone) <= 9 ? `Zone ${x.zone}` : `Corner ${x.zone}`) : '—'}</td>
                                  <td>{resWord[resCode(x.description)] ?? x.description ?? '—'}{q === p.pitches.length - 1 && p.event ? ` · ${label(p.event)}` : ''}</td>
                                  <td>{x.exitVelo != null ? `${x.exitVelo.toFixed(1)} mph` : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p style={note}>Each dot is a pitch, coloured by type and marked with how it turned out (B ball, CS called strike, SS swinging strike, F foul, IP in play). Click a plate appearance for the pitch-by-pitch.</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

