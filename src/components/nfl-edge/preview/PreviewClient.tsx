'use client'

/* eslint-disable @next/next/no-img-element */

// src/components/nfl-edge/preview/PreviewClient.tsx
//
// The interactive parts of the Game Preview (everything else on the page is server-rendered):
//   FactorExplorer   radar of the club-quality factors + a clickable factor table with plain-English explanations
//   QbCards          side-by-side starting QBs; a button opens a modal with season percentiles + last 3 games
//   DepthGrid        likely starters as position-pill cards; tap a player for season + last-3 modal
//   KeyPlayerCards   key players with a matchup chip, a mini chart, and a breakdown modal
//
// Props are plain data only (no functions cross the server/client boundary).

import { useEffect, useState } from 'react'
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Factor } from '@/lib/nfl-edge/factors'
import type { GameLine, PlayerCard, QbCardData } from '@/lib/nfl-edge/players'
import type { KeyPlayer } from '@/lib/nfl-edge/preview'
import { ordinal } from '@/lib/ordinal'
import { C, MONO, SANS, DISPLAY } from '@/components/team/ui'

export type TeamLite = { id: string; nick: string; color: string; textOn: string; logo: string }

const AXIS = { fontSize: 10.5, fontFamily: MONO, fill: '#5b5347' }
const injColor = { Out: '#D4533B', Doubtful: '#E58A2B', Questionable: '#E8C22E' } as const

function Dot({ status, practice }: { status: 'Out' | 'Doubtful' | 'Questionable' | null; practice?: string | null }) {
  const color = status ? injColor[status] : practice && /Limited/i.test(practice) ? '#E8C22E' : practice && /Did Not/i.test(practice) ? '#E58A2B' : '#1D9E75'
  return <span title={status ?? practice ?? 'No designation'} style={{ width: 9, height: 9, borderRadius: 999, background: color, display: 'inline-block', flexShrink: 0 }} />
}

