'use client'

// src/components/scout/lab/ClubLab.tsx
//
// Scout Report → Club, form & park, in the lab layout. A selector down the left: club pills, the club's availability, its form, tonight's park, then every player who is not fully
// available. The choice opens in tiles:
//   Availability   who is available, questionable or out (MLB, Triple-A, Double-A), the roster makeup and the last 7 days of moves
//   Form           the last 7, 15 and 30 games against the season, a plain read, and the trend explorer for any offensive stat
//   The park       Statcast park factors for tonight's venue by index, session and batter hand
//   A player       his status and reason, when he last played, and who he is
// Questionable is derived, not reported (the rule is printed on the page). Everything is a count of what has happened; nothing here is a prediction.

import { useState } from 'react'
import { Headshot, TeamMark } from '@/components/home/Logo'
import { C, SANS } from '@/components/team/ui'
import type { Archetype, Makeup } from '@/lib/scout/roster-profile'
import type { TrendVerdict, TrendWindow } from '@/lib/scout/team-trends'
import type { ExplorerClub, ExplorerStat } from '@/lib/scout/stat-explorer'
import type { ParkDeep, ParkIndexes, Session } from '@/lib/scout/park-deep'
import { Pills, kick, note, star, tile } from '@/components/pitching-lab/LocationExplorer'
import { CHART_BLUE, CHART_ORANGE } from '../charts/LineChart'
import { CenteredRadar } from '../charts/Radar'
import StatExplorer from '../StatExplorer'

type Status = 'available' | 'questionable' | 'out'
export type PersonCard = {
  id: number; name: string; pos: string; tag: 'SP' | 'RP' | null; group: 'hitter' | 'pitcher'; status: Status; reason: string | null; restDays: number | null; lastPlayed: string | null; lastLine: string | null; outSince: string | null
  age: number | null; country: string | null; drafted: boolean; draftYear: number | null; draftRound: string | null; bats: 'L' | 'R' | 'S' | null; throws: 'L' | 'R' | null; archetype: Archetype | null
  hit: { pa: number; iso: number | null; hr: number; sb: number; kPct: number | null } | null; contractThrough: number | null
}
export type ClubDeskSide = {
  club: { id: number; abbr: string; name: string }; logo: string
  status: { counts: Record<Status, number>; omittedStarters: number; lineupConfirmed: boolean; transactions: { id: number | string; date: string; name: string; category: string; injury: string | null; effect: 'added' | 'removed' | 'other' }[] } | null
  people: Record<number, PersonCard>
  makeup: Makeup | null; contractsLoaded: boolean
  trend: { l7: TrendWindow; l15: TrendWindow; l30: TrendWindow; seasonXwoba: number | null; seasonWoba: number | null; verdict: TrendVerdict } | null
  explorer: ExplorerClub | null
  minors: Record<string, { label: string; node: React.ReactNode }>
}
type Subject = 'avail' | 'form' | 'park' | `p:${number}`
const SYM: Record<Status, string> = { available: '●', questionable: '▲', out: '■' }
const COL: Record<Status, string> = { available: '#1D9E75', questionable: '#c98a00', out: '#8a8275' }
const WORD: Record<Status, string> = { available: 'Available', questionable: 'Questionable', out: 'Out' }
const CAT: Record<string, string> = { IL: 'Placed on IL', ACTIVATION: 'Activated', CALLUP: 'Called up', OPTION: 'Optioned', DFA: 'Designated for assignment', RELEASE: 'Released', OUTRIGHTED: 'Outrighted', TRADE: 'Traded', SIGNING: 'Signed', SUSPENSION: 'Suspended' }
const ARCH: Record<string, string> = { power: 'Power', balanced: 'Balanced', smallball: 'Small ball', few: 'Too few PA to type' }
const dt: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: C.faint, textTransform: 'uppercase' }
const sd = (iso: string | null) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '')
const f3 = (v: number | null) => (v == null ? '—' : v.toFixed(3).replace(/^0\./, '.'))
const ord = (n: number) => { const v = n % 100; return v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th' }
const rank = { out: 0, questionable: 1, available: 2 }
const surname = (n: string) => n.trim().split(/\s+/).slice(-1)[0]
const lastText = (p: PersonCard) => (p.status === 'out' ? (p.outSince ? `out since ${sd(p.outSince)}` : 'out') : p.lastPlayed ? `last played ${sd(p.lastPlayed)}${p.restDays ? ` · ${p.restDays}d rest` : ''}` : 'no game in the window')
const TONE: Record<TrendVerdict['tone'], string> = { up: C.good, down: C.bad, lucky: '#c98a00', unlucky: '#c98a00', even: C.mute, thin: C.mute }

function Split({ label, parts, n }: { label: string; parts: { l: string; v: number; c: string }[]; n: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}><span>{label}</span><span style={{ fontWeight: 600, color: C.mute }}>{parts.map(p => `${p.l} ${p.v}`).join(' · ')}</span></div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 3, gap: 2 }}>{parts.map(p => <span key={p.l} style={{ width: `${n > 0 ? (p.v / n) * 100 : 0}%`, background: p.c }} />)}</div>
    </div>
  )
}

