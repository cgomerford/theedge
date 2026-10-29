'use client'

// src/components/sequencing-lab/GamePlanCard.tsx
//
// Sequencing Lab → Game Plan Card: how a probable starter has fared against the opposing lineup's hitters, one line each: first pitch, opener, two strikes, damage zones and the second look.
// Every figure is read from the stored card (scripts/build_game_plan_cards.py) and carries its sample; a figure under its threshold shows "Small sample (n = X)" and no rate. When a line uses
// "hitters like him" (his cluster) instead of his own data, a small tag says so and reveals the cluster's plain label. Square boxes, 2px black borders, per the approved mockup.
// "Download card" saves the wristband view as a PNG (html-to-image); "Share to X" copies that image (links go in replies, not the post). Describes what has happened, never a forecast.

import Link from 'next/link'
import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { C, SANS } from '@/components/team/ui'
import { pitchLabel } from '@/lib/lab/pitch-meta'
import type { Card, CardArsenal, CardHitter, ClusterRef, Src } from '@/lib/game-plan/data'
import PitchDot from './PitchDot'

const INK = '#1A1A1A'
const box: React.CSSProperties = { background: '#fff', border: `2px solid ${INK}`, minWidth: 0 }
const kick: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#5b5347' }
const star = <span style={{ color: '#D4533B', fontWeight: 800 }}>*</span>
const LEVEL = ['#EDEAE2', '#FFC4B0', '#FF5722']
const CLASS_TEXT: Record<string, string> = { K: 'a K', OUT_IN_PLAY: 'an out in play', BB: 'a walk', HIT: 'a hit' }
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
const signed = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(0)}`)
const small = (n: number) => <span style={{ fontSize: 12, fontWeight: 700 }}>Small sample (n = {n.toLocaleString('en-US')}){star}</span>

function ClusterTag({ cluster, src }: { cluster: ClusterRef; src: Src }) {
  const [open, setOpen] = useState(false)
  if (src !== 'cluster' || !cluster) return null
  return (
    <span style={{ display: 'inline-block', marginTop: 3 }}>
      <button type="button" onClick={() => setOpen(o => !o)} title={cluster.label ?? 'hitters like him'} aria-expanded={open} style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', border: `1px solid ${INK}`, background: '#FDE047', padding: '1px 6px', cursor: 'pointer' }}>hitters like him</button>
      {open && <span style={{ display: 'block', fontSize: 11.5, color: '#3a352c', marginTop: 3, maxWidth: 190 }}>{cluster.label ?? 'grouped by chase, whiff and damage by pitch type'}</span>}
    </span>
  )
}

function Opener({ h }: { h: CardHitter }) {
  const o = h.opener
  if (!o) return <span style={{ fontSize: 12, color: '#5b5347' }}>No opener sample</span>
  const [a, b] = o.pitches
  const enough = o.k_pct != null && o.hit_pct != null
  const other = enough ? Math.max(0, 100 - (o.k_pct as number) - (o.hit_pct as number)) : 0
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5 }}>
        <PitchDot t={a} size={20} /> <span>{o.zones[0] ?? '—'}</span> <span aria-hidden>→</span> <PitchDot t={b} size={20} /> <span>{o.zones[1] ?? '—'}</span>
      </div>
      {enough ? (
        <>
          <div role="img" aria-label={`Strikeout ${o.k_pct}%, hit ${o.hit_pct}%, other ${other.toFixed(0)}%`} style={{ display: 'flex', height: 9, border: `1.5px solid ${INK}`, marginTop: 6, maxWidth: 200 }}>
            <span style={{ width: `${o.k_pct}%`, background: INK }} /><span style={{ width: `${o.hit_pct}%`, background: '#FF5722' }} /><span style={{ width: `${other}%`, background: '#E4DFD2' }} />
          </div>
          <div style={{ fontSize: 11, color: '#3a352c', marginTop: 3 }}>K {Math.round(o.k_pct as number)}% · hit {Math.round(o.hit_pct as number)}% · n {o.league_n.toLocaleString('en-US')} at-bats</div>
        </>
      ) : <div style={{ marginTop: 4 }}>{small(o.league_n)}</div>}
    </div>
  )
}

function Damage({ h }: { h: CardHitter }) {
  const d = h.damage_zones
  const has = d.levels.some(l => l != null)
  if (!has) return <span style={{ fontSize: 12 }}>{small(d.n)}</span>
  const words = d.levels.map((l, i) => `zone ${i + 1} ${l == null ? 'no read' : ['little', 'some', 'most'][l] + ' damage'}`).join(', ')
  return (
    <div>
      <div role="img" aria-label={`Damage zones, catcher's view: ${words}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 20px)', gap: 2 }}>
        {d.levels.map((l, i) => <span key={i} style={{ width: 20, height: 20, background: l == null ? '#F6F3EC' : LEVEL[l], border: l == null ? '1px dashed #cfc9ba' : `1px solid ${l === 2 ? INK : '#d8d2c4'}` }} />)}
      </div>
      <ClusterTag cluster={h.cluster} src={d.source} />
    </div>
  )
}

