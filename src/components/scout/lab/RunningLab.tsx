'use client'

// src/components/scout/lab/RunningLab.tsx
//
// Scout Report → Base running, in the lab layout. One OFFENSE at a time (club pills) running against the other club's battery. A selector down the left: the running game, the
// club's runners, then the catcher and the probable starter it will face. The club has two views:
//   Steals            attempts a game and success against the league, by base, count, outs and score, who was at the plate, and the attempts against the defense
//   Runners vs battery  the lineup's speed and leads in one grid, next to the catcher's pop time and the starter's record holding runners
// A runner opens to his speed (sprint speed, the 90 ft time), his leads (primary and secondary, in feet), his steals and the runs on extra bases.
// The catcher opens to pop time, exchange and arm strength against every qualified catcher. The starter opens to the steals, caught stealings and pickoffs on his record and the leads
// runners take against him. Leads are Statcast's measure for a runner on first: primary = before the pitch, secondary = as the ball is delivered.
// Everything is a count or a measurement of what has happened; none of it is a steal probability.

import { useState } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import { C, SANS } from '@/components/team/ui'
import type { RunBoards } from '@/lib/scout/run-lab'
import type { RunGame, Strip } from '@/lib/scout/run-game'
import type { SbSituations, Situations, Tally } from '@/lib/scout/situations'
import { BLUE, NEUTRAL, Pills, RED, kick, mix, note, star, tile } from '@/components/pitching-lab/LocationExplorer'

export type RunSide = {
  club: { id: number; abbr: string; name: string }
  def: { id: number; abbr: string; name: string; probableName: string | null }
  rg: RunGame | null; sit: SbSituations | null; against: Situations | null; boards: RunBoards | null; sprintField: number[]
}
type View = 'steals' | 'battery'
const VIEWS: [View, string][] = [['steals', 'Steals'], ['battery', 'Runners vs pitcher and catcher']]
const dt: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }
const pc = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null)
const fp = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(0)}%`)
const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1))
const f2 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))
const sg = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}`)
const rc = (v: number | null | undefined) => (v == null ? C.mute : v > 0 ? C.good : v < 0 ? C.bad : C.ink)
const ord = (n: number) => { const v = n % 100; return v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th' }

function Big({ k, v, sub, color }: { k: string; v: string; sub?: string; color?: string }) {
  return <div><div style={dt}>{k}</div><div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color }}>{v}</div>{sub && <div style={{ fontSize: 12, color: C.mute }}>{sub}</div>}</div>
}

/** One measurement against the league: the grey band is the middle half of the field, the tick is the league average, the dot is him. */
function Gauge({ label, value, unit, lo, hi, avg, betterLow, decimals = 1, sub, thin }: { label: string; value: number | null; unit: string; lo: number; hi: number; avg: number | null; betterLow?: boolean; decimals?: number; sub?: string; thin?: boolean }) {
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo || 1)) * 100))}%`
  const good = value != null && avg != null ? (betterLow ? value < avg : value > avg) : null
  return (
    <div style={{ opacity: thin ? 0.55 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 800 }}>
        <span>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{value != null ? value.toFixed(decimals) : '—'} {unit}{thin && star}</span>
      </div>
      <div style={{ position: 'relative', height: 12, background: C.soft, borderRadius: 6, marginTop: 4 }}>
        {avg != null && <span title={`League average ${avg.toFixed(decimals)}`} style={{ position: 'absolute', left: at(avg), top: -2, bottom: -2, width: 2, background: C.ink }} />}
        {value != null && <span style={{ position: 'absolute', left: at(value), top: 0, transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: 999, background: good == null ? C.orange : good ? C.good : C.bad, border: '2px solid #fff', boxShadow: '0 0 0 1px #8a8275' }} />}
      </div>
      <div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>{sub ?? (avg != null ? `League average ${avg.toFixed(decimals)} ${unit}` : '')}</div>
    </div>
  )
}

function StripBar({ s }: { s: Strip }) {
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - s.lo) / (s.hi - s.lo || 1)) * 100))}%`
  const good = s.value != null ? (s.betterLow ? s.value < s.median : s.value > s.median) : null
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 800 }}>
        <span>{s.label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value != null ? s.value.toFixed(s.decimals) : '—'} {s.unit}{s.rank ? <span style={{ color: C.mute, fontWeight: 600 }}> · {s.rank}{ord(s.rank)} of {s.of}</span> : ''}</span>
      </div>
      <div style={{ position: 'relative', height: 12, background: C.soft, borderRadius: 6, marginTop: 4 }}>
        <span style={{ position: 'absolute', left: at(s.q1), width: `calc(${at(s.q3)} - ${at(s.q1)})`, top: 0, bottom: 0, background: '#e0dbcf', borderRadius: 6 }} />
        <span style={{ position: 'absolute', left: at(s.median), top: -2, bottom: -2, width: 2, background: C.ink }} />
        {s.value != null && <span style={{ position: 'absolute', left: at(s.value), top: 0, transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: 999, background: good ? C.good : C.bad, border: '2px solid #fff', boxShadow: '0 0 0 1px #8a8275' }} />}
      </div>
      <div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>Qualified catchers run {s.lo.toFixed(s.decimals)} to {s.hi.toFixed(s.decimals)}; shaded = the middle half, tick = the median. {s.betterLow ? 'Lower is better.' : 'Higher is better.'}</div>
    </div>
  )
}