function IndexRow({ label, v, n, sub }: { label: string; v: number; n?: string; sub?: string }) {
  const dev = Math.max(-30, Math.min(30, v - 100)), w = (Math.abs(dev) / 30) * 50
  return (
    <div title={n}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: 800 }}><span>{label}</span><span style={{ fontWeight: 600, color: C.mute, fontVariantNumeric: 'tabular-nums' }}>{v}{sub ? ` · ${sub}` : ''}{n ? ` · ${n}` : ''}</span></div>
      <div style={{ position: 'relative', height: 11, background: C.soft, borderRadius: 6, marginTop: 3 }}>
        <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#a89e8c' }} />
        <span style={{ position: 'absolute', top: 0, bottom: 0, left: dev >= 0 ? '50%' : `${50 - w}%`, width: `${Math.max(w, 0.8)}%`, background: dev >= 0 ? C.orange : '#6CABDD', borderRadius: 6 }} />
      </div>
    </div>
  )
}

export default function ClubLab({ clubs, park, parkExtra, venueName, dayNight, isPro, stats, tiles, minVerdictPa, rules }: {
  clubs: { away: ClubDeskSide; home: ClubDeskSide }; park: ParkDeep | null; parkExtra: { altitude: number; dome: boolean } | null; venueName: string; dayNight: 'day' | 'night' | null; isPro: boolean
  stats: ExplorerStat[]; tiles: string[]; minVerdictPa: number; rules: { minTypePa: number; power: number; small: number; smallSb: number; smallK: number }
}) {
  const [side, setSide] = useState<'away' | 'home'>('away')
  const [pick, setPick] = useState<Subject>('avail')
  const [level, setLevel] = useState('mlb')
  const k = clubs[side]
  const kind = pick.startsWith('p:') ? 'player' : pick
  const person = pick.startsWith('p:') ? k.people[Number(pick.slice(2))] : undefined
  const flagged = Object.values(k.people).filter(p => p.status !== 'available').sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
  const levels: [string, string][] = [['mlb', 'MLB club'], ...Object.entries(k.minors).map(([id, m]) => [id, m.label] as [string, string])]
  const m = k.makeup

  const card = (p: PersonCard) => (
    <button key={p.id} type="button" onClick={() => setPick(`p:${p.id}`)} title={`${p.name}: ${WORD[p.status]}${p.reason ? ` (${p.reason})` : ''}`} style={{ display: 'flex', gap: 8, alignItems: 'center', textAlign: 'left', border: `1px solid ${p.status === 'available' ? C.line : COL[p.status]}`, borderRadius: 10, padding: '6px 8px', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: p.status === 'out' ? 0.7 : 1 }}>
      <Headshot id={p.id} name={p.name} size={32} />
      <span style={{ minWidth: 0, fontSize: 12.5, fontWeight: 800, color: C.ink }}><span style={{ color: COL[p.status] }}>{SYM[p.status]}</span> {surname(p.name)}<small style={{ display: 'block', fontWeight: 600, color: C.mute, fontSize: 11 }}>{p.tag ?? p.pos} · {lastText(p)}</small>{p.lastLine && p.status !== 'out' && <small style={{ display: 'block', fontWeight: 600, color: C.faint, fontSize: 11 }}>{p.lastLine}</small>}</span>
    </button>
  )
  const grid = (ps: PersonCard[]) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 8, marginTop: 8 }}>{[...ps].sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name)).map(card)}</div>

  const sessions = (['Day', 'Night', 'Roof Closed'] as Session[]).filter(s => park?.bySession[s])
  const tonight: Session | null = dayNight === 'day' ? 'Day' : dayNight === 'night' ? 'Night' : null
  const all = park?.bySession.All as ParkIndexes | undefined
  const verdictW = (w: TrendWindow) => w.pa > 0 && w.pa < minVerdictPa

  return (
    <div className="cl-grid">
      <style>{`.cl-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:24px;align-items:start}.cl-side{position:sticky;top:64px;display:flex;flex-direction:column;gap:6px}.cl-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:7px 10px;border-radius:12px;border:1px solid #e7e2d8;background:#fff;cursor:pointer;font-weight:800;font-size:13px;color:#1A1A1A;font-family:inherit}.cl-btn small{display:block;font-weight:600;font-size:11.5px;color:#8a8275}.cl-btn.on{border-color:#FF5722;background:#fff1ea}.cl-h{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#a89e8c;margin:8px 2px 0}.cl-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:stretch}.cl-span2{grid-column:span 2}.cl-span3{grid-column:1 / -1}.cl-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.cl-tbl th{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#a89e8c;text-align:center;padding:6px 8px;border-bottom:1px solid #e7e2d8}.cl-tbl th:first-child,.cl-tbl td:first-child{text-align:left}.cl-tbl td{text-align:center;padding:7px 8px;border-top:1px solid #f1eee6}@media (max-width:1180px){.cl-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:860px){.cl-grid{grid-template-columns:minmax(0,1fr)}.cl-side{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.cl-h{display:none}.cl-btn{width:auto;white-space:nowrap}.cl-tiles{grid-template-columns:minmax(0,1fr)}.cl-span2{grid-column:auto}}`}</style>

      <nav className="cl-side" aria-label="Club subjects">
        <Pills items={[['away', clubs.away.club.abbr], ['home', clubs.home.club.abbr]] as ['away' | 'home', string][]} value={side} onChange={v => { setSide(v); if (pick.startsWith('p:')) setPick('avail') }} />
        <button type="button" className={`cl-btn${pick === 'avail' ? ' on' : ''}`} onClick={() => setPick('avail')}><TeamMark id={k.club.id} abbr={k.club.abbr} size={28} /><span style={{ minWidth: 0 }}>Availability<small>{k.status ? `${k.status.counts.available} available · ${k.status.counts.questionable} questionable · ${k.status.counts.out} out` : 'Roster status'}</small></span></button>
        <button type="button" className={`cl-btn${pick === 'form' ? ' on' : ''}`} onClick={() => setPick('form')}><span style={{ width: 28, textAlign: 'center', fontSize: 16 }}>↗</span><span style={{ minWidth: 0 }}>Form<small>Last 7, 15 and 30 games</small></span></button>
        <button type="button" className={`cl-btn${pick === 'park' ? ' on' : ''}`} onClick={() => setPick('park')}><span style={{ width: 28, textAlign: 'center', fontSize: 16 }}>⌂</span><span style={{ minWidth: 0 }}>The park<small>{venueName}</small></span></button>
        <div className="cl-h">Not fully available</div>
        {flagged.length === 0 && <p style={{ ...note, margin: '0 2px' }}>Everyone on the list is available.</p>}
        {flagged.map(p => (
          <button key={p.id} type="button" className={`cl-btn${pick === `p:${p.id}` ? ' on' : ''}`} onClick={() => setPick(`p:${p.id}`)}>
            <Headshot id={p.id} name={p.name} size={32} />
            <span style={{ minWidth: 0 }}><span style={{ color: COL[p.status] }}>{SYM[p.status]}</span> {p.name}<small>{p.reason ?? WORD[p.status]}</small></span>
          </button>
        ))}
      </nav>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: SANS }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {person ? <Headshot id={person.id} name={person.name} size={52} /> : <TeamMark id={k.club.id} abbr={k.club.abbr} size={44} />}
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em' }}>{person ? person.name : kind === 'park' ? venueName : k.club.name}</h2>
          <span style={{ fontSize: 15, color: '#5b5347' }}>{person ? `${k.club.abbr} · ${person.tag ?? person.pos}` : kind === 'form' ? 'Form against the season' : kind === 'park' ? 'Tonight’s park' : 'Availability'}</span>
        </div>

        {/* ── availability ── */}
        {kind === 'avail' && (
          <>
            <Pills items={levels} value={level} onChange={setLevel} />
            {Object.entries(k.minors).map(([id, mm]) => <div key={id} style={{ display: level === id ? 'block' : 'none' }}>{mm.node}</div>)}
            {level === 'mlb' && (!k.status ? <p style={{ fontSize: 14, color: C.mute }}>Roster status is unavailable right now.</p> : (
              <div className="cl-tiles">
                <div style={tile}>
                  <div style={kick}>Tonight</div>
                  <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, margin: '12px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                    {(['available', 'questionable', 'out'] as Status[]).map(s => <div key={s}><dt style={dt}><span style={{ color: COL[s] }}>{SYM[s]}</span> {WORD[s]}</dt><dd style={{ margin: 0, fontSize: 30, fontWeight: 800, color: COL[s] }}>{k.status!.counts[s]}</dd></div>)}
                  </dl>
                  <p style={note}>{k.status.lineupConfirmed ? 'Lineup confirmed.' : 'Lineup not confirmed yet.'}{k.status.omittedStarters > 0 ? ` ${k.status.omittedStarters} other starters are not shown: not available tonight.` : ''}</p>
                </div>
                <div className="cl-span2" style={tile}>
                  <div style={kick}>Roster moves · last 7 days</div>
                  {k.status.transactions.length === 0 ? <p style={note}>No roster moves in the last 7 days.</p> : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                      {k.status.transactions.map(t => <li key={t.id} style={{ display: 'flex', gap: 8 }}><span style={{ color: C.faint, width: 38, flexShrink: 0 }}>{sd(t.date)}</span><span aria-hidden style={{ color: C.mute }}>{t.effect === 'added' ? '↑' : t.effect === 'removed' ? '↓' : '·'}</span><span><b>{t.name}</b> · {CAT[t.category] ?? t.category}{t.injury ? ` (${t.injury})` : ''}</span></li>)}
                    </ul>
                  )}
                </div>
                <div className="cl-span3" style={tile}>
                  <div style={kick}>Position players</div>
                  {grid(Object.values(k.people).filter(p => p.group === 'hitter'))}
                </div>
                <div className="cl-span3" style={tile}>
                  <div style={kick}>Pitchers · the probable starter and the bullpen</div>
                  {grid(Object.values(k.people).filter(p => p.group === 'pitcher'))}
                </div>
                {m && m.hitters + m.pitchers > 0 && (
                  <>
                    <div style={tile}>
                      <div style={kick}>Lefties and righties</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                        <Split label="Hitters bat" n={m.hitters} parts={[{ l: 'Left', v: m.bats.L, c: CHART_BLUE }, { l: 'Switch', v: m.bats.S, c: '#d6d3d1' }, { l: 'Right', v: m.bats.R, c: CHART_ORANGE }]} />
                        <Split label="Pitchers throw" n={m.pitchers} parts={[{ l: 'Left', v: m.throws.L, c: CHART_BLUE }, { l: 'Right', v: m.throws.R, c: CHART_ORANGE }]} />
                      </div>
                      <p style={note}>Active roster: {m.hitters} hitters, {m.pitchers} pitchers.</p>
                    </div>
                    <div style={tile}>
                      <div style={kick}>Power and small ball</div>
                      <div style={{ marginTop: 10 }}><Split label="Hitter type" n={m.hitters - m.types.few.n} parts={[{ l: 'Power', v: m.types.power.n, c: CHART_BLUE }, { l: 'Balanced', v: m.types.balanced.n, c: '#d6d3d1' }, { l: 'Small ball', v: m.types.smallball.n, c: CHART_ORANGE }]} /></div>
                      <p style={note}>Power: {m.types.power.names.map(surname).join(', ') || 'none'}. Small ball: {m.types.smallball.names.map(surname).join(', ') || 'none'}.{m.types.few.n > 0 && <> {star} {m.types.few.n} have under {rules.minTypePa} PA and are not typed.</>}</p>
                    </div>
                    <div style={tile}>
                      <div style={kick}>Age and origin</div>
                      <p style={{ margin: '8px 0 0', fontSize: 13, color: '#3a352c', lineHeight: 1.55 }}>Average age: hitters <b>{m.avgAge.hitters != null ? m.avgAge.hitters.toFixed(1) : '—'}</b>, pitchers <b>{m.avgAge.pitchers != null ? m.avgAge.pitchers.toFixed(1) : '—'}</b>. <b>{m.drafted}</b> drafted by {k.club.abbr}; <b>{m.foreign}</b> born outside the U.S. {m.ages.map(a => `${a.label}: ${a.n}`).join(' · ')}.</p>
                      <p style={note}>{k.contractsLoaded ? (m.expiring.length ? `Contracts ending this season: ${m.expiring.map(e => surname(e.name)).join(', ')}.` : 'No contracts ending this season are flagged on the active roster.') : 'Contract data is not loaded, so no expiring deals are flagged.'}</p>
                    </div>
                    <p className="cl-span3" style={{ ...note, margin: 0 }}>Hitter type is from his season line and needs {rules.minTypePa}+ PA: power = isolated power of {rules.power.toFixed(3).slice(1)} or better; small ball = under {rules.small.toFixed(3).slice(1)} with {rules.smallSb}+ steals or a strikeout rate of {rules.smallK}% or lower; balanced = the rest.</p>
                  </>
                )}
              </div>
            ))}
            <div style={{ ...tile, display: level === 'mlb' ? 'block' : 'none' }}>
              <div style={kick}>Key</div>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#3a352c', lineHeight: 1.6 }}>
                <span style={{ color: COL.available }}>●</span> Available · <span style={{ color: COL.questionable }}>▲</span> Questionable · <span style={{ color: COL.out }}>■</span> Out. Out = injured list, development list or suspended per the MLB roster. Questionable is derived, not reported: back from the IL within 5 days, a regular (5+ of the last 7 starts) missing from a posted lineup, an arm with a heavy recent workload, or a player on a rehab assignment. Last-played dates look back over the last 7 games. Click any tile for the player.
              </p>
            </div>
          </>
        )}

        {/* ── a player ── */}
        {person && (
          <div className="cl-tiles">
            <div style={tile}>
              <div style={kick}>Status</div>
              <p style={{ margin: '10px 0 0', fontSize: 30, fontWeight: 800, color: COL[person.status] }}>{SYM[person.status]} {WORD[person.status]}</p>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#3a352c' }}>{person.reason ?? (person.status === 'available' ? 'No flag.' : '')}</p>
              <p style={note}>{lastText(person)}{person.lastLine && person.status !== 'out' ? ` · ${person.lastLine}` : ''}</p>
            </div>
            <div style={tile}>
              <div style={kick}>Who he is</div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px 8px', margin: '12px 0 0' }}>
                {([['Age', person.age != null ? String(person.age) : '—'], ['Born', person.country ?? '—'], [person.group === 'hitter' ? 'Bats' : 'Throws', (person.group === 'hitter' ? person.bats : person.throws) ?? '—'], ['Contract', person.contractThrough ? `through ${person.contractThrough}` : '—']] as [string, string][]).map(([a, b]) => <div key={a}><dt style={dt}>{a}</dt><dd style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{b}</dd></div>)}
              </dl>
              {person.drafted && <p style={note}>Drafted by {k.club.abbr}{person.draftYear ? ` in ${person.draftYear}` : ''}{person.draftRound ? `, round ${person.draftRound}` : ''}.</p>}
            </div>
            {person.hit && (
              <div style={tile}>
                <div style={kick}>Hitter type</div>
                <p style={{ margin: '10px 0 0', fontSize: 24, fontWeight: 800 }}>{person.archetype ? ARCH[person.archetype] : '—'}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#5b5347' }}>ISO {f3(person.hit.iso)} · {person.hit.hr} HR · {person.hit.sb} SB · K {person.hit.kPct != null ? `${person.hit.kPct.toFixed(0)}%` : '—'}</p>
                <p style={note}>{person.hit.pa} PA{person.hit.pa < rules.minTypePa && <> {star} under {rules.minTypePa}: not typed</>}.</p>
              </div>
            )}
          </div>
        )}

        {/* ── form ── */}
        {kind === 'form' && (
          !k.trend ? <p style={{ fontSize: 14, color: C.mute }}>Statcast trend data is unavailable for {k.club.abbr} right now.</p> : (
            <div className="cl-tiles">
              <div style={tile}>
                <div style={kick}>The read</div>
                <p style={{ margin: '10px 0 0', fontSize: 20, fontWeight: 800, color: TONE[k.trend.verdict.tone] }}>{k.trend.verdict.label}</p>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#3a352c', lineHeight: 1.5 }}>{k.trend.verdict.detail}</p>
                <p style={note}>Expected wOBA (xwOBA) is what the contact deserved; wOBA is what happened. The gap between them is the luck. A read needs {minVerdictPa}+ PA.</p>
              </div>
              <div className="cl-span2" style={tile}>
                <div style={kick}>Against the season</div>
                <table className="cl-tbl" style={{ marginTop: 6 }}>
                  <thead><tr><th>Window</th><th>Games</th><th>xwOBA</th><th>wOBA</th><th>Barrel%</th><th>Hard-hit%</th><th>K–BB%</th><th>PA</th></tr></thead>
                  <tbody>
                    {([['Last 7', k.trend.l7], ['Last 15', k.trend.l15], ['Last 30', k.trend.l30]] as [string, TrendWindow][]).map(([l, w]) => (
                      <tr key={l}><td style={{ fontWeight: 800 }}>{l}</td><td>{w.games}</td><td>{f3(w.xwoba)}</td><td>{f3(w.woba)}</td><td>{w.barrelPct != null ? `${w.barrelPct.toFixed(1)}%` : '—'}</td><td>{w.hardHitPct != null ? `${w.hardHitPct.toFixed(1)}%` : '—'}</td><td>{w.kBbPct != null ? `${w.kBbPct.toFixed(1)}%` : '—'}</td><td>{w.pa}{verdictW(w) && star}</td></tr>
                    ))}
                    <tr style={{ color: C.mute }}><td style={{ fontWeight: 800 }}>Season</td><td>—</td><td>{f3(k.trend.seasonXwoba)}</td><td>{f3(k.trend.seasonWoba)}</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
                  </tbody>
                </table>
                <p style={note}>{star} marks a window under {minVerdictPa} PA.</p>
              </div>
              <div className="cl-span3" style={tile}>
                <div style={kick}>Choose any stat · both clubs</div>
                <div style={{ marginTop: 8 }}>
                  <StatExplorer stats={stats} clubs={[clubs.away.explorer, clubs.home.explorer]}
                    meta={[{ name: clubs.away.club.name, abbr: clubs.away.club.abbr, side: 'Away', logo: clubs.away.logo }, { name: clubs.home.club.name, abbr: clubs.home.club.abbr, side: 'Home', logo: clubs.home.logo }]}
                    tiles={tiles} defaultStat="xwoba" defaultWindow={7} sampleUnit="PA" gameUnit="games" isPro={isPro} flagPrompt="Choose a player or a starter faced…" />
                </div>
                <p style={note}>Regular season. The dashed line is the season figure where one is published; otherwise it is the average of the games shown, and the chart says so. Every window shows the sample behind it.</p>
              </div>
            </div>
          )
        )}

        {/* ── the park ── */}
        {kind === 'park' && (
          !park || !all ? <p style={{ fontSize: 14, color: C.mute }}>Statcast park factors are unavailable for {venueName} right now.</p> : (
            <div className="cl-tiles">
              <div className="cl-span3" style={tile}>
                <div style={kick}>{park.venueName} · {park.years} rolling</div>
                <p style={{ margin: '8px 0 0', fontSize: 14, color: '#3a352c', lineHeight: 1.55 }}>
                  Runs play {all.runs === 100 ? 'at the league average' : `${Math.abs(all.runs - 100)}% ${all.runs > 100 ? 'above' : 'below'} average`}{park.rank ? ` (${park.rank.runs}${ord(park.rank.runs)} of ${park.rank.of})` : ''}; home runs {all.hr === 100 ? 'at average' : `${Math.abs(all.hr - 100)}% ${all.hr > 100 ? 'above' : 'below'}`}{park.rank ? ` (${park.rank.hr}${ord(park.rank.hr)})` : ''}; wOBA {all.woba === 100 ? 'at average' : `${Math.abs(all.woba - 100)}% ${all.woba > 100 ? 'above' : 'below'}`}.
                  {tonight && park.bySession[tonight] ? ` Tonight is a ${tonight.toLowerCase()} game: ${tonight.toLowerCase()} sessions here run ${park.bySession[tonight]!.runs} for runs and ${park.bySession[tonight]!.hr} for home runs.` : ''}
                  {parkExtra && (parkExtra.altitude > 1000 || parkExtra.dome) ? ` ${parkExtra.altitude > 1000 ? `Altitude ${parkExtra.altitude.toLocaleString()} ft.` : ''}${parkExtra.dome ? ' Domed or roofed park.' : ''}` : ''}
                </p>
              </div>
              <div style={tile}>
                <div style={kick}>Park shape</div>
                <CenteredRadar ariaLabel={`${park.venueName} park factor radar`} axes={[{ label: 'Runs', value: all.runs }, { label: 'HR', value: all.hr }, { label: 'wOBA', value: all.woba }, { label: 'Hard-hit', value: all.hardhit }, { label: '1B', value: all.h1b }, { label: '2B', value: all.h2b }, { label: '3B', value: all.h3b }, { label: 'BB', value: all.bb }, { label: 'K', value: all.so }]} />
                <p style={note}>Dashed ring = league average (100). A spoke outside the ring is above average, inside is below. K is above 100 when the park produces more strikeouts.</p>
              </div>
              <div style={tile}>
                <div style={kick}>All sessions · {all.pa.toLocaleString()} PA</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
                  {([['Runs', all.runs], ['Home runs', all.hr], ['wOBA', all.woba], ['Hard-hit', all.hardhit], ['Singles', all.h1b], ['Doubles', all.h2b], ['Triples', all.h3b], ['Strikeouts', all.so], ['Walks', all.bb]] as [string, number][]).map(([l, v]) => <IndexRow key={l} label={l} v={v} />)}
                </div>
                <p style={note}>100 = an average park. Orange to the right = more of it, blue to the left = less. Not good or bad: direction. For strikeouts, right means more strikeouts.</p>
              </div>
              <div style={tile}>
                <div style={kick}>By session</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                  {([['Runs', (i: ParkIndexes) => i.runs], ['Home runs', (i: ParkIndexes) => i.hr], ['wOBA', (i: ParkIndexes) => i.woba]] as [string, (i: ParkIndexes) => number][]).map(([t, f]) => (
                    <div key={t}>
                      <div style={{ ...dt, marginBottom: 4 }}>{t}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{sessions.map(s => <IndexRow key={s} label={`${s === 'Roof Closed' ? 'Roof closed' : s}${s === tonight ? ' · tonight' : ''}`} v={f(park.bySession[s] as ParkIndexes)} n={`${(park.bySession[s] as ParkIndexes).pa.toLocaleString()} PA`} />)}</div>
                    </div>
                  ))}
                </div>
              </div>
              {park.byHand.L && park.byHand.R && (
                <div style={tile}>
                  <div style={kick}>By batter hand</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                    {([['Home runs', (i: ParkIndexes) => i.hr], ['wOBA', (i: ParkIndexes) => i.woba]] as [string, (i: ParkIndexes) => number][]).map(([t, f]) => (
                      <div key={t}><div style={{ ...dt, marginBottom: 4 }}>{t}</div><div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><IndexRow label="Left-handed batters" v={f(park.byHand.L!)} /><IndexRow label="Right-handed batters" v={f(park.byHand.R!)} /></div></div>
                    ))}
                  </div>
                </div>
              )}
              <p className="cl-span3" style={{ ...note, margin: 0 }}>Statcast park factors, {park.years} rolling (three seasons, so one hot month does not move it). FanGraphs builds its own factors with a different method and window, so the numbers will not match one for one. Bars are capped at ±30. {sessions.includes('Roof Closed') ? 'Roof-closed figures include only games with the roof shut.' : 'This park has no roof-closed sample.'}</p>
            </div>
          )
        )}

        <p style={{ ...note, margin: 0 }}>Sources: the MLB roster and transactions feeds, Statcast, and the MLB Stats API. {star} marks a small sample. This describes what has happened; it is not a prediction.</p>
      </div>
    </div>
  )
}