function SecondLookCell({ h, hand }: { h: CardHitter; hand: string }) {
  const s = h.second_look
  if (!s) return <span style={{ fontSize: 12, color: '#5b5347' }}>Not enough of his outs yet{star}</span>
  if (s.small || s.opened_same_pct == null) return <span style={{ fontSize: 12 }}>After {CLASS_TEXT[s.ended_class] ?? s.ended_class} on the {pitchLabel(s.ended_pitch).toLowerCase()}<br />{small(s.n)}</span>
  const same = s.opened_same_pct >= (s.top_other_pct ?? 0)
  const q = new URLSearchParams({ hand, stand: h.bats ?? 'R', ended: s.ended_class, pitch: s.ended_pitch })
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
      After {CLASS_TEXT[s.ended_class] ?? s.ended_class} on the {pitchLabel(s.ended_pitch).toLowerCase()}, {same ? 'his next look opened with it' : `next look opened with ${article(s.top_other ?? '')} ${pitchLabel(s.top_other).toLowerCase()}`} {Math.round(same ? s.opened_same_pct : (s.top_other_pct as number))}%{same ? ' of the time' : ''}
      <div style={{ fontSize: 11, color: '#3a352c', marginTop: 3 }}>n {s.n.toLocaleString('en-US')} second at-bats · <Link href={`/mlb/lab/sequencing/second-look?${q}`} style={{ color: INK, fontWeight: 800 }}>Open Second Look</Link></div>
      {s.source !== 'batter' && <div style={{ fontSize: 10.5, color: '#5b5347' }}>{s.source === 'cluster' ? 'hitters like him' : 'league line'}</div>}
    </div>
  )
}

const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : null)
const dateOf = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