function Tab({ rows, minSit }: { rows: { label: string; t: Tally; league?: Tally }[]; minSit: number }) {
  return (
    <table className="rn-tbl" style={{ marginTop: 6 }}>
      <thead><tr><th></th><th>Attempts</th><th>Safe</th><th>League</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.label} style={{ opacity: r.t.n > 0 && r.t.n < minSit ? 0.5 : 1 }}><td style={{ fontWeight: 800 }}>{r.label}</td><td>{r.t.n}{r.t.n > 0 && r.t.n < minSit && star}</td><td>{r.t.n ? fp(pc(r.t.ok, r.t.n)) : '—'}</td><td style={{ color: C.mute }}>{r.league && r.league.n ? fp(pc(r.league.ok, r.league.n)) : '—'}</td></tr>)}</tbody>
    </table>
  )
}

function CountGrid({ club, league, minSit }: { club: Situations; league: Situations; minSit: number }) {
  return (
    <table className="rn-tbl" style={{ marginTop: 6 }}>
      <thead><tr><th>Balls ↓ Strikes →</th>{[0, 1, 2].map(s => <th key={s}>{s}</th>)}</tr></thead>
      <tbody>
        {[0, 1, 2, 3].map(b => (
          <tr key={b}><td style={{ fontWeight: 800 }}>{b}</td>{[0, 1, 2].map(s => {
            const t = club.byCount[`${b}-${s}`], lg = league.byCount[`${b}-${s}`]
            const ok = t && t.n ? (t.ok / t.n) * 100 : null, lgv = lg && lg.n ? (lg.ok / lg.n) * 100 : null
            const d = ok != null && lgv != null && t.n >= minSit ? Math.max(-1, Math.min(1, (ok - lgv) / 30)) : 0
            return <td key={s} title={t ? `${t.n} attempts, ${t.ok} safe · league ${fp(lgv)}` : ''} style={{ background: t && t.n ? (d >= 0 ? mix(NEUTRAL, RED, d) : mix(NEUTRAL, BLUE, -d)) : undefined }}>{t && t.n ? <><b>{t.n}</b> <span style={{ color: C.mute, fontSize: 11 }}>{fp(ok)}</span></> : '—'}{t && t.n > 0 && t.n < minSit && star}</td>
          })}</tr>
        ))}
      </tbody>
      <caption style={{ captionSide: 'bottom', fontSize: 11, color: C.mute, textAlign: 'left', paddingTop: 4 }}>Each cell: attempts and the share safe. Red = safe more often than the league in that count, blue = less often. {star} marks fewer than {minSit}.</caption>
    </table>
  )
}

