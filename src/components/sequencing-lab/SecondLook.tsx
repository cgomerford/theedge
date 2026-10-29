'use client'

// src/components/sequencing-lab/SecondLook.tsx
//
// Sequencing Lab → Second Look. Choose the pitcher's hand, the batter's side, how a hitter's first at-bat against that pitcher ended and on which pitch, and see how the
// second at-bat of the same game opened and ended. League scope is the default; "This pitcher" and "This hitter" are Pro (the server sends nothing for them unless Pro).
// All filters live in the URL so a link can be shared. Square boxes, 2px black borders, per the approved mockup. A group under MIN second at-bats shows "Small sample" and no rate.
// Every figure is what has happened in the stored season; nothing here says what a hitter will do next time.

import { useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { C, SANS } from '@/components/team/ui'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchLabel } from '@/lib/lab/pitch-meta'
import type { PairPitch, RecentPair, ResultClass, Scope, SlData, SlFilters } from '@/lib/second-look/data'
import PitchDot, { dotColor } from './PitchDot'

const MIN = MIN_SAMPLE.secondLookGroup
const INK = '#1A1A1A'
const box: React.CSSProperties = { background: '#fff', border: `2px solid ${INK}`, padding: 18, minWidth: 0 }
const kick: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5b5347' }
const RESULT_LABEL: Record<ResultClass, string> = { K: 'Strikeout', BB: 'Walk', HIT: 'Hit', OUT_IN_PLAY: 'Out in play' }
const RESULT_PHRASE: Record<ResultClass, string> = { K: 'a strikeout', BB: 'a walk', HIT: 'a hit', OUT_IN_PLAY: 'an out in play' }
const FIRST_SHORT: Record<string, string> = { K: 'K', BB: 'BB', HIT: 'Hit', OUT_IN_PLAY: 'Out', OTHER: 'Other' }
const ENDED: Record<string, string> = { strikeout: 'Strikeout', walk: 'Walk', hit_by_pitch: 'Hit by pitch', single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home run', out_in_play: 'Out in play', other: 'Other' }
const SEGMENTS: { key: string; label: string; color: string; from: string[] }[] = [
  { key: 'K', label: 'Strikeout', color: '#1A1A1A', from: ['strikeout'] },
  { key: 'BB', label: 'Walk', color: '#8A8578', from: ['walk', 'hit_by_pitch'] },
  { key: '1B', label: 'Single', color: '#FFC4B0', from: ['single'] },
  { key: '2B', label: 'Double', color: '#FF9A75', from: ['double'] },
  { key: '3B', label: 'Triple', color: '#FF7A4D', from: ['triple'] },
  { key: 'HR', label: 'Home run', color: '#FF5722', from: ['home_run'] },
  { key: 'OUT', label: 'Out in play', color: '#1D5FD1', from: ['out_in_play'] },
  { key: 'OTH', label: 'Other', color: '#D8D2C4', from: ['other'] },
]
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)
const fmt = (p: number) => (p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`)
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
const dateShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const star = <span style={{ color: '#D4533B', fontWeight: 800 }}>*</span>

function Seg<T extends string>({ label, items, value, onChange }: { label: string; items: [T, ReactNode][]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...kick, marginBottom: 6 }}>{label}</div>
      <div role="group" aria-label={label} style={{ display: 'inline-flex', flexWrap: 'wrap' }}>
        {items.map(([v, text], i) => (
          <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)} style={{ minHeight: 44, padding: '8px 16px', fontFamily: SANS, fontWeight: 800, fontSize: 14, cursor: 'pointer', border: `2px solid ${INK}`, marginLeft: i ? -2 : 0, marginBottom: -2, background: v === value ? INK : '#fff', color: v === value ? '#fff' : INK, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{text}</button>
        ))}
      </div>
    </div>
  )
}

function PlayerPick({ placeholder, onPick }: { placeholder: string; onPick: (id: number) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ id: number; fullName: string; primaryPosition?: { abbreviation?: string } }[]>([])
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return }
    const ac = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/lab/search?q=${encodeURIComponent(q.trim())}`, { signal: ac.signal }).then(r => r.json()).then(j => setHits((j.people ?? []).slice(0, 6))).catch(() => {})
    }, 250)
    return () => { clearTimeout(t); ac.abort() }
  }, [q])
  return (
    <div style={{ position: 'relative', maxWidth: 320 }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={{ width: '100%', minHeight: 44, fontFamily: SANS, fontSize: 14, border: `2px solid ${INK}`, padding: '8px 12px', background: '#fff' }} />
      {hits.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: `2px solid ${INK}`, borderTop: 0 }}>
          {hits.map(h => <button key={h.id} type="button" onClick={() => { setQ(''); setHits([]); onPick(h.id) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', minHeight: 44, border: 0, borderBottom: `1px solid ${C.line}`, background: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>{h.fullName}{h.primaryPosition?.abbreviation ? <span style={{ color: C.faint, fontWeight: 600 }}> · {h.primaryPosition.abbreviation}</span> : null}</button>)}
        </div>
      )}
    </div>
  )
}

function EndingBar({ title, n, endings }: { title: string; n: number; endings: Record<string, number> }) {
  const parts = SEGMENTS.map(s => ({ ...s, count: s.from.reduce((a, k) => a + (endings[k] ?? 0), 0) })).filter(s => s.count > 0)
  const label = `${title}, ${n} second at-bats: ${parts.map(p => `${p.label} ${fmt(pct(p.count, n))}`).join(', ')}`
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15 }}><span>{title}</span><span style={{ fontWeight: 600, color: '#5b5347', fontSize: 13 }}>n {n.toLocaleString('en-US')}</span></div>
      <div role="img" aria-label={label} style={{ display: 'flex', height: 26, border: `2px solid ${INK}`, marginTop: 6 }}>
        {parts.map(p => <span key={p.key} style={{ width: `${pct(p.count, n)}%`, background: p.color }} />)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6, fontSize: 12.5, color: '#3a352c' }}>
        {parts.map(p => <span key={p.key}><span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, background: p.color, border: `1px solid ${INK}`, marginRight: 5 }} />{p.label} <b>{fmt(pct(p.count, n))}</b></span>)}
      </div>
    </div>
  )
}