function ArsenalTile({ a }: { a: CardArsenal }) {
  const rise = a.type === 'FF' || a.type === 'FC'
  return (
    <div style={{ ...box, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PitchDot t={a.type} size={26} /><span style={{ fontWeight: 800, fontSize: 14 }}>{pitchLabel(a.type)}</span></div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{Math.round(a.usage)}%</div>
      <div style={{ fontSize: 11.5, color: '#3a352c', lineHeight: 1.4 }}>{a.speed != null ? `${a.speed.toFixed(1)} mph` : '—'} · {rise ? `${signed(a.ivb)} rise` : `${signed(a.hb)} arm-side`}{a.stuff != null ? ` · Stuff ${a.stuff}` : ''}</div>
    </div>
  )
}

export default function GamePlanCard({ card, others }: { card: Card; others: { pitcherId: number; name: string; active: boolean; href: string }[] }) {
  const band = useRef<HTMLDivElement>(null)
  const [note, setNote] = useState<string | null>(null)
  const m = card.meta
  const hand = card.starter.hand
  const handTxt = hand === 'R' ? 'RHP' : 'LHP'
  const lineupNote = card.lineup_source === 'posted' ? 'Posted lineup' : `Recent lineup vs ${handTxt}`
  const png = async () => toPng(band.current as HTMLElement, { pixelRatio: 2, backgroundColor: INK, cacheBust: true })
  const download = async () => {
    if (!band.current) return
    try {
      const url = await png()
      const a = document.createElement('a'); a.href = url; a.download = `x9lab-game-plan-${card.starter.name.replace(/\s+/g, '-').toLowerCase()}-${m.date}.png`; a.click()
      setNote('Saved.')
    } catch { setNote('Could not make the image on this device.') }
  }
  const share = async () => {
    if (!band.current) return
    try {
      const blob = await (await fetch(await png())).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setNote('Image copied. Paste it into your post, and put any link in a reply.')
    } catch { setNote('Could not copy the image here. Use Download card instead.') }
  }

  return (
    <div style={{ fontFamily: SANS, color: INK }}>
      <div style={kick}>§ Sequencing Lab · Game Plan Card</div>
      <h1 style={{ margin: '6px 0 10px', fontSize: 'clamp(34px, 6vw, 60px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1 }}>How to read tonight&apos;s battery</h1>
      <p style={{ margin: '0 0 18px', fontSize: 17, lineHeight: 1.5, maxWidth: 760 }}>One line per hitter, the way a catcher&apos;s wristband card is built: first pitch, opener, two strikes, damage zones and the second look. Every figure is what has happened in {m.date.slice(0, 4)} against pitches and sequences like these, with the sample beside it.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 0, ...box, marginBottom: 18 }}>
        <div style={{ padding: 18, borderRight: `2px solid ${INK}`, borderBottom: `2px solid ${INK}` }}>
          <div style={kick}>Matchup</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em', margin: '4px 0' }}>{m.away.name} at {m.home.name}</div>
          <div style={{ fontSize: 13, color: '#3a352c' }}>{dateOf(m.date)}{timeOf(m.firstPitchUtc) ? ` · First pitch ${timeOf(m.firstPitchUtc)}` : ''}{m.venue ? ` · ${m.venue}` : ''}</div>
          <div style={{ ...kick, marginTop: 14 }}>Starter</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{card.starter.name} · {handTxt}</div>
          {others.length > 1 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>{others.map(o => <Link key={o.pitcherId} href={o.href} aria-current={o.active ? 'page' : undefined} style={{ fontSize: 12.5, fontWeight: 800, padding: '6px 10px', minHeight: 32, display: 'inline-flex', alignItems: 'center', border: `2px solid ${INK}`, background: o.active ? INK : '#fff', color: o.active ? '#fff' : INK, textDecoration: 'none' }}>{o.name}</Link>)}</div>}
        </div>
        <div style={{ padding: 18, borderBottom: `2px solid ${INK}` }}>
          <div style={kick}>Arsenal ({m.date.slice(0, 4)})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 8 }}>{card.arsenal.slice(0, 4).map(a => <ArsenalTile key={a.type} a={a} />)}</div>
        </div>
      </div>

      <div role="tablist" aria-label="Card views" style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 18 }}>
        {[["Tonight's card", true], ['Build your own card', false], ['After the game: card vs what was thrown', false]].map(([t, on], i) => (
          <button key={String(t)} type="button" role="tab" aria-selected={!!on} disabled={!on} title={on ? undefined : 'Coming soon'} style={{ minHeight: 44, padding: '8px 16px', fontFamily: SANS, fontWeight: 800, fontSize: 14, border: `2px solid ${INK}`, marginLeft: i ? -2 : 0, background: on ? INK : '#fff', color: on ? '#fff' : INK, opacity: on ? 1 : 0.5, cursor: on ? 'default' : 'not-allowed' }}>{String(t)}{on ? '' : ' · Coming soon'}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>⊕ The lineup, one line each</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, alignItems: 'center' }}>
          <span><b>{lineupNote}</b> · vs {card.batting.name}</span>
          {[['Most damage', LEVEL[2]], ['Some damage', LEVEL[1]], ['Little damage', LEVEL[0]]].map(([t, c]) => <span key={t}><span aria-hidden style={{ display: 'inline-block', width: 11, height: 11, background: c, border: '1px solid #1A1A1A', marginRight: 5, verticalAlign: -1 }} />{t}</span>)}
          <span>{star} Small sample</span>
        </div>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 8, border: `2px solid ${INK}`, background: '#fff' }}>
        <table style={{ width: '100%', minWidth: 1040, borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr style={{ background: INK, color: '#fff', textAlign: 'left' }}>{['Hitter', 'First pitch', 'Opener (first two pitches)', 'Two strikes', 'Damage zones', 'Second look'].map(h => <th key={h} style={{ padding: '10px 14px', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 800 }}>{h}</th>)}</tr></thead>
          <tbody>
            {card.hitters.map(h => (
              <tr key={h.id} style={{ borderTop: `1px solid ${C.line}`, verticalAlign: 'top' }}>
                <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}><span style={{ fontSize: 24, fontWeight: 800, marginRight: 10 }}>{h.slot}</span><b style={{ fontSize: 14 }}>{h.name}</b><div style={{ fontSize: 11.5, color: '#5b5347', marginLeft: 28 }}>{h.bats ? `Bats ${h.bats}` : 'Side not recorded'}</div></td>
                <td style={{ padding: '12px 14px' }}>{h.first_pitch.value != null ? (<><div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{Math.round(h.first_pitch.value)}%</div><div style={{ fontSize: 11, color: '#3a352c' }}>swing at 0-0 · n {h.first_pitch.n.toLocaleString('en-US')}</div><ClusterTag cluster={h.cluster} src={h.first_pitch.source} /></>) : small(h.first_pitch.n)}</td>
                <td style={{ padding: '12px 14px' }}><Opener h={h} /></td>
                <td style={{ padding: '12px 14px' }}>{h.two_strikes ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PitchDot t={h.two_strikes.type} size={22} />{h.two_strikes.whiff_pct != null ? <b style={{ fontSize: 14 }}>{Math.round(h.two_strikes.whiff_pct)}% whiff</b> : small(h.two_strikes.swings)}</div>
                    <div style={{ fontSize: 11, color: '#3a352c', marginTop: 3 }}>{h.two_strikes.zone ?? '—'} · n {h.two_strikes.swings.toLocaleString('en-US')} swings</div>
                    <ClusterTag cluster={h.cluster} src={h.two_strikes.source} />
                  </div>
                ) : <span style={{ fontSize: 12, color: '#5b5347' }}>No two-strike sample</span>}</td>
                <td style={{ padding: '12px 14px' }}><Damage h={h} /></td>
                <td style={{ padding: '12px 14px', minWidth: 230 }}><SecondLookCell h={h} hand={hand} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: '#5b5347', margin: '8px 0 0', lineHeight: 1.55 }}>Hitter lines use hitters like him (grouped by chase, whiff and damage by pitch type) unless his own sample reaches the threshold. Opener and two-strike figures are this pitcher&apos;s pitch shapes against the league; two-strike n is swings. Damage is xwOBA on contact against {hand === 'R' ? 'right' : 'left'}-handers by the league tertiles in the same zone. Zones are from the catcher&apos;s view. Pitches before {card.pitches_before} only.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', margin: '28px 0 8px' }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>⊕ Wristband view</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {note && <span role="status" style={{ fontSize: 12.5, color: '#5b5347' }}>{note}</span>}
          <button type="button" onClick={download} style={{ minHeight: 44, padding: '8px 16px', fontFamily: SANS, fontWeight: 800, fontSize: 14, border: `2px solid ${INK}`, background: '#fff', cursor: 'pointer' }}>Download card</button>
          <button type="button" onClick={share} style={{ minHeight: 44, padding: '8px 16px', fontFamily: SANS, fontWeight: 800, fontSize: 14, border: `2px solid ${INK}`, background: '#FF5722', color: '#fff', cursor: 'pointer' }}>Share to X</button>
        </div>
      </div>
      <div ref={band} style={{ background: INK, color: '#fff', padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', paddingBottom: 10 }}>
          <span>{card.starter.name} vs {card.batting.abbr ?? card.batting.name} · {dateOf(m.date)}</span>
          <span><span style={{ color: '#FF5722' }}>x9</span>LAB · What has happened, not a forecast</span>
        </div>
        <style>{`.gp-band{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}@media (max-width:700px){.gp-band{grid-template-columns:minmax(0,1fr)}}`}</style>
        <div className="gp-band">
          {card.hitters.map(h => (
            <div key={h.id} style={{ border: '1px solid #4a463d', padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontSize: 34, fontWeight: 800, color: '#FDE047', lineHeight: 1 }}>{h.slot}</span><b style={{ fontSize: 14, color: '#FDE047' }}>{h.bats ?? '?'}</b><span style={{ marginLeft: 4, color: '#cfc9ba', fontSize: 11 }}>{h.name}</span></div>
              <div>0-0: {h.first_pitch.value != null ? `swings ${Math.round(h.first_pitch.value)}%` : 'small sample'}</div>
              <div>Open: {h.opener ? `${h.opener.pitches[0]} ${h.opener.zones[0] ?? ''} → ${h.opener.pitches[1]} ${h.opener.zones[1] ?? ''}` : '—'}</div>
              <div>2K: {h.two_strikes ? `${h.two_strikes.type} ${h.two_strikes.zone ?? ''}` : '—'}</div>
              <div>Damage: {h.damage_zones.worst ?? '—'}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: `2px solid ${INK}`, marginTop: 24, paddingTop: 12, fontSize: 12.5, color: '#5b5347', lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>Source: {m.date.slice(0, 4)} Statcast pitches before {card.pitches_before}, built from the Sequencing Lab at-bat index and the stored Second Look pairs. Each at-bat counts once. {lineupNote}{card.lineup_source === 'recent_vs_hand' ? `: this club's most common lineup against ${hand === 'R' ? 'right' : 'left'}-handed starters over the last 14 days` : ''}.</p>
        <p style={{ margin: '6px 0 0' }}>This card describes what has happened against pitches and sequences like these. It does not say what will happen.</p>
      </div>
    </div>
  )
}