export default function RunningLab({ clubs, minAttempts, minSit, minLead }: { clubs: { away: RunSide; home: RunSide }; minAttempts: number; minSit: number; minLead: number }) {
  const [side, setSide] = useState<'away' | 'home'>('away')
  const [pick, setPick] = useState('club')
  const [view, setView] = useState<View>('steals')
  const k = clubs[side], rg = k.rg, sit = k.sit, bd = k.boards, lgb = bd?.league
  const kind = pick.startsWith('r:') ? 'runner' : pick === 'catcher' ? 'catcher' : pick === 'pitcher' ? 'pitcher' : 'club'
  const rid = kind === 'runner' ? pick.slice(2) : ''
  const runner = kind === 'runner' ? rg?.offense.runners.find(r => String(r.id) === rid) : undefined
  const cat = rg?.catcher, pit = rg?.pitcher
  const o = rg?.offense
  const field = k.sprintField
  const sprintRank = (v: number | null) => (v == null || field.length === 0 ? null : field.filter(x => x > v).length + 1)
  const pitB = pit ? bd?.pitcher[String(pit.id)] : undefined

  return (
    <div className="rn-grid">
      <style>{`.rn-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:24px;align-items:start}.rn-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.rn-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit}.rn-btn small{display:block;font-weight:600;font-size:11.5px;color:#8a8275}.rn-btn.on{border-color:#FF5722;background:#fff1ea}.rn-h{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a89e8c;margin:8px 2px 0}.rn-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.rn-span2{grid-column:span 2}.rn-span3{grid-column:1 / -1}.rn-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.rn-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8}.rn-tbl th:first-child,.rn-tbl td:first-child{text-align:left}.rn-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #f1eee6}@media (max-width:1180px){.rn-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.rn-grid{grid-template-columns:minmax(0,1fr)}.rn-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.rn-h{display:none}.rn-btn{width:auto;white-space:nowrap}.rn-tiles{grid-template-columns:minmax(0,1fr)}.rn-span2{grid-column:auto}}`}</style>

      <nav className="rn-side" aria-label="Base running subjects">
        <Pills items={[['away', `${clubs.away.club.abbr} running`], ['home', `${clubs.home.club.abbr} running`]] as ['away' | 'home', string][]} value={side} onChange={v => { setSide(v); setPick('club') }} />
        <button type="button" className={`rn-btn${kind === 'club' ? ' on' : ''}`} onClick={() => setPick('club')}><TeamMark id={k.club.id} abbr={k.club.abbr} size={28} /><span style={{ minWidth: 0 }}>The running game<small>vs the {k.def.abbr} pitcher and catcher</small></span></button>
        <div className="rn-h">Runners</div>
        {(o?.runners ?? []).length === 0 && <p style={{ ...note, margin: '0 2px' }}>No lineup is available yet.</p>}
        {(o?.runners ?? []).map(r => (
          <button key={r.id} type="button" className={`rn-btn${pick === `r:${r.id}` ? ' on' : ''}`} onClick={() => setPick(`r:${r.id}`)}>
            <Headshot id={r.id} name={r.name} size={32} />
            <span style={{ minWidth: 0 }}>{r.name}<small>{r.sprint != null ? `${r.sprint.toFixed(1)} ft/s · ` : ''}{r.sb} SB · {r.cs} CS</small></span>
          </button>
        ))}
        <div className="rn-h">The {k.def.abbr} pitcher and catcher</div>
        {cat ? <button type="button" className={`rn-btn${kind === 'catcher' ? ' on' : ''}`} onClick={() => setPick('catcher')}><Headshot id={cat.id} name={cat.name} size={32} /><span style={{ minWidth: 0 }}>{cat.name}<small>Catcher{cat.strips[0]?.value != null ? ` · pop ${cat.strips[0].value.toFixed(2)}s` : ''}</small></span></button> : <p style={{ ...note, margin: '0 2px' }}>No catcher in the lineup yet.</p>}
        {pit ? <button type="button" className={`rn-btn${kind === 'pitcher' ? ' on' : ''}`} onClick={() => setPick('pitcher')}><Headshot id={pit.id} name={pit.name} size={32} /><span style={{ minWidth: 0 }}>{pit.name}<small>Probable starter · {pit.throws ?? '?'}HP</small></span></button> : <p style={{ ...note, margin: '0 2px' }}>No probable starter yet.</p>}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {kind === 'club' && <TeamMark id={k.club.id} abbr={k.club.abbr} size={44} />}
          {runner && <Headshot id={runner.id} name={runner.name} size={52} />}
          {kind === 'catcher' && cat && <Headshot id={cat.id} name={cat.name} size={52} />}
          {kind === 'pitcher' && pit && <Headshot id={pit.id} name={pit.name} size={52} />}
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{runner?.name ?? (kind === 'catcher' ? cat?.name : kind === 'pitcher' ? pit?.name : `${k.club.name} running`)}</h2>
          <span style={{ fontSize: 15, color: '#5b5347' }}>{runner ? `${k.club.abbr} runner` : kind === 'catcher' ? `${k.def.abbr} catcher` : kind === 'pitcher' ? `${k.def.abbr} probable starter` : `Against the ${k.def.abbr} pitcher and catcher`}</span>
        </div>

        {kind === 'club' && <Pills items={VIEWS} value={view} onChange={setView} />}
        {kind === 'club' && !rg && <p style={{ fontSize: 14, color: C.mute }}>Running data is unavailable for {k.club.abbr} right now.</p>}

        {/* ── club: steals ── */}
        {kind === 'club' && o && view === 'steals' && (
          <div className="rn-tiles">
            <div style={tile}>
              <div style={kick}>Attempts a game</div>
              <p style={{ margin: '10px 0 0', fontSize: 38, fontWeight: 800, lineHeight: 1 }}>{f2(o.attemptsPerGame)}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5b5347' }}>League {f2(o.league.attemptsPerGame)} · {o.rank.attempts}{ord(o.rank.attempts)} most of {o.rank.of}</p>
              <p style={note}>{o.sb + o.cs} attempts in {o.games} games.</p>
            </div>
            <div style={tile}>
              <div style={kick}>Safe when they go</div>
              <p style={{ margin: '10px 0 0', fontSize: 38, fontWeight: 800, lineHeight: 1 }}>{fp(o.successPct)}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5b5347' }}>League {fp(o.league.successPct)}</p>
              <p style={note}>{o.sb} stolen, {o.cs} caught.{o.sb + o.cs < minAttempts && <> {star} Under {minAttempts} attempts.</>}</p>
            </div>
            <div style={tile}>
              <div style={kick}>Against the {k.def.abbr} defense</div>
              {k.against ? (
                <>
                  <p style={{ margin: '10px 0 0', fontSize: 38, fontWeight: 800, lineHeight: 1 }}>{fp(pc(k.against.total.ok, k.against.total.n))}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5b5347' }}>safe against them · {k.against.total.n} attempts</p>
                  <p style={note}>Every steal attempt against the {k.def.abbr} pitchers and catchers this season.</p>
                </>
              ) : <p style={note}>The steal log is not loaded yet.</p>}
            </div>
            {sit ? (
              <>
                <div style={tile}>
                  <div style={kick}>By base</div>
                  <Tab minSit={minSit} rows={[['2B', 'Second'], ['3B', 'Third'], ['HOME', 'Home']].map(([key, l]) => ({ label: l, t: sit.running.byKind[key] ?? { n: 0, ok: 0 }, league: sit.league.byKind[key] }))} />
                </div>
                <div className="rn-span2" style={tile}>
                  <div style={kick}>By count before the pitch</div>
                  <CountGrid club={sit.running} league={sit.league} minSit={minSit} />
                </div>
                <div style={tile}>
                  <div style={kick}>By outs</div>
                  <Tab minSit={minSit} rows={sit.running.byOuts.map((t, i) => ({ label: `${i} out${i === 1 ? '' : 's'}`, t, league: sit.league.byOuts[i] }))} />
                </div>
                <div style={tile}>
                  <div style={kick}>By score</div>
                  <Tab minSit={minSit} rows={([['trail3', 'Trailing by 3+'], ['trail12', 'Trailing by 1–2'], ['tied', 'Tied'], ['lead12', 'Leading by 1–2'], ['lead3', 'Leading by 3+']] as const).map(([key, l]) => ({ label: l, t: sit.running.byMargin[key], league: sit.league.byMargin[key] }))} />
                </div>
                <div style={tile}>
                  <div style={kick}>Who runs</div>
                  <Tab minSit={minSit} rows={sit.topRunners.map(r => ({ label: r.name, t: { n: r.n, ok: r.ok } }))} />
                </div>
                {sit.atBat && (
                  <div className="rn-span3" style={{ ...tile, overflowX: 'auto' }}>
                    <div style={kick}>Who was at the plate when they ran</div>
                    <table className="rn-tbl" style={{ marginTop: 6, minWidth: 420 }}>
                      <thead><tr><th>Hitter</th><th>Attempts</th><th>Safe</th><th title="Plate appearances that began with a runner on first and second open">Chances</th><th>Steal of 2nd</th></tr></thead>
                      <tbody>{sit.atBat.rows.slice(0, 10).map(r => <tr key={r.id}><td style={{ fontWeight: 800 }}>{r.name}</td><td>{r.attempts}</td><td>{fp(pc(r.ok, r.attempts))}</td><td>{r.opps}</td><td>{r.opps > 0 ? fp(pc(r.attempts2b, r.opps)) : '—'}{r.opps > 0 && r.opps < 15 && star}</td></tr>)}</tbody>
                    </table>
                    <p style={note}>Chances = plate appearances with a runner on first and second base open. Club rate of stealing second on those chances: {fp(sit.atBat.clubRate2b)}. {star} marks under 15 chances.</p>
                  </div>
                )}
                <p className="rn-span3" style={{ ...note, margin: 0 }}>Count is the count before the pitch the runner went on. Score is from the running club&apos;s side. Steal log through {sit.coveredThrough.slice(5).replace('-', '/')}. {star} marks fewer than {minSit} attempts.</p>
              </>
            ) : <div className="rn-span3" style={tile}><p style={note}>The steal-attempt log is not loaded yet.</p></div>}
          </div>
        )}

        {/* ── club: runners vs battery ── */}
        {kind === 'club' && rg && view === 'battery' && (
          <div className="rn-tiles">
            <div style={tile}>
              <div style={kick}>The catcher · {cat?.name ?? 'not in the lineup yet'}</div>
              {cat && cat.strips.length > 0 ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>{cat.strips.slice(0, 1).map(s => <StripBar key={s.label} s={s} />)}<p style={{ ...note, margin: 0 }}>{cat.sb} stolen, {cat.cs} caught on his record ({fp(pc(cat.cs, cat.sb + cat.cs))} caught; league {fp(rg.leagueCatcherCsPct)}). <button type="button" onClick={() => setPick('catcher')} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Full page →</button></p></div> : <p style={note}>{cat ? 'No pop-time record yet.' : 'The catcher is not known yet.'}</p>}
            </div>
            <div style={tile}>
              <div style={kick}>The starter · {pit?.name ?? 'not named yet'}</div>
              {pit ? (
                <>
                  <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                    {[['SB', pit.sb], ['CS', pit.cs], ['Pickoffs', pit.pickoffs]].map(([a, b]) => <div key={String(a)}><dt style={dt}>{a}</dt><dd style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{b}</dd></div>)}
                  </dl>
                  <p style={note}>{pit.throws ?? '?'}-handed, {pit.ip.toFixed(0)} innings. <button type="button" onClick={() => setPick('pitcher')} style={{ border: 0, background: 'none', color: C.orange, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Full page →</button></p>
                </>
              ) : <p style={note}>No probable starter yet.</p>}
            </div>
            <div style={tile}>
              <div style={kick}>What the grid shows</div>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#3a352c', lineHeight: 1.5 }}>Each runner&apos;s speed and leads next to his steal record. Primary lead is how far off first base he stands before the pitch; secondary is how far as the ball is delivered. Red = faster or a longer lead than the league average, blue = slower or shorter.</p>
            </div>
            <div className="rn-span3" style={{ ...tile, overflowX: 'auto' }}>
              <div style={kick}>{k.club.abbr} runners</div>
              <table className="rn-tbl" style={{ marginTop: 6, minWidth: 640 }}>
                <thead><tr><th>Runner</th><th title="Statcast sprint speed, feet per second">Sprint</th><th title="Seconds from contact to 90 feet">90 ft</th><th>Primary lead</th><th>Secondary lead</th><th>SB</th><th>CS</th><th>Runs stolen</th></tr></thead>
                <tbody>
                  {o?.runners.map(r => {
                    const b = bd?.runner[String(r.id)], s90 = bd?.split90[String(r.id)]
                    const heat = (v: number | null | undefined, avg: number | null | undefined, span: number, low?: boolean) => v == null || avg == null ? undefined : (() => { const d = Math.max(-1, Math.min(1, ((low ? avg - v : v - avg)) / span)); return d >= 0 ? mix(NEUTRAL, RED, d) : mix(NEUTRAL, BLUE, -d) })()
                    const enough = (b?.chances ?? 0) >= minLead
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 800, cursor: 'pointer' }} onClick={() => setPick(`r:${r.id}`)}>{r.name}</td>
                        <td style={{ background: heat(r.sprint, field.length ? field.reduce((a, c) => a + c, 0) / field.length : null, 2) }}>{r.sprint != null ? r.sprint.toFixed(1) : '—'}</td>
                        <td style={{ background: heat(s90, lgb?.split90, 0.15, true) }}>{s90 != null ? s90.toFixed(2) : '—'}</td>
                        <td style={{ background: enough ? heat(b?.primary, lgb?.primary, 1.5) : undefined }}>{f1(b?.primary)}{b && !enough && star}</td>
                        <td style={{ background: enough ? heat(b?.secondary, lgb?.secondary, 1.5) : undefined }}>{f1(b?.secondary)}{b && !enough && star}</td>
                        <td>{r.sb}</td><td>{r.cs}</td><td style={{ color: rc(b?.runs) }}>{sg(b?.runs, 1)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p style={note}>Sprint speed in feet a second; 90 ft = seconds from contact to 90 feet; leads in feet (league average {f1(lgb?.primary)} and {f1(lgb?.secondary)}). {star} on a lead = under {minLead} Statcast chances, shown but not shaded. Runs stolen = runs above average on the running act.</p>
            </div>
          </div>
        )}

        {/* ── a runner ── */}
        {runner && (
          <div className="rn-tiles">
            {(() => {
              const b = bd?.runner[rid], s90 = bd?.split90[rid], x = bd?.xb[rid]
              const rank = sprintRank(runner.sprint), enough = (b?.chances ?? 0) >= minLead
              const lo = field[0] ?? 22, hi = field[field.length - 1] ?? 31
              const avgSprint = field.length ? field.reduce((a, c) => a + c, 0) / field.length : null
              return (
                <>
                  <div style={tile}>
                    <div style={kick}>Speed</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
                      <Gauge label="Sprint speed" value={runner.sprint} unit="ft/s" lo={lo} hi={hi} avg={avgSprint} decimals={1} sub={rank ? `${rank}${ord(rank)} fastest of ${field.length} · league average ${avgSprint?.toFixed(1)}` : undefined} />
                      <Gauge label="Contact to 90 feet" value={s90 ?? null} unit="s" lo={3.7} hi={4.6} avg={lgb?.split90 ?? null} betterLow decimals={2} />
                    </div>
                    <p style={note}>Sprint speed is Statcast&apos;s feet a second in a runner&apos;s fastest one-second window. Green dot = better than the league average, red = worse.</p>
                  </div>
                  <div style={tile}>
                    <div style={kick}>Leads off first</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
                      <Gauge label="Primary lead" value={b?.primary ?? null} unit="ft" lo={8} hi={15} avg={lgb?.primary ?? null} thin={!!b && !enough} />
                      <Gauge label="Secondary lead" value={b?.secondary ?? null} unit="ft" lo={11} hi={19} avg={lgb?.secondary ?? null} thin={!!b && !enough} />
                    </div>
                    <p style={note}>{b ? <>{b.chances} Statcast chances.{!enough && <> {star} Under {minLead}: a small sample.</>}</> : 'No lead record yet.'} Primary = before the pitch, secondary = as the ball is delivered. A longer lead is not better or worse by itself; it shows what he does.</p>
                  </div>
                  <div style={tile}>
                    <div style={kick}>Steals</div>
                    <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                      <div><dt style={dt}>Stolen</dt><dd style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{b?.sb ?? runner.sb}</dd></div>
                      <div><dt style={dt}>Caught</dt><dd style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{b?.cs ?? runner.cs}</dd></div>
                      <div><dt style={dt}>Picked off</dt><dd style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{b?.pk ?? '—'}</dd></div>
                      <div><dt style={dt}>Runs stolen</dt><dd style={{ margin: 0, fontSize: 28, fontWeight: 800, color: rc(b?.runs) }}>{sg(b?.runs, 1)}</dd></div>
                    </dl>
                    <p style={note}>{(b?.sb ?? runner.sb) + (b?.cs ?? runner.cs) < minAttempts && <>{star} Under {minAttempts} attempts. </>}Safe on {fp(pc(b?.sb ?? runner.sb, (b?.sb ?? runner.sb) + (b?.cs ?? runner.cs)))} of attempts. Runs stolen = runs above average from the running act.</p>
                  </div>
                  <div className="rn-span3" style={tile}>
                    <div style={kick}>Taking the extra base</div>
                    {x ? (
                      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                        <div><dt style={dt}>Runs on extra bases</dt><dd style={{ margin: 0, fontSize: 26, fontWeight: 800, color: rc(x.runs) }}>{sg(x.runs, 1)}</dd></div>
                        <div><dt style={dt}>Chances</dt><dd style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{x.taken}{x.taken < 30 && star}</dd></div>
                        <div><dt style={dt}>Swipe</dt><dd style={{ margin: 0, fontSize: 26, fontWeight: 800, color: rc(x.swipe) }}>{sg(x.swipe, 1)}</dd></div>
                        <div><dt style={dt}>Snipe</dt><dd style={{ margin: 0, fontSize: 26, fontWeight: 800, color: rc(x.snipe) }}>{sg(x.snipe, 1)}</dd></div>
                        <div><dt style={dt}>Freeze</dt><dd style={{ margin: 0, fontSize: 26, fontWeight: 800, color: rc(x.freeze) }}>{sg(x.freeze, 1)}</dd></div>
                      </dl>
                    ) : <p style={note}>No extra-base record on the leaderboard yet.</p>}
                    <p style={note}>Runs above average from advancing on hits and outs: first to third, scoring from second, tagging up. Swipe, snipe and freeze are Statcast&apos;s names for the kinds of advance. {star} marks under 30 chances.</p>
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {/* ── the catcher ── */}
        {kind === 'catcher' && cat && (
          <div className="rn-tiles">
            <div className="rn-span2" style={tile}>
              <div style={kick}>Throwing to second</div>
              {cat.strips.length === 0 ? <p style={note}>No pop-time record yet.</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>{cat.strips.map(s => <StripBar key={s.label} s={s} />)}</div>}
              <p style={note}>{cat.popAttempts} throws to second.{cat.popAttempts < 10 && <> {star} Under 10: not ranked against the qualified field.</>} Pop time is from the pitch reaching the glove to the ball reaching second base; exchange is glove to release; arm strength is the throw&apos;s top speed.</p>
            </div>
            <div style={tile}>
              <div style={kick}>Runners against him</div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                <div><dt style={dt}>Stolen</dt><dd style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{cat.sb}</dd></div>
                <div><dt style={dt}>Caught</dt><dd style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{cat.cs}</dd></div>
              </dl>
              <p style={note}>He has caught {fp(pc(cat.cs, cat.sb + cat.cs))} of runners (league {fp(rg?.leagueCatcherCsPct)}). {cat.sb + cat.cs < minAttempts && <>{star} Under {minAttempts} attempts.</>}</p>
            </div>
            {cat.field.length > 0 && (
              <div className="rn-span3" style={tile}>
                <div style={kick}>Exchange against arm strength · every qualified catcher</div>
                <Scatter pts={cat.field} me={cat.id} />
                <p style={note}>Each dot is a catcher with 10+ throws to second. Quicker exchange (left) and a stronger arm (up) is the better corner. The orange dot is {cat.name}.</p>
              </div>
            )}
          </div>
        )}

        {/* ── the pitcher ── */}
        {kind === 'pitcher' && pit && (
          <div className="rn-tiles">
            <div style={tile}>
              <div style={kick}>Runners against him</div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                <div><dt style={dt}>Stolen</dt><dd style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{pit.sb}</dd></div>
                <div><dt style={dt}>Caught</dt><dd style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{pit.cs}</dd></div>
                <div><dt style={dt}>Pickoffs</dt><dd style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{pit.pickoffs}</dd></div>
                <div><dt style={dt}>Balks</dt><dd style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{pitB?.bk ?? '—'}</dd></div>
              </dl>
              <p style={note}>{pit.throws ?? '?'}-handed, {pit.ip.toFixed(0)} innings, {pit.bf} batters faced. {pit.sb + pit.cs < minAttempts && <>{star} Under {minAttempts} attempts.</>}</p>
            </div>
            <div style={tile}>
              <div style={kick}>Leads runners take against him</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
                <Gauge label="Primary lead" value={pitB?.primary ?? null} unit="ft" lo={9} hi={14} avg={lgb?.pPrimary ?? null} thin={!!pitB && pitB.chances < minLead} />
                <Gauge label="Secondary lead" value={pitB?.secondary ?? null} unit="ft" lo={12} hi={18} avg={lgb?.pSecondary ?? null} thin={!!pitB && pitB.chances < minLead} />
              </div>
              <p style={note}>{pitB ? <>{pitB.chances} Statcast chances.{pitB.chances < minLead && <> {star} Under {minLead}: a small sample.</>}</> : 'No lead record yet.'} Shorter leads (green) mean he holds runners closer.</p>
            </div>
            <div style={tile}>
              <div style={kick}>Runs prevented by holding runners</div>
              <p style={{ margin: '10px 0 0', fontSize: 38, fontWeight: 800, lineHeight: 1, color: rc(pitB?.runsPrevented) }}>{sg(pitB?.runsPrevented, 1)}</p>
              <p style={note}>Statcast runs above average prevented on the running game: steals and caught stealings, pickoffs, and how far runners lead. Green above zero.</p>
            </div>
          </div>
        )}

        <p style={{ ...note, margin: 0 }}>Sources: Statcast leaderboards (sprint speed, running splits, base-stealing and running-game run values, pop time), the MLB Stats API (steal records) and the MLB game feed (steal attempts by count, outs and score). These are descriptions of what has happened with the attempts behind them; they are not steal odds.</p>
      </div>
    </div>
  )
}

function Scatter({ pts, me }: { pts: { id: number; name: string; exchange: number; arm: number }[]; me: number }) {
  const W = 420, H = 280, P = 36
  const xs = pts.map(p => p.exchange), ys = pts.map(p => p.arm)
  const x0 = Math.min(...xs) - 0.02, x1 = Math.max(...xs) + 0.02, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1
  const sx = (v: number) => P + ((v - x0) / (x1 - x0 || 1)) * (W - P - 10), sy = (v: number) => H - P - ((v - y0) / (y1 - y0 || 1)) * (H - P - 10)
  const mine = pts.find(p => p.id === me)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 520, display: 'block', margin: '8px auto 0' }} role="img" aria-label="Exchange time against arm strength">
      <line x1={P} y1={H - P} x2={W - 10} y2={H - P} stroke="#e7e2d8" /><line x1={P} y1={10} x2={P} y2={H - P} stroke="#e7e2d8" />
      {pts.filter(p => p.id !== me).map(p => <circle key={p.id} cx={sx(p.exchange)} cy={sy(p.arm)} r={4} fill="#d6d0c2"><title>{`${p.name}: exchange ${p.exchange.toFixed(2)} s, arm ${p.arm.toFixed(1)} mph`}</title></circle>)}
      {mine && <circle cx={sx(mine.exchange)} cy={sy(mine.arm)} r={7} fill={C.orange} stroke="#fff" strokeWidth={2}><title>{`${mine.name}: exchange ${mine.exchange.toFixed(2)} s, arm ${mine.arm.toFixed(1)} mph`}</title></circle>}
      <text x={W / 2} y={H - 8} textAnchor="middle" fontSize={11} fill={C.faint}>exchange time, seconds (quicker to the left)</text>
      <text x={12} y={H / 2} fontSize={11} fill={C.faint} transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">arm strength, mph</text>
    </svg>
  )
}
