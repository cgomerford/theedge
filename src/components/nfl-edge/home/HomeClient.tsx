'use client'

// src/components/nfl-edge/home/HomeClient.tsx
//
// The interactive pieces of the NFL homepage. Each one mirrors its MLB twin in src/app/mlb/MLBHomepage.tsx
// (same markup, same class names / spacing / colours) so the two sport homepages look and feel identical:
//   NflTicker        <-> Ticker         card strip with a date bar (MLB: yesterday/today/tomorrow, NFL: last/this/next week)
//   LeaderPanel      <-> LeaderPanel    tabbed top-5 with headshots
//   TeamTable        <-> TeamLeaderboardTable  sortable all-32 table
//   Standings        <-> Standings      conference toggle + division blocks
// Plain-data props only. Sections use the shared `.nh-*` CSS defined once in NflHome.tsx.

import { useState } from 'react'
import Link from 'next/link'

const FONT = 'var(--font-outfit), system-ui, sans-serif'

export function Sec({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, color: '#FF5722', letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>§ {children}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(26,26,26,0.1)' }} />
    </div>
  )
}

/* ── ticker ────────────────────────────────────────────── */

export type TickerCard = {
  id: string
  slug: string
  away: { id: string; logo: string; rec: string }
  home: { id: string; logo: string; rec: string }
  awayScore: number | null
  homeScore: number | null
  phase: 'upcoming' | 'live' | 'awaiting' | 'final'
  label: string                 // kickoff time, "FINAL", or "UNDERWAY"
  lean: { kind: 'lean' | 'even' | 'pending'; text: string }
}
export type TickerWeekData = { key: 'prev' | 'this' | 'next'; label: string; week: number; cards: TickerCard[] }