function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,.55)', zIndex: 100, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.cream, borderRadius: 16, maxWidth: 560, width: '100%', maxHeight: '86vh', overflowY: 'auto', padding: 22, border: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, color: C.ink, lineHeight: 1.1 }}>{title}</div>
            {sub && <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 4 }}>{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.line}`, background: C.card, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Bars({ rows, color }: { rows: { label: string; pct: number; display: string }[]; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,150px) minmax(0,1fr) 64px', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#5b5347' }}>{r.label}</span>
          <div style={{ height: 8, background: C.soft, borderRadius: 4 }}><div style={{ width: `${r.pct}%`, height: '100%', background: color, borderRadius: 4 }} /></div>
          <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{r.display}</span>
        </div>
      ))}
    </div>
  )
}

/** ── Factors ────────────────────────────────────────────────────────────── */
export function FactorExplorer({ factors, home, away }: { factors: Factor[]; home: TeamLite; away: TeamLite }) {
  const [open, setOpen] = useState<string | null>(null)
  const radar = factors.filter(f => f.homePct != null && f.awayPct != null).map(f => ({ axis: f.label, home: f.homePct as number, away: f.awayPct as number }))
  const leanName = (f: Factor) => (f.lean === 'home' ? home.id : f.lean === 'away' ? away.id : 'Even')
  return (
    <div className="tp-grid-2" style={{ alignItems: 'start' }}>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, marginBottom: 6 }}>Club profile · league percentile</div>
        {radar.length >= 3 ? (
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="#e7e2d8" />
                <PolarAngleAxis dataKey="axis" tick={AXIS} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name={away.nick} dataKey="away" stroke={away.color} fill={away.color} fillOpacity={0.22} strokeWidth={2} />
                <Radar name={home.nick} dataKey="home" stroke={home.color} fill={home.color} fillOpacity={0.22} strokeWidth={2} />
                <Tooltip formatter={(v) => `${v}th percentile`} contentStyle={{ fontFamily: MONO, fontSize: 11, borderRadius: 8 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', padding: '40px 0', textAlign: 'center', margin: 0 }}>Not enough played games for a profile yet.</p>
        )}
        <div style={{ display: 'flex', gap: 14, fontFamily: MONO, fontSize: 10, color: '#5b5347', justifyContent: 'center' }}>
          <span><b style={{ color: away.color }}>■</b> {away.nick}</span><span><b style={{ color: home.color }}>■</b> {home.nick}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 9, color: C.faint, textAlign: 'center', marginTop: 4 }}>Farther from the centre = stronger relative to all 32 clubs.</div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, marginBottom: 8 }}>Factor table · tap a row</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {factors.map(f => {
            const on = open === f.key
            return (
              <div key={f.key} style={{ borderTop: `1px solid ${C.soft}` }}>
                <button onClick={() => setOpen(on ? null : f.key)} aria-expanded={on} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: 'minmax(96px,1fr) 62px 62px 74px', gap: 8, alignItems: 'center', padding: '9px 2px', width: '100%', boxSizing: 'border-box' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{f.label}</span>
                  <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12, textAlign: 'right', fontWeight: f.lean === 'away' ? 800 : 400 }}>{f.awayDisplay}</span>
                  <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 12, textAlign: 'right', fontWeight: f.lean === 'home' ? 800 : 400 }}>{f.homeDisplay}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, textAlign: 'center', padding: '3px 0', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.06em',
                    background: f.lean === 'home' ? home.color : f.lean === 'away' ? away.color : C.soft, color: f.lean === 'home' ? home.textOn : f.lean === 'away' ? away.textOn : C.mute }}>{leanName(f)}</span>
                </button>
                {on && (
                  <div style={{ padding: '2px 2px 12px', fontSize: 12.5, color: '#5b5347', lineHeight: 1.5 }}>
                    {f.plain}
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 4 }}>
                      {away.id} {f.awayDisplay}{f.awayRank ? ` (${ordinal(f.awayRank)} of 32)` : ''} · {home.id} {f.homeDisplay}{f.homeRank ? ` (${ordinal(f.homeRank)} of 32)` : ''} · sample: {f.sample}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(96px,1fr) 62px 62px 74px', gap: 8, borderTop: `1px solid ${C.line}`, padding: '8px 2px 0', fontFamily: MONO, fontSize: 9, color: C.faint, textTransform: 'uppercase' }}>
            <span /> <span style={{ textAlign: 'right' }}>{away.id}</span><span style={{ textAlign: 'right' }}>{home.id}</span><span style={{ textAlign: 'center' }}>Leans</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** ── QBs ────────────────────────────────────────────────────────────────── */
function lineRow(g: GameLine, isQb: boolean) {
  return isQb
    ? `${g.cmp}/${g.att} · ${g.passYds} yds · ${g.passTd} TD · ${g.int} INT`
    : g.targets > 0 ? `${g.rec}/${g.targets} · ${g.recYds} yds${g.recTd ? ` · ${g.recTd} TD` : ''}` : `${g.carries} car · ${g.rushYds} yds${g.rushTd ? ` · ${g.rushTd} TD` : ''}`
}

function Last3({ games, isQb }: { games: GameLine[]; isQb: boolean }) {
  if (!games.length) return <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', margin: 0 }}>No recent games on record.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {games.map(g => (
        <div key={`${g.season}-${g.week}`} style={{ display: 'grid', gridTemplateColumns: '78px 1fr', gap: 8, fontSize: 12.5 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.mute }}>{g.season} · Wk {g.week}</span>
          <span style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{lineRow(g, isQb)}</span>
        </div>
      ))}
    </div>
  )
}

export function QbCards({ qbs, teams, weapons }: { qbs: (QbCardData | null)[]; teams: TeamLite[]; weapons: (string | null)[] }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      <div className="tp-grid-2">
        {qbs.map((q, i) => {
          const t = teams[i]
          if (!q) return <div key={t.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, fontSize: 12.5, color: C.faint, fontStyle: 'italic' }}>{t.nick}: starting quarterback not on the depth chart yet.</div>
          const m = (k: string) => q.metrics.find(x => x.key === k)
          return (
            <div key={t.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderTop: `4px solid ${t.color}`, borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {q.headshot && <img src={q.headshot} alt={q.name} width={56} height={56} style={{ borderRadius: 999, background: C.soft, objectFit: 'cover', width: 56, height: 56 }} />}
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, textTransform: 'uppercase', letterSpacing: '.1em' }}>{t.nick} · QB{q.jersey ? ` · #${q.jersey}` : ''}</div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, color: C.ink, lineHeight: 1.1 }}>{q.name}</div>
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: q.isPriorSeason ? C.orange : C.faint, marginTop: 10 }}>{q.basisLabel}{q.isPriorSeason ? ' — last season, no 2026 sample yet' : ''} · {q.basisAtt} attempts</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8, marginTop: 8 }}>
                {[['EPA/att', m('epaAtt')?.display], ['CPOE', m('cpoe')?.display], ['TD', String(q.td)], ['INT', String(q.int)]].map(([l, v]) => (
                  <div key={l} style={{ background: C.soft, borderRadius: 10, padding: '8px 10px' }}>
                    <div style={{ fontFamily: MONO, fontSize: 8.5, color: C.mute, textTransform: 'uppercase' }}>{l}</div>
                    <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 19 }}>{v ?? '—'}</div>
                  </div>
                ))}
              </div>
              {weapons[i] && <div style={{ marginTop: 10, fontSize: 12.5, color: '#5b5347' }}><span style={{ fontFamily: MONO, fontSize: 9.5, color: C.orange, textTransform: 'uppercase', letterSpacing: '.1em' }}>Top weapon </span>{weapons[i]}</div>}
              {q.thin && <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 6 }}>Small sample. Read the percentiles with care.</div>}
              <button onClick={() => setOpen(i)} style={{ marginTop: 12, fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', background: C.ink, color: '#FAF8F3', border: 0, padding: '9px 14px', borderRadius: 8, cursor: 'pointer' }}>Percentiles &amp; last 3 games →</button>
            </div>
          )
        })}
      </div>
      {open != null && qbs[open] && (
        <Modal title={qbs[open]!.name} sub={`${qbs[open]!.basisLabel} · percentile among ${qbs[open]!.qualifyingQbs} qualifying QBs`} onClose={() => setOpen(null)}>
          {qbs[open]!.metrics.some(x => x.pct != null) ? (
            <Bars color={teams[open].color} rows={qbs[open]!.metrics.map(x => ({ label: x.label, pct: x.pct ?? 0, display: x.pct == null ? x.display : `${x.display} · ${x.pct}` }))} />
          ) : <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic' }}>Not enough qualifying quarterbacks for percentiles yet.</p>}
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, margin: '8px 0 14px' }}>Bar = percentile (100 = best; for INT % lower is better).</div>
          <div style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, marginBottom: 8 }}>Last 3 games</div>
          <Last3 games={qbs[open]!.last3} isQb />
        </Modal>
      )}
    </>
  )
}