const dots = (ps: PairPitch[]) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>{ps.map((p, i) => <PitchDot key={i} t={p.t} size={20} ring={p.r === 'whiff'} title={`${pitchLabel(p.t)}${p.r ? ` · ${p.r}` : ''}`} />)}</span>
)

export default function SecondLook({ filters, data, season, lockedNode, nameOfScope }: { filters: SlFilters; data: SlData | null; season: number; lockedNode: ReactNode | null; nameOfScope: string | null }) {
  const router = useRouter()
  const go = (patch: Partial<{ hand: string; stand: string; ended: string; pitch: string | null; scope: string; id: number | null }>) => {
    const next = { hand: filters.hand, stand: filters.stand, ended: filters.result, pitch: filters.pitch, scope: filters.scope, id: filters.id, ...patch }
    const q = new URLSearchParams()
    q.set('hand', next.hand); q.set('stand', next.stand); q.set('ended', next.ended)
    if (next.pitch) q.set('pitch', next.pitch)
    if (next.scope !== 'league') { q.set('scope', next.scope); if (next.id) q.set('id', String(next.id)) }
    router.push(`/mlb/lab/sequencing/second-look?${q}`, { scroll: false })
  }
  const pitch = data?.pitch ?? null
  const row = data?.row ?? null
  const pName = pitch ? pitchLabel(pitch).toLowerCase() : ''
  const scopeText = filters.scope === 'league' ? 'Across the league' : (nameOfScope ?? (filters.scope === 'pitcher' ? 'This pitcher' : 'This hitter'))
  const enough = !!row && row.opened >= MIN && row.other >= MIN
  const baseShare = (t: string) => (data?.baseline && data.baseline.n > 0 ? pct(data.baseline.mix[t] ?? 0, data.baseline.n) : null)
  const mixRows = row ? Object.entries(row.mix).map(([t, n]) => ({ t, p: pct(n, row.n), base: baseShare(t) })).sort((a, b) => b.p - a.p).slice(0, 6) : []
  const maxP = Math.max(1, ...mixRows.flatMap(r => [r.p, r.base ?? 0]))
  const sameK = row ? pct(row.endingsSame.strikeout ?? 0, row.opened) : 0
  const otherK = row ? pct(row.endingsOther.strikeout ?? 0, row.other) : 0
  const diff = Math.round(sameK) - Math.round(otherK)
  const types = (data?.types ?? []).filter(t => t.n >= MIN || t.t === pitch).slice(0, 8)

  return (
    <div style={{ fontFamily: SANS, color: INK }}>
      <div style={kick}>§ Sequencing Lab · Second Look</div>
      <h1 style={{ margin: '6px 0 10px', fontSize: 'clamp(34px, 6vw, 60px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1 }}>The next time he sees him</h1>
      <p style={{ margin: '0 0 18px', fontSize: 17, lineHeight: 1.5, maxWidth: 760 }}>Catchers say a hitter hunts the pitch that got him out. Choose how the first at-bat ended and on which pitch, and see what pitchers threw in the second at-bat of the same game, and how those at-bats ended.</p>

      <div style={{ ...box, display: 'grid', gap: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 28px' }}>
          <Seg label="Pitcher throws" items={[['R', 'Right'], ['L', 'Left']]} value={filters.hand} onChange={v => go({ hand: v, pitch: null })} />
          <Seg label="Batter hits" items={[['L', 'Left'], ['R', 'Right']]} value={filters.stand} onChange={v => go({ stand: v, pitch: null })} />
          <Seg label="Look at" items={[['league', 'League'], ['pitcher', 'This pitcher (Pro)'], ['batter', 'This hitter (Pro)']] as [Scope, string][]} value={filters.scope} onChange={v => go({ scope: v, id: null })} />
        </div>
        {filters.scope !== 'league' && (
          <div>
            <div style={{ ...kick, marginBottom: 6 }}>{filters.scope === 'pitcher' ? 'Find a pitcher' : 'Find a hitter'}{filters.id && nameOfScope ? ` · showing ${nameOfScope}` : ''}</div>
            <PlayerPick placeholder={filters.scope === 'pitcher' ? 'Pitcher name' : 'Hitter name'} onPick={id => go({ id })} />
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 28px' }}>
          <Seg label="First at-bat ended in" items={(Object.keys(RESULT_LABEL) as ResultClass[]).map(k => [k, RESULT_LABEL[k]] as [ResultClass, string])} value={filters.result} onChange={v => go({ ended: v, pitch: null })} />
          {types.length > 0 && <Seg label="On a" items={types.map(t => [t.t, <span key={t.t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span aria-hidden style={{ width: 12, height: 12, borderRadius: '50%', background: dotColor(t.t), border: `1.5px solid ${INK}` }} />{pitchLabel(t.t)}</span>] as [string, ReactNode])} value={pitch ?? ''} onChange={v => go({ pitch: v })} />}
        </div>
      </div>

      {!data ? (
        <div style={{ ...box, marginTop: 18 }}><p style={{ margin: 0, color: '#5b5347' }}>The Second Look numbers could not be loaded right now.</p></div>
      ) : !pitch ? (
        <div style={{ ...box, marginTop: 18, borderStyle: 'dashed' }}><p style={{ margin: 0, color: '#5b5347' }}>No {season} pairs match this selection. Try the other hand or side.</p></div>
      ) : (
        <>
          <h2 style={{ margin: '22px 0 4px', fontSize: 'clamp(19px, 2.6vw, 25px)', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.25, maxWidth: 900 }}>
            {filters.hand === 'R' ? 'Right' : 'Left'}-handed pitchers facing {filters.stand === 'L' ? 'left' : 'right'}-handed batters. The first at-bat ended in {RESULT_PHRASE[filters.result]} on {article(pName)} {pName}. What happened the next time up?
          </h2>
          <div style={{ fontSize: 14, color: '#5b5347' }}>{lockedNode ? scopeText : <>{scopeText} · <b style={{ color: INK }}>n {(row?.n ?? 0).toLocaleString('en-US')}</b> second at-bats, same pitcher, same game</>}</div>

          {lockedNode ? <div style={{ marginTop: 18 }}>{lockedNode}</div> : !enough ? (
            <div style={{ marginTop: 18, border: `2px dashed ${INK}`, padding: 22, background: '#fff' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Small sample (n = {(row?.n ?? 0).toLocaleString('en-US')}){star}</div>
              <p style={{ margin: '6px 0 12px', color: '#5b5347', fontSize: 14 }}>Each group needs at least {MIN} second at-bats before a rate is shown. Opened with the {pName || 'same pitch'} again: n {row?.opened ?? 0}. Opened with something else: n {row?.other ?? 0}.</p>
              {filters.scope !== 'league' && <button type="button" onClick={() => go({ scope: 'league', id: null })} style={{ minHeight: 44, padding: '8px 16px', fontFamily: SANS, fontWeight: 800, fontSize: 14, cursor: 'pointer', border: `2px solid ${INK}`, background: '#fff' }}>Show the league instead</button>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, marginTop: 18 }}>
              <section style={box} aria-label="First pitch of the second look">
                <div style={kick}>1 · First pitch of the second look</div>
                <h3 style={{ margin: '6px 0 2px', fontSize: 26, fontWeight: 800, letterSpacing: '-0.015em' }}>Opened with the {pName} again: {Math.round(pct(row.opened, row.n))}%</h3>
                {baseShare(pitch!) != null && <div style={{ fontSize: 14, color: '#5b5347' }}>Against {Math.round(baseShare(pitch!) as number)}% on every 0-0 pitch to this side.</div>}
                <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                  {mixRows.map(r => (
                    <div key={r.t} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr)', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: r.t === pitch ? 800 : 600 }}>{pitchLabel(r.t)}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ height: 14, width: `${(r.p / maxP) * 80}%`, background: dotColor(r.t), border: `2px solid ${INK}`, minWidth: 4 }} /><b style={{ fontSize: 13 }}>{Math.round(r.p)}%</b></div>
                        {r.base != null && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}><span style={{ height: 6, width: `${(r.base / maxP) * 80}%`, background: '#BDB6A6', minWidth: 3 }} /><span style={{ fontSize: 12, color: '#5b5347' }}>{Math.round(r.base)}% all 0-0</span></div>}
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '14px 0 0', fontSize: 12, color: '#5b5347' }}>Thick bar: second look after this ending. Thin grey bar: every 0-0 pitch from this hand to this side.</p>
              </section>

              <section style={box} aria-label="How the second look ended">
                <div style={kick}>2 · Went back to it, or didn&apos;t</div>
                <h3 style={{ margin: '6px 0 2px', fontSize: 26, fontWeight: 800, letterSpacing: '-0.015em' }}>How the second look ended</h3>
                <div style={{ fontSize: 14, color: '#5b5347' }}>Split by whether the second at-bat opened with the same pitch that ended the first.</div>
                <EndingBar title={`Opened with the ${pName} again`} n={row.opened} endings={row.endingsSame} />
                <EndingBar title="Opened with something else" n={row.other} endings={row.endingsOther} />
                <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 16, paddingTop: 10, fontSize: 14 }}>
                  {Math.abs(diff) < 1 ? 'Strikeouts were about as common either way.' : `Strikeouts were ${Math.abs(diff)} point${Math.abs(diff) === 1 ? '' : 's'} ${diff > 0 ? 'more' : 'less'} common when the second look opened with the ${pName} again.`} Compare the sample sizes before reading much into it.
                  <div style={{ fontSize: 12, color: '#5b5347', marginTop: 4 }}>Walk includes hit by pitch.</div>
                </div>
              </section>
            </div>
          )}

          {!lockedNode && (
            <section style={{ ...box, padding: 0, marginTop: 16 }} aria-label="Recent pairs that match">
              <div style={{ padding: '16px 18px', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>⊕ Recent pairs that match</h3>
                <span style={{ fontSize: 13, color: '#5b5347' }}>First at-bat, then the second, same game. Ring = swing and miss.</span>
              </div>
              {data.recent.length === 0 ? <p style={{ margin: 0, padding: '0 18px 16px', color: '#5b5347' }}>No pairs to list for this selection.</p> : (
                <div style={{ overflowX: 'auto', borderTop: `2px solid ${INK}` }}>
                  <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                    <thead><tr style={{ textAlign: 'left' }}>{['Date', 'Pitcher', 'Batter', 'First at-bat', 'Second at-bat', 'Ended'].map(h => <th key={h} style={{ padding: '10px 14px', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#5b5347' }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {data.recent.map((p: RecentPair, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{dateShort(p.date)}</td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{data.names[p.pitcherId] ?? '—'}</td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{data.names[p.batterId] ?? '—'}</td>
                          <td style={{ padding: '10px 14px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{dots(p.first)}<b style={{ fontSize: 13 }}>{FIRST_SHORT[p.firstClass] ?? p.firstClass}</b></span></td>
                          <td style={{ padding: '10px 14px' }}>{dots(p.second)}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 800, whiteSpace: 'nowrap' }}>{ENDED[p.ended] ?? p.ended}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ padding: '12px 18px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', borderTop: `1px solid ${C.line}` }}>
                <button type="button" disabled title="Saved cards arrive with Build your own card" style={{ minHeight: 44, padding: '8px 16px', fontFamily: SANS, fontWeight: 800, fontSize: 14, border: `2px solid ${INK}`, background: '#fff', opacity: 0.55, cursor: 'default' }}>Add to a Game Plan Card</button>
                <span style={{ fontSize: 12, color: '#5b5347' }}>Coming soon, with Build your own card.</span>
              </div>
            </section>
          )}
        </>
      )}

      <div style={{ borderTop: `2px solid ${INK}`, marginTop: 24, paddingTop: 12, fontSize: 12.5, color: '#5b5347', lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>How it is built: each hitter&apos;s first and second plate appearance against the same pitcher in the same game (and the second and third), from the stored {season} pitches. Each pair counts once. Small sample under {MIN} second at-bats in a group. The &quot;0-0&quot; line is the first pitch of every plate appearance from that hand to that side.</p>
        <p style={{ margin: '6px 0 0' }}>This describes what has happened in {season}. It does not say what a hitter will do next time.</p>
      </div>
    </div>
  )
}