export function NflTicker({ weeks }: { weeks: TickerWeekData[] }) {
  const [sel, setSel] = useState<'prev' | 'this' | 'next'>('this')
  const week = weeks.find(w => w.key === sel) ?? weeks.find(w => w.key === 'this') ?? weeks[0]
  const scroll = (dir: 'l' | 'r') => document.getElementById('ticker-scroll')?.scrollBy({ left: dir === 'r' ? 400 : -400, behavior: 'smooth' })

  return (
    <div className="ticker-outer">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', background: '#F5F1E8', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {weeks.map(w => (
            <button key={w.key} onClick={() => setSel(w.key)} style={{
              fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 10px', border: 'none', cursor: 'pointer',
              background: sel === w.key ? '#1A1A1A' : 'transparent', color: sel === w.key ? '#FAF8F3' : '#A3A3A3', transition: 'all 0.1s',
            }}>{w.label}{w.key !== 'this' ? ` · wk ${w.week}` : ''}</button>
          ))}
        </div>
        <span style={{ fontFamily: FONT, fontSize: 8, color: '#A3A3A3', letterSpacing: '0.04em' }}>Times in US/Eastern</span>
      </div>

      <button className="ticker-arrow left" onClick={() => scroll('l')} aria-label="Scroll left"><span style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>‹</span></button>
      <button className="ticker-arrow right" onClick={() => scroll('r')} aria-label="Scroll right"><span style={{ fontSize: 18, color: '#1A1A1A', lineHeight: 1 }}>›</span></button>

      <div className="ticker-wrap" id="ticker-scroll">
        <div className="ticker-track">
          {!week || week.cards.length === 0 ? (
            <div style={{ fontFamily: FONT, padding: 16, fontSize: 10, color: '#A3A3A3' }}>No games scheduled</div>
          ) : week.cards.map(c => {
            const final = c.phase === 'final', live = c.phase === 'live'
            return (
              <div key={c.id} className="ticker-card">
                <div className="ticker-card-overlay">
                  {final ? (
                    <Link href={`/nfl/${c.slug}/postgame`} className="ticker-card-overlay-btn">Postgame</Link>
                  ) : (
                    <>
                      <Link href={`/nfl/${c.slug}/scout`} className="ticker-card-overlay-btn">Scout Report</Link>
                      <Link href={`/nfl/${c.slug}`} className="ticker-card-overlay-btn">Game Preview</Link>
                    </>
                  )}
                </div>
                <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, color: live ? '#FF5722' : '#A3A3A3', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  {live ? '● UNDERWAY' : c.label}
                </div>
                {([[c.away, c.awayScore], [c.home, c.homeScore]] as const).map(([t, sc], i) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: i === 0 ? 3 : 6 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.logo} alt="" width={18} height={18} style={{ flexShrink: 0, objectFit: 'contain' }} />
                    <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: '#1A1A1A', letterSpacing: '0.04em', flex: 1 }}>{t.id}</span>
                    {final && sc != null
                      ? <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: '#1A1A1A', lineHeight: 1 }}>{sc}</span>
                      : <span style={{ fontFamily: FONT, fontSize: 9, color: '#A3A3A3' }}>{t.rec}</span>}
                  </div>
                ))}
                {c.lean.kind === 'lean' && <div style={{ fontFamily: FONT, fontSize: 8, fontWeight: 700, color: '#FF5722', letterSpacing: '0.04em', borderTop: '1px solid rgba(26,26,26,0.06)', paddingTop: 5 }}>{c.lean.text}</div>}
                {c.lean.kind === 'even' && <div style={{ fontFamily: FONT, fontSize: 8, color: '#A3A3A3', letterSpacing: '0.04em', borderTop: '1px solid rgba(26,26,26,0.06)', paddingTop: 5 }}>Even match-up</div>}
                {c.lean.kind === 'pending' && <div style={{ fontFamily: FONT, fontSize: 8, color: '#D4D0C8', letterSpacing: '0.04em', borderTop: '1px solid rgba(26,26,26,0.06)', paddingTop: 5 }}>{final ? 'Postgame report' : 'Edge coming'}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── leaders ───────────────────────────────────────────── */

export type LeaderTab = { key: string; label: string; short: string; rows: { id: string; name: string; team: string; headshot: string | null; value: number; sub: string }[] }

export function LeaderPanel({ title, tabs, accent }: { title: string; tabs: LeaderTab[]; accent: string }) {
  const [active, setActive] = useState(tabs[0]?.key)
  const tab = tabs.find(t => t.key === active) ?? tabs[0]
  if (!tab) return null
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1A1A1A', marginBottom: 6 }}>{title}</div>
        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', borderBottom: '1px solid rgba(26,26,26,0.1)' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActive(t.key)} style={{
              fontFamily: FONT, fontSize: 10, fontWeight: active === t.key ? 700 : 400, letterSpacing: '0.04em', padding: '6px 12px 8px', cursor: 'pointer', border: 'none', background: 'transparent',
              color: active === t.key ? accent : '#A3A3A3', borderBottom: active === t.key ? `2px solid ${accent}` : '2px solid transparent', marginBottom: -1, transition: 'all 0.1s',
            }}>{t.short}</button>
          ))}
        </div>
      </div>
      {tab.rows.length === 0 && <div style={{ fontFamily: FONT, fontSize: 12, color: '#A3A3A3', fontStyle: 'italic', padding: '14px 0' }}>No entries yet.</div>}
      {tab.rows.slice(0, 5).map((l, i) => (
        <Link key={l.id} href={`/nfl/players/${l.id}`} style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < 4 ? '1px solid rgba(26,26,26,0.06)' : 'none' }}>
            <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: i === 0 ? accent : '#D4D0C8', width: 18, flexShrink: 0, textAlign: 'right' }}>{i + 1}</span>
            <div style={{ width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F0EBE0', border: i === 0 ? `2px solid ${accent}` : '2px solid #F0EBE0' }}>
              {l.headshot && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.headshot} alt={l.name} width={42} height={42} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
              <div style={{ fontFamily: FONT, fontSize: 10, color: '#A3A3A3', marginTop: 1 }}>{l.team} · {l.sub}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 52 }}>
              <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: i === 0 ? accent : '#1A1A1A', lineHeight: 1 }}>{l.value}</div>
              <div style={{ fontFamily: FONT, fontSize: 8, color: '#A3A3A3', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>{tab.short}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

/* ── comprehensive team table ──────────────────────────── */

export type TeamTableRow = { id: string; name: string; logo: string; rec: string; v: (number | null)[]; d: string[] }
export type TeamTableCol = { label: string; title: string; higherBetter: boolean }

export function TeamTable({ rows, cols, note }: { rows: TeamTableRow[]; cols: TeamTableCol[]; note?: string }) {
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 }>({ i: 0, dir: -1 })
  const sorted = [...rows].sort((a, b) => {
    const av = a.v[sort.i], bv = b.v[sort.i]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return (av - bv) * sort.dir
  })
  const th: React.CSSProperties = { fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#A3A3A3', padding: '6px 6px', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderRadius: 12, overflowX: 'auto' }}>
      {rows.length === 0 ? (
        <div style={{ fontFamily: FONT, fontSize: 12, color: '#A3A3A3', fontStyle: 'italic', padding: 24, textAlign: 'center' }}>{note ?? 'Team numbers appear once games are played and loaded.'}</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(26,26,26,0.08)' }}>
              <th style={{ ...th, width: 24, textAlign: 'center', cursor: 'default' }}>#</th>
              <th style={{ ...th, textAlign: 'left', cursor: 'default' }}>Team</th>
              <th style={{ ...th, cursor: 'default' }}>W-L</th>
              {cols.map((c, i) => (
                <th key={c.label} title={c.title} onClick={() => setSort(s => ({ i, dir: s.i === i ? ((s.dir * -1) as 1 | -1) : c.higherBetter ? -1 : 1 }))} style={{ ...th, color: sort.i === i ? '#FF5722' : '#A3A3A3' }}>
                  {c.label}{sort.i === i ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, k) => (
              <tr key={r.id} style={{ borderBottom: '1px solid rgba(26,26,26,0.04)' }}>
                <td style={{ fontFamily: FONT, fontSize: 10, color: '#A3A3A3', textAlign: 'center', padding: '6px 4px' }}>{k + 1}</td>
                <td style={{ padding: '6px 6px' }}>
                  <Link href={`/nfl/teams/${r.id.toLowerCase()}`} style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.logo} alt="" width={16} height={16} style={{ objectFit: 'contain', flexShrink: 0 }} />
                    <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: '#1A1A1A', whiteSpace: 'nowrap' }}>{r.name}</span>
                  </Link>
                </td>
                <td style={{ fontFamily: FONT, fontSize: 11, color: '#5b5347', textAlign: 'right', padding: '6px 6px', fontVariantNumeric: 'tabular-nums' }}>{r.rec}</td>
                {r.d.map((d, i) => (
                  <td key={i} style={{ fontFamily: FONT, fontSize: 11.5, textAlign: 'right', padding: '6px 6px', fontVariantNumeric: 'tabular-nums', fontWeight: sort.i === i ? 700 : 400, color: sort.i === i ? '#1A1A1A' : '#5b5347', background: sort.i === i ? 'rgba(255,87,34,0.04)' : 'transparent' }}>{d}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ── standings ─────────────────────────────────────────── */

export type StandingsData = { conference: 'AFC' | 'NFC'; division: string; teams: { id: string; name: string; logo: string; w: number; l: number; t: number; diff: number; streak: string }[] }[]

export function Standings({ data }: { data: StandingsData }) {
  const [conf, setConf] = useState<'AFC' | 'NFC'>('AFC')
  const divs = data.filter(d => d.conference === conf)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Sec>Standings</Sec>
        <div style={{ display: 'flex', background: 'rgba(26,26,26,0.06)', padding: 2, flexShrink: 0, marginLeft: 12 }}>
          {(['AFC', 'NFC'] as const).map(l => (
            <button key={l} onClick={() => setConf(l)} style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, padding: '4px 14px', border: 'none', cursor: 'pointer', background: conf === l ? '#1A1A1A' : 'transparent', color: conf === l ? '#FAF8F3' : '#A3A3A3', letterSpacing: '0.06em', transition: 'all 0.12s' }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid rgba(26,26,26,0.08)', borderRadius: 12, overflow: 'hidden' }}>
        {divs.map((div, di) => (
          <div key={div.division}>
            <div style={{ padding: '5px 12px', background: '#F5F1E8', borderTop: di > 0 ? '2px solid rgba(26,26,26,0.08)' : 'none', borderBottom: '1px solid rgba(26,26,26,0.06)' }}>
              <span style={{ fontFamily: FONT, fontSize: 8, fontWeight: 700, color: '#A3A3A3', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{div.division.replace(/^(AFC|NFC)\s+/, '')}</span>
            </div>
            {div.teams.map((t, ti) => (
              <Link key={t.id} href={`/nfl/teams/${t.id.toLowerCase()}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', textDecoration: 'none', borderBottom: '1px solid rgba(26,26,26,0.04)', background: ti === 0 ? 'rgba(255,87,34,0.03)' : '#fff' }}>
                <span style={{ fontFamily: FONT, fontSize: 9, width: 14, flexShrink: 0, color: ti === 0 ? '#FF5722' : '#A3A3A3', fontWeight: ti === 0 ? 700 : 400 }}>{ti + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.logo} alt="" width={16} height={16} style={{ flexShrink: 0, objectFit: 'contain' }} />
                <span style={{ fontFamily: FONT, flex: 1, fontSize: 12, color: '#1A1A1A', fontWeight: ti === 0 ? 600 : 400 }}>{t.name}</span>
                <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: '#1A1A1A', width: 22, textAlign: 'center' }}>{t.w}</span>
                <span style={{ fontFamily: FONT, fontSize: 11, color: '#A3A3A3', width: 22, textAlign: 'center' }}>{t.l}{t.t ? `-${t.t}` : ''}</span>
                <span style={{ fontFamily: FONT, fontSize: 10, color: '#A3A3A3', width: 30, textAlign: 'right' }}>{t.diff > 0 ? `+${t.diff}` : t.diff}</span>
                <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, width: 26, textAlign: 'right', color: t.streak.startsWith('W') ? '#059669' : t.streak.startsWith('L') ? '#DC2626' : '#A3A3A3' }}>{t.streak}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontFamily: FONT, fontSize: 9, color: '#A3A3A3', marginTop: 6 }}>Columns: W · L · point differential · streak. Built from results in our schedule table.</div>
    </div>
  )
}