/** ── Depth cards ────────────────────────────────────────────────────────── */
export function DepthGrid({ side, team }: { side: PlayerCard[]; team: TeamLite }) {
  const [sel, setSel] = useState<PlayerCard | null>(null)
  if (!side.length) return <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', margin: 0 }}>No depth chart on file for {team.nick}.</p>
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
        {side.map(p => (
          <button key={p.id + p.slot} onClick={() => setSel(p)} style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', display: 'flex', gap: 8, alignItems: 'center', background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 10px' }}>
            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, background: team.color, color: team.textOn, borderRadius: 6, padding: '3px 6px', minWidth: 26, textAlign: 'center' }}>{p.slot === 'DEF' ? p.pos : p.slot}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              <span style={{ display: 'block', fontFamily: MONO, fontSize: 9, color: C.faint }}>{p.snapPct != null ? `${Math.round(p.snapPct * 100)}% snaps${p.snapWeek ? ` (Wk ${p.snapWeek})` : ''}` : 'no snap data yet'}</span>
            </span>
            <Dot status={p.injury?.status ?? null} practice={p.injury?.practice} />
          </button>
        ))}
      </div>
      {sel && (
        <Modal title={sel.name} sub={`${sel.pos} · ${team.nick}${sel.jersey ? ` · #${sel.jersey}` : ''}${sel.injury?.status ? ` · ${sel.injury.status}${sel.injury.injury ? ` (${sel.injury.injury})` : ''}` : ''}`} onClose={() => setSel(null)}>
          {sel.seasonLine ? (
            <>
              <div style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, marginBottom: 6 }}>Season · {sel.seasonLabel}</div>
              <div style={{ fontFamily: SANS, fontVariantNumeric: 'tabular-nums', fontSize: 14, marginBottom: 14 }}>
                {sel.slot === 'QB'
                  ? `${sel.seasonLine.cmp}/${sel.seasonLine.att} · ${sel.seasonLine.passYds} yds · ${sel.seasonLine.passTd} TD · ${sel.seasonLine.int} INT`
                  : [sel.seasonLine.targets > 0 ? `${sel.seasonLine.rec}/${sel.seasonLine.targets} for ${sel.seasonLine.recYds} yds` : null, sel.seasonLine.carries > 0 ? `${sel.seasonLine.carries} car for ${sel.seasonLine.rushYds} yds` : null].filter(Boolean).join(' · ') || 'No offensive touches recorded'}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: C.orange, fontWeight: 700, marginBottom: 8 }}>Last 3 games</div>
              <Last3 games={sel.last3} isQb={sel.slot === 'QB'} />
            </>
          ) : (
            <p style={{ fontSize: 12.5, color: C.faint, fontStyle: 'italic', margin: 0 }}>{sel.slot === 'DEF' || /^(LT|LG|C|RG|RT)$/.test(sel.slot) ? 'Offensive-line and defensive stat lines are not carried on the Preview. Snap and availability detail is in the Scout Report.' : 'No NFL production on record yet.'}</p>
          )}
        </Modal>
      )}
    </>
  )
}

