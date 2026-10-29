'use client'

// src/components/sequencing-lab/SecondLook.tsx
//
// Sequencing Lab → Second Look. Choose the pitcher's hand, the batter's side, how a hitter's first at-bat against that pitcher ended and on which pitch, and see how the second
// at-bat of the same game opened and ended. League scope is the default; "This pitcher" and "This hitter" are Pro (the server sends nothing for them unless Pro). All choices live
// in the URL so a link can be shared. A group under MIN second at-bats shows "Small sample" and no rate. "Play a pair" steps through one real pair pitch by pitch; "Add to a Game
// Plan Card" keeps that pair in this browser for Build your own card. Everything is what has happened in the stored season, never a forecast.

import { useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { C, SANS } from '@/components/team/ui'
import { MIN_SAMPLE } from '@/lib/min-sample'
import { pitchLabel } from '@/lib/lab/pitch-meta'
import { zoneLabel } from '@/lib/game-plan/zones'
import { savePair } from '@/lib/game-plan/saved'
import type { PairPitch, RecentPair, ResultClass, Scope, SlData, SlFilters } from '@/lib/second-look/data'
import PitchDot, { dotColor } from './PitchDot'
import { PageHead, PillGroup, kick, note, star, tile } from './ui'

const MIN = MIN_SAMPLE.secondLookGroup
const RESULT_LABEL: Record<ResultClass, string> = { K: 'Strikeout', BB: 'Walk', HIT: 'Hit', OUT_IN_PLAY: 'Out in play' }
const RESULT_PHRASE: Record<ResultClass, string> = { K: 'a strikeout', BB: 'a walk', HIT: 'a hit', OUT_IN_PLAY: 'an out in play' }
const FIRST_SHORT: Record<string, string> = { K: 'K', BB: 'BB', HIT: 'Hit', OUT_IN_PLAY: 'Out', OTHER: 'Other' }
const ENDED: Record<string, string> = { strikeout: 'Strikeout', walk: 'Walk', hit_by_pitch: 'Hit by pitch', single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home run', out_in_play: 'Out in play', other: 'Other' }
const PITCH_RESULT: Record<string, string> = { ball: 'ball', called: 'called strike', whiff: 'swinging strike', foul: 'foul', hit: 'in play, a hit', out: 'in play, an out' }
const SEGMENTS: { key: string; label: string; color: string; from: string[] }[] = [
  { key: 'K', label: 'Strikeout', color: '#1A1A1A', from: ['strikeout'] },
  { key: 'BB', label: 'Walk', color: '#8A8578', from: ['walk', 'hit_by_pitch'] },
  { key: '1B', label: 'Single', color: '#FFC4B0', from: ['single'] },
  { key: '2B', label: 'Double', color: '#FF9A75', from: ['double'] },
  { key: '3B', label: 'Triple', color: '#FF7A4D', from: ['triple'] },
  { key: 'HR', label: 'Home run', color: '#FF5722', from: ['home_run'] },
  { key: 'OUT', label: 'Out in play', color: '#6CABDD', from: ['out_in_play'] },
  { key: 'OTH', label: 'Other', color: '#D8D2C4', from: ['other'] },
]
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)
const fmt = (p: number) => (p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`)
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
const dateShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

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
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={{ width: '100%', font: 'inherit', fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 12px', background: '#fff' }} />
      {hits.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, marginTop: 2, maxHeight: 280, overflowY: 'auto' }}>
          {hits.map(h => <button key={h.id} type="button" onClick={() => { setQ(''); setHits([]); onPick(h.id) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 0, borderBottom: `1px solid ${C.soft}`, background: 'none', cursor: 'pointer', font: 'inherit', fontSize: 14, fontWeight: 700 }}>{h.fullName}{h.primaryPosition?.abbreviation ? <span style={{ color: C.faint, fontWeight: 600 }}> · {h.primaryPosition.abbreviation}</span> : null}</button>)}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 14 }}><span>{title}</span><span style={{ fontWeight: 600, color: '#5b5347', fontSize: 13 }}>n {n.toLocaleString('en-US')}</span></div>
      <div role="img" aria-label={label} style={{ display: 'flex', height: 18, borderRadius: 6, overflow: 'hidden', gap: 1, marginTop: 6, background: C.soft }}>
        {parts.map(p => <span key={p.key} style={{ width: `${pct(p.count, n)}%`, background: p.color }} />)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6, fontSize: 12.5, color: '#3a352c' }}>
        {parts.map(p => <span key={p.key}><span aria-hidden style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: p.color, marginRight: 5 }} />{p.label} <b>{fmt(pct(p.count, n))}</b></span>)}
      </div>
    </div>
  )
}

const dots = (ps: PairPitch[], upTo = ps.length, current = -1) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    {ps.map((p, i) => <span key={i} style={{ opacity: i < upTo ? 1 : 0.22, transform: i === current ? 'scale(1.25)' : undefined, transition: 'opacity .2s, transform .2s' }}><PitchDot t={p.t} size={20} ring={p.r === 'whiff'} title={`${pitchLabel(p.t)}${p.r ? ` · ${PITCH_RESULT[p.r] ?? p.r}` : ''}`} /></span>)}
  </span>
)

/** One real pair, stepped through a pitch at a time: the dots light up in order with a plain-words caption. */
function PairPlayer({ pair, stand, names, onClose }: { pair: RecentPair; stand: 'L' | 'R'; names: Record<number, string>; onClose: () => void }) {
  const all = [...pair.first.map(p => ({ p, at: 1 })), ...pair.second.map(p => ({ p, at: 2 }))]
  const [i, setI] = useState(0)
  useEffect(() => {
    setI(0)
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setI(all.length); return }
    const t = setInterval(() => setI(x => (x >= all.length ? x : x + 1)), 900)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair])
  const cur = Math.min(i, all.length) - 1
  const c = cur >= 0 ? all[cur] : null
  const firstN = pair.first.length
  return (
    <div style={{ ...tile, marginTop: 12, background: '#faf8f3' }} aria-live="polite">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={kick}>Playing · {names[pair.pitcherId] ?? 'Pitcher'} to {names[pair.batterId] ?? 'batter'} · {dateShort(pair.date)}</div>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <button type="button" onClick={() => setI(0)} style={{ background: 'none', border: 0, color: C.orange, fontWeight: 800, cursor: 'pointer', font: 'inherit', fontSize: 13 }}>Replay</button>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 0, color: C.mute, fontWeight: 800, cursor: 'pointer', font: 'inherit', fontSize: 13 }}>Close</button>
        </span>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><b style={{ width: 120, fontSize: 13 }}>First time through</b>{dots(pair.first, Math.min(i, firstN), cur < firstN ? cur : -1)}<b style={{ fontSize: 13 }}>{i >= firstN ? FIRST_SHORT[pair.firstClass] ?? pair.firstClass : ''}</b></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><b style={{ width: 120, fontSize: 13 }}>Second time through</b>{dots(pair.second, Math.max(0, i - firstN), cur >= firstN ? cur - firstN : -1)}<b style={{ fontSize: 13 }}>{i >= all.length ? ENDED[pair.ended] ?? pair.ended : ''}</b></div>
      </div>
      <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, minHeight: 22 }}>
        {c ? <>{c.at === 1 ? 'First' : 'Second'} time through, pitch {c.at === 1 ? cur + 1 : cur - firstN + 1}: {pitchLabel(c.p.t)}{zoneLabel(c.p.z, stand) ? `, ${zoneLabel(c.p.z, stand)}` : ''}{c.p.r ? `, ${PITCH_RESULT[c.p.r] ?? c.p.r}` : ''}</> : <span style={{ color: C.mute, fontWeight: 600 }}>Starting…</span>}
      </div>
    </div>
  )
}

export default function SecondLook({ filters, data, season, lockedNode, nameOfScope }: { filters: SlFilters; data: SlData | null; season: number; lockedNode: ReactNode | null; nameOfScope: string | null }) {
  const router = useRouter()
  const [playing, setPlaying] = useState<number | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const go = (patch: Partial<{ hand: string; stand: string; ended: string; pitch: string | null; opened: string | null; scope: string; id: number | null }>) => {
    const next = { hand: filters.hand, stand: filters.stand, ended: filters.result, pitch: filters.pitch, opened: filters.opened ?? null, scope: filters.scope, id: filters.id, ...patch }
    const q = new URLSearchParams()
    q.set('hand', next.hand); q.set('stand', next.stand); q.set('ended', next.ended)
    if (next.pitch) q.set('pitch', next.pitch)
    if (next.opened && next.scope === 'league') q.set('opened', next.opened)
    if (next.scope !== 'league') { q.set('scope', next.scope); if (next.id) q.set('id', String(next.id)) }
    setPlaying(null)
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

  const addToCard = (p: RecentPair, k: number) => {
    const ok = savePair({ id: `${p.date}-${p.pitcherId}-${p.batterId}-${p.first.length}-${p.second.length}`, savedAt: new Date().toISOString(), hand: filters.hand, stand: filters.stand, ended: filters.result, pitch: pitch ?? '', date: p.date, pitcher: data?.names[p.pitcherId] ?? 'Pitcher', batter: data?.names[p.batterId] ?? 'Batter', first: p.first, second: p.second, result: ENDED[p.ended] ?? p.ended })
    setSaved(ok ? `Saved. Find it under Game Plan Card, then Build your own card.` : 'Could not save in this browser (storage is blocked).')
    void k
  }

  return (
    <div style={{ fontFamily: SANS, color: C.ink }}>
      <PageHead kicker="Sequencing Lab · Second Look" title="The next time he sees him" intro="Catchers say a hitter hunts the pitch that got him out. Choose how a hitter's first time through went against a pitcher: what the at-bat opened with, how it ended and on which pitch. Then see what the pitcher opened with the second time through, and how that at-bat ended." />

      <div style={{ ...tile, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 28px' }}>
          <PillGroup label="Pitcher throws" items={[['R', 'Right'], ['L', 'Left']]} value={filters.hand} onChange={v => go({ hand: v, pitch: null, opened: null })} />
          <PillGroup label="Batter hits" items={[['L', 'Left'], ['R', 'Right']]} value={filters.stand} onChange={v => go({ stand: v, pitch: null, opened: null })} />
          <PillGroup label="Look at" items={[['league', 'League'], ['pitcher', 'This pitcher (Pro)'], ['batter', 'This hitter (Pro)']] as [Scope, string][]} value={filters.scope} onChange={v => go({ scope: v, id: null, opened: null })} />
        </div>
        {filters.scope !== 'league' && (
          <div>
            <div style={{ ...kick, color: C.faint, marginBottom: 6 }}>{filters.scope === 'pitcher' ? 'Find a pitcher' : 'Find a hitter'}{filters.id && nameOfScope ? ` · showing ${nameOfScope}` : ''}</div>
            <PlayerPick placeholder={filters.scope === 'pitcher' ? 'Pitcher name' : 'Hitter name'} onPick={id => go({ id })} />
          </div>
        )}
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
          <div style={{ ...kick, color: C.orange, marginBottom: 10 }}>The first time through</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 28px' }}>
            {filters.scope === 'league' && (data?.openers.length ?? 0) > 0 && <PillGroup label="The at-bat opened with" items={[['', 'Any pitch'], ...(data?.openers ?? []).filter(o => o.n >= MIN).slice(0, 8).map(o => [o.t, <span key={o.t} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span aria-hidden style={{ width: 11, height: 11, borderRadius: '50%', background: dotColor(o.t), border: '1px solid #1A1A1A' }} />{pitchLabel(o.t)}</span>] as [string, ReactNode])] as [string, ReactNode][]} value={filters.opened ?? ''} onChange={v => go({ opened: v || null, pitch: null })} />}
            <PillGroup label="The at-bat ended in" items={(Object.keys(RESULT_LABEL) as ResultClass[]).map(k => [k, RESULT_LABEL[k]] as [ResultClass, string])} value={filters.result} onChange={v => go({ ended: v, pitch: null, opened: null })} />
            {types.length > 0 && <PillGroup label="On this last pitch" items={types.map(t => [t.t, <span key={t.t} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span aria-hidden style={{ width: 11, height: 11, borderRadius: '50%', background: dotColor(t.t), border: '1px solid #1A1A1A' }} />{pitchLabel(t.t)}</span>] as [string, ReactNode])} value={pitch ?? ''} onChange={v => go({ pitch: v })} />}
          </div>
        </div>
      </div>

      {!data ? (
        <div style={{ ...tile, marginTop: 16 }}><p style={{ ...note, margin: 0 }}>The Second Look numbers could not be loaded right now.</p></div>
      ) : !pitch ? (
        <div style={{ ...tile, marginTop: 16, borderStyle: 'dashed' }}><p style={{ ...note, margin: 0 }}>No {season} pairs match this selection. Try the other hand or side.</p></div>
      ) : (
        <>
          <h2 style={{ margin: '20px 0 4px', fontSize: 'clamp(18px, 2.4vw, 22px)', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.3, maxWidth: 900 }}>
            {filters.hand === 'R' ? 'Right' : 'Left'}-handed pitchers facing {filters.stand === 'L' ? 'left' : 'right'}-handed batters. <span style={{ color: C.orange }}>The first time through</span>, {filters.opened ? `the at-bat opened with ${article(pitchLabel(filters.opened))} ${pitchLabel(filters.opened).toLowerCase()} and ` : 'the at-bat '}ended in {RESULT_PHRASE[filters.result]} on {article(pName)} {pName}. <span style={{ color: C.orange }}>The second time through</span>, what did he open with, and how did it end?
          </h2>
          <div style={{ fontSize: 14, color: '#5b5347' }}>{lockedNode ? scopeText : <>{scopeText} · <b style={{ color: C.ink }}>n {(row?.n ?? 0).toLocaleString('en-US')}</b> second times through, same pitcher, same game</>}</div>

          {lockedNode ? <div style={{ marginTop: 16 }}>{lockedNode}</div> : !enough ? (
            <div style={{ ...tile, marginTop: 16, borderStyle: 'dashed', padding: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Small sample (n = {(row?.n ?? 0).toLocaleString('en-US')}){star}</div>
              <p style={note}>Each group needs at least {MIN} second times through before a rate is shown. Opened with the {pName || 'same pitch'} again: n {row?.opened ?? 0}. Opened with something else: n {row?.other ?? 0}.</p>
              {filters.scope !== 'league' && <button type="button" onClick={() => go({ scope: 'league', id: null })} style={{ marginTop: 10, fontFamily: SANS, fontWeight: 800, fontSize: 13, borderRadius: 999, padding: '8px 16px', border: `1px solid ${C.orange}`, background: '#fff1ea', color: C.orange, cursor: 'pointer' }}>Show the league instead</button>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 14, marginTop: 16 }}>
              <section style={tile} aria-label="First pitch of the second look">
                <div style={kick}>1 · The second time through: the first pitch</div>
                <h3 style={{ margin: '6px 0 2px', fontSize: 24, fontWeight: 800, letterSpacing: '-0.015em' }}>Second time through, he opened with the {pName} again: {Math.round(pct(row.opened, row.n))}%</h3>
                {baseShare(pitch) != null && <div style={{ fontSize: 14, color: '#5b5347' }}>Against {Math.round(baseShare(pitch) as number)}% on every 0-0 pitch to this side.</div>}
                <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
                  {mixRows.map(r => (
                    <div key={r.t} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr)', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: r.t === pitch ? 800 : 600 }}>{pitchLabel(r.t)}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ height: 12, width: `${(r.p / maxP) * 80}%`, background: dotColor(r.t), borderRadius: 3, minWidth: 4, boxShadow: '0 0 0 1px #1A1A1A33' }} /><b style={{ fontSize: 13 }}>{Math.round(r.p)}%</b></div>
                        {r.base != null && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}><span style={{ height: 6, width: `${(r.base / maxP) * 80}%`, background: '#cfc9ba', borderRadius: 3, minWidth: 3 }} /><span style={{ fontSize: 12, color: '#5b5347' }}>{Math.round(r.base)}% all 0-0</span></div>}
                      </div>
                    </div>
                  ))}
                </div>
                <p style={note}>Thick bar: the second time through, after the first time you chose above. Thin grey bar: every 0-0 pitch from this hand to this side.</p>
              </section>

              <section style={tile} aria-label="How the second look ended">
                <div style={kick}>2 · The second time through: how it ended</div>
                <h3 style={{ margin: '6px 0 2px', fontSize: 24, fontWeight: 800, letterSpacing: '-0.015em' }}>How the second at-bat ended</h3>
                <div style={{ fontSize: 14, color: '#5b5347' }}>Split by whether the second time through opened with the same pitch that ended the first.</div>
                <EndingBar title={`Second time through: opened with the ${pName} again`} n={row.opened} endings={row.endingsSame} />
                <EndingBar title="Second time through: opened with something else" n={row.other} endings={row.endingsOther} />
                <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 16, paddingTop: 10, fontSize: 14 }}>
                  {Math.abs(diff) < 1 ? 'Strikeouts were about as common either way.' : `Strikeouts were ${Math.abs(diff)} point${Math.abs(diff) === 1 ? '' : 's'} ${diff > 0 ? 'more' : 'less'} common when the second time through opened with the ${pName} again.`} Compare the sample sizes before reading much into it.
                  <div style={{ fontSize: 12, color: '#5b5347', marginTop: 4 }}>Walk includes hit by pitch.</div>
                </div>
              </section>
            </div>
          )}

          {!lockedNode && (
            <section style={{ ...tile, padding: 0, marginTop: 14, overflow: 'hidden' }} aria-label="Recent pairs that match">
              <div style={{ padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>⊕ Recent pairs that match</h3>
                <span style={{ fontSize: 13, color: '#5b5347' }}>First time through, then the second, same game. Each dot is a pitch in order; ring = swing and miss.</span>
              </div>
              {data.recent.length === 0 ? <p style={{ ...note, margin: 0, padding: '0 16px 14px' }}>No pairs to list for this selection.</p> : (
                <div style={{ overflowX: 'auto', borderTop: `1px solid ${C.line}` }}>
                  <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                    <thead><tr style={{ textAlign: 'left' }}>{['Date', 'Pitcher', 'Batter', 'First time through', 'Second time through', 'Second ended', ''].map((h, i) => <th key={i} style={{ padding: '9px 14px', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint, fontWeight: 800 }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {data.recent.map((p: RecentPair, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${C.soft}`, background: playing === i ? '#fff8f4' : undefined }}>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{dateShort(p.date)}</td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{data.names[p.pitcherId] ?? '—'}</td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{data.names[p.batterId] ?? '—'}</td>
                          <td style={{ padding: '10px 14px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{dots(p.first)}<b style={{ fontSize: 13 }}>{FIRST_SHORT[p.firstClass] ?? p.firstClass}</b></span></td>
                          <td style={{ padding: '10px 14px' }}>{dots(p.second)}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 800, whiteSpace: 'nowrap' }}>{ENDED[p.ended] ?? p.ended}</td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <button type="button" onClick={() => setPlaying(playing === i ? null : i)} style={{ fontFamily: SANS, fontWeight: 800, fontSize: 12, borderRadius: 999, padding: '5px 12px', border: `1px solid ${C.orange}`, background: playing === i ? C.orange : '#fff1ea', color: playing === i ? '#fff' : C.orange, cursor: 'pointer', marginRight: 6 }}>{playing === i ? 'Playing' : 'Play a pair'}</button>
                            <button type="button" onClick={() => addToCard(p, i)} style={{ fontFamily: SANS, fontWeight: 800, fontSize: 12, borderRadius: 999, padding: '5px 12px', border: `1px solid ${C.line}`, background: '#fff', color: C.ink, cursor: 'pointer' }}>Add to a Game Plan Card</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {playing != null && data.recent[playing] && <div style={{ padding: '0 16px 14px' }}><PairPlayer pair={data.recent[playing]} stand={filters.stand} names={data.names} onClose={() => setPlaying(null)} /></div>}
              {saved && <p role="status" style={{ ...note, margin: 0, padding: '0 16px 14px' }}>{saved}</p>}
            </section>
          )}
        </>
      )}

      <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 22, paddingTop: 12, fontSize: 12.5, color: '#5b5347', lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>How it is built: each hitter&apos;s first and second time through against the same pitcher in the same game (and the second and third), from the stored {season} pitches. Each pair counts once. Small sample under {MIN} second times through in a group. The &quot;0-0&quot; line is the first pitch of every plate appearance from that hand to that side.</p>
        <p style={{ margin: '6px 0 0' }}>This describes what has happened in {season}. It does not say what a hitter will do next time.</p>
      </div>
    </div>
  )
}