/** ── Key players ────────────────────────────────────────────────────────── */
export function KeyPlayerCards({ players, team }: { players: KeyPlayer[]; team: TeamLite }) {
  const [sel, setSel] = useState<KeyPlayer | null>(null)
  if (!players.length) return <p style={{ fontSize: 12, color: C.faint, fontStyle: 'italic', margin: 0 }}>No usage sample for {team.nick} skill players yet.</p>
  const tone = { good: { bg: '#E1F5EE', fg: '#085041' }, bad: { bg: '#FBEAE4', fg: '#8A3A24' }, plain: { bg: C.soft, fg: '#5b5347' } }
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {players.map(p => (
          <div key={p.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `4px solid ${team.color}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {p.headshot && <img src={p.headshot} alt="" width={40} height={40} style={{ borderRadius: 999, background: C.soft, objectFit: 'cover', width: 40, height: 40 }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 17, lineHeight: 1.1 }}>{p.name} <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, fontWeight: 400 }}>{p.pos}</span></div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{p.headline}</div>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, padding: '5px 9px', borderRadius: 8, background: tone[p.tone].bg, color: tone[p.tone].fg, display: 'inline-block' }}>{p.chip}</div>
            <div style={{ marginTop: 10 }}><Bars rows={p.bars} color={team.color} /></div>
            <button onClick={() => setSel(p)} style={{ marginTop: 10, all: 'unset', cursor: 'pointer', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: C.orange, fontWeight: 700 }}>Breakdown →</button>
          </div>
        ))}
      </div>
      {sel && (
        <Modal title={sel.name} sub={`${sel.pos} · ${team.nick} · ${sel.sample}`} onClose={() => setSel(null)}>
          <div style={{ fontSize: 13, color: '#3a352c', marginBottom: 12 }}>{sel.chip}</div>
          <Bars rows={sel.detail} color={team.color} />
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint, marginTop: 12 }}>A small matchup view. Snap shares, EPA matrices and coverage detail are in the Scout Report.</div>
        </Modal>
      )}
    </>
  )
}
