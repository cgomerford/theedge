'use client'

// src/components/sequencing-lab/GamePlanCells.tsx
//
// The pieces of a Game Plan Card line, shared by "Tonight's card" and "Build your own card": the five cells of a hitter's row (first pitch, opener, two strikes, damage zones, second
// look), the "hitters like him" tag, the lineup table and the wristband view with its PNG download. Every figure carries its sample; a figure under its threshold shows
// "Small sample (n = X)" and no rate. Same look as the other lab pages. Describes what has happened, never a forecast.

import Link from 'next/link'
import { useRef, useState, type ReactNode } from 'react'
import { toPng } from 'html-to-image'
import { C, SANS } from '@/components/team/ui'
import { pitchLabel } from '@/lib/lab/pitch-meta'
import type { Card, CardHitter, ClusterRef, Src } from '@/lib/game-plan/data'
import PitchDot from './PitchDot'
import { star } from './ui'

export const LEVEL = ['#EDEAE2', '#FFC4B0', '#FF5722']
const CLASS_TEXT: Record<string, string> = { K: 'a K', OUT_IN_PLAY: 'an out in play', BB: 'a walk', HIT: 'a hit' }
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
export const small = (n: number) => <span style={{ fontSize: 12, fontWeight: 700 }}>Small sample (n = {n.toLocaleString('en-US')}){star}</span>

export type Cols = { first: boolean; opener: boolean; two: boolean; damage: boolean; second: boolean }
export const ALL_COLS: Cols = { first: true, opener: true, two: true, damage: true, second: true }

export function ClusterTag({ cluster, src }: { cluster: ClusterRef; src: Src }) {
  const [open, setOpen] = useState(false)
  if (src !== 'cluster' || !cluster) return null
  return (
    <span style={{ display: 'inline-block', marginTop: 3 }}>
      <button type="button" onClick={() => setOpen(o => !o)} title={cluster.label ?? 'hitters like him'} aria-expanded={open} style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', border: `1px solid ${C.line}`, borderRadius: 999, background: '#FEF3C7', padding: '1px 8px', cursor: 'pointer', color: C.ink }}>hitters like him</button>
      {open && <span style={{ display: 'block', fontSize: 11.5, color: '#3a352c', marginTop: 3, maxWidth: 190 }}>{cluster.label ?? 'grouped by chase, whiff and damage by pitch type'}</span>}
    </span>
  )
}

export function Opener({ h }: { h: CardHitter }) {
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
          <div role="img" aria-label={`Strikeout ${o.k_pct}%, hit ${o.hit_pct}%, other ${other.toFixed(0)}%`} style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1, marginTop: 6, maxWidth: 200, background: C.soft }}>
            <span style={{ width: `${o.k_pct}%`, background: C.ink }} /><span style={{ width: `${o.hit_pct}%`, background: '#FF5722' }} /><span style={{ width: `${other}%`, background: '#E4DFD2' }} />
          </div>
          <div style={{ fontSize: 11, color: '#3a352c', marginTop: 3 }}>K {Math.round(o.k_pct as number)}% · hit {Math.round(o.hit_pct as number)}% · n {o.league_n.toLocaleString('en-US')} at-bats</div>
        </>
      ) : <div style={{ marginTop: 4 }}>{small(o.league_n)}</div>}
    </div>
  )
}

export function Damage({ h }: { h: CardHitter }) {
  const d = h.damage_zones
  if (!d.levels.some(l => l != null)) return <span style={{ fontSize: 12 }}>{small(d.n)}</span>
  const words = d.levels.map((l, i) => `zone ${i + 1} ${l == null ? 'no read' : ['little', 'some', 'most'][l] + ' damage'}`).join(', ')
  return (
    <div>
      <div role="img" aria-label={`Damage zones, catcher's view: ${words}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 20px)', gap: 2 }}>
        {d.levels.map((l, i) => <span key={i} style={{ width: 20, height: 20, borderRadius: 3, background: l == null ? '#F6F3EC' : LEVEL[l], border: l == null ? '1px dashed #cfc9ba' : `1px solid ${l === 2 ? C.ink : '#d8d2c4'}` }} />)}
      </div>
      <ClusterTag cluster={h.cluster} src={d.source} />
    </div>
  )
}

export function SecondLookCell({ h, hand }: { h: CardHitter; hand: string }) {
  const s = h.second_look
  if (!s) return <span style={{ fontSize: 12, color: '#5b5347' }}>Not enough of his outs yet{star}</span>
  if (s.small || s.opened_same_pct == null) return <span style={{ fontSize: 12 }}>After {CLASS_TEXT[s.ended_class] ?? s.ended_class} on the {pitchLabel(s.ended_pitch).toLowerCase()}<br />{small(s.n)}</span>
  const same = s.opened_same_pct >= (s.top_other_pct ?? 0)
  const q = new URLSearchParams({ hand, stand: h.bats ?? 'R', ended: s.ended_class, pitch: s.ended_pitch })
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
      After {CLASS_TEXT[s.ended_class] ?? s.ended_class} on the {pitchLabel(s.ended_pitch).toLowerCase()}, {same ? 'his next look opened with it' : `next look opened with ${article(s.top_other ?? '')} ${pitchLabel(s.top_other).toLowerCase()}`} {Math.round(same ? s.opened_same_pct : (s.top_other_pct as number))}%{same ? ' of the time' : ''}
      <div style={{ fontSize: 11, color: '#3a352c', marginTop: 3 }}>n {s.n.toLocaleString('en-US')} second at-bats · <Link href={`/mlb/lab/sequencing/second-look?${q}`} style={{ color: C.orange, fontWeight: 800 }}>Open Second Look</Link></div>
      {s.source !== 'batter' && <div style={{ fontSize: 10.5, color: '#5b5347' }}>{s.source === 'cluster' ? 'hitters like him' : 'league line'}</div>}
    </div>
  )
}

const TH: React.CSSProperties = { padding: '9px 14px', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.faint, fontWeight: 800, textAlign: 'left', background: '#f1eee6' }

/** The lineup table. `extra` adds a leading control cell per row (used by Build your own card); `notes` shows a note under a hitter's name. */
export function LineupTable({ hitters, hand, cols = ALL_COLS, lead, notes }: { hitters: CardHitter[]; hand: 'L' | 'R'; cols?: Cols; lead?: (h: CardHitter, i: number) => ReactNode; notes?: Record<string, string> }) {
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: 14, background: '#fff' }}>
      <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
        <thead><tr>{lead && <th style={TH} />}<th style={TH}>Hitter</th>{cols.first && <th style={TH}>First pitch</th>}{cols.opener && <th style={TH}>Opener (first two pitches)</th>}{cols.two && <th style={TH}>Two strikes</th>}{cols.damage && <th style={TH}>Damage zones</th>}{cols.second && <th style={TH}>Second look</th>}</tr></thead>
        <tbody>
          {hitters.map((h, i) => (
            <tr key={h.id} style={{ borderTop: `1px solid ${C.soft}`, verticalAlign: 'top' }}>
              {lead && <td style={{ padding: '12px 8px 12px 14px' }}>{lead(h, i)}</td>}
              <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 22, fontWeight: 800, marginRight: 10 }}>{i + 1}</span><b style={{ fontSize: 14 }}>{h.name}</b>
                <div style={{ fontSize: 11.5, color: '#5b5347', marginLeft: 26 }}>{h.bats ? `Bats ${h.bats}` : 'Side not recorded'}</div>
                {notes?.[String(h.id)] && <div style={{ fontSize: 11.5, color: C.orange, marginLeft: 26, maxWidth: 190, whiteSpace: 'normal', fontWeight: 700 }}>{notes[String(h.id)]}</div>}
              </td>
              {cols.first && <td style={{ padding: '12px 14px' }}>{h.first_pitch.value != null ? (<><div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>{Math.round(h.first_pitch.value)}%</div><div style={{ fontSize: 11, color: '#3a352c' }}>swing at 0-0 · n {h.first_pitch.n.toLocaleString('en-US')}</div><ClusterTag cluster={h.cluster} src={h.first_pitch.source} /></>) : small(h.first_pitch.n)}</td>}
              {cols.opener && <td style={{ padding: '12px 14px' }}><Opener h={h} /></td>}
              {cols.two && <td style={{ padding: '12px 14px' }}>{h.two_strikes ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PitchDot t={h.two_strikes.type} size={22} />{h.two_strikes.whiff_pct != null ? <b style={{ fontSize: 14 }}>{Math.round(h.two_strikes.whiff_pct)}% whiff</b> : small(h.two_strikes.swings)}</div>
                  <div style={{ fontSize: 11, color: '#3a352c', marginTop: 3 }}>{h.two_strikes.zone ?? '—'} · n {h.two_strikes.swings.toLocaleString('en-US')} swings</div>
                  <ClusterTag cluster={h.cluster} src={h.two_strikes.source} />
                </div>
              ) : <span style={{ fontSize: 12, color: '#5b5347' }}>No two-strike sample</span>}</td>}
              {cols.damage && <td style={{ padding: '12px 14px' }}><Damage h={h} /></td>}
              {cols.second && <td style={{ padding: '12px 14px', minWidth: 230 }}><SecondLookCell h={h} hand={hand} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const dateOf = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** The wristband view: one black panel, a 3 by 3 grid of hitters, with Download card (PNG) and Share to X (copies the image; links go in replies). */
export function Wristband({ card, hitters, notes }: { card: Card; hitters: CardHitter[]; notes?: Record<string, string> }) {
  const band = useRef<HTMLDivElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const png = async () => toPng(band.current as HTMLElement, { pixelRatio: 2, backgroundColor: '#1A1A1A', cacheBust: true })
  const download = async () => {
    if (!band.current) return
    try {
      const a = document.createElement('a'); a.href = await png(); a.download = `x9lab-game-plan-${card.starter.name.replace(/\s+/g, '-').toLowerCase()}-${card.meta.date}.png`; a.click(); setMsg('Saved.')
    } catch { setMsg('Could not make the image on this device.') }
  }
  const share = async () => {
    if (!band.current) return
    try {
      const blob = await (await fetch(await png())).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setMsg('Image copied. Paste it into your post, and put any link in a reply.')
    } catch { setMsg('Could not copy the image here. Use Download card instead.') }
  }
  const btn: React.CSSProperties = { fontFamily: SANS, fontWeight: 800, fontSize: 13, borderRadius: 999, padding: '8px 16px', cursor: 'pointer' }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
        {msg && <span role="status" style={{ fontSize: 12.5, color: '#5b5347' }}>{msg}</span>}
        <button type="button" onClick={download} style={{ ...btn, border: `1px solid ${C.line}`, background: '#fff', color: C.ink }}>Download card</button>
        <button type="button" onClick={share} style={{ ...btn, border: `1px solid ${C.orange}`, background: C.orange, color: '#fff' }}>Share to X</button>
      </div>
      <div ref={band} style={{ background: '#1A1A1A', color: '#fff', padding: 16, borderRadius: 14 }}>
        <style>{`.gp-band{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}@media (max-width:700px){.gp-band{grid-template-columns:minmax(0,1fr)}}`}</style>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', paddingBottom: 10 }}>
          <span>{card.starter.name} vs {card.batting.abbr ?? card.batting.name} · {dateOf(card.meta.date)}</span>
          <span><span style={{ color: '#FF5722' }}>x9</span>LAB · What has happened, not a forecast</span>
        </div>
        <div className="gp-band">
          {hitters.map((h, i) => (
            <div key={h.id} style={{ border: '1px solid #4a463d', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontSize: 34, fontWeight: 800, color: '#FDE047', lineHeight: 1 }}>{i + 1}</span><b style={{ fontSize: 14, color: '#FDE047' }}>{h.bats ?? '?'}</b><span style={{ marginLeft: 4, color: '#cfc9ba', fontSize: 11 }}>{h.name}</span></div>
              <div>0-0: {h.first_pitch.value != null ? `swings ${Math.round(h.first_pitch.value)}%` : 'small sample'}</div>
              <div>Open: {h.opener ? `${h.opener.pitches[0]} ${h.opener.zones[0] ?? ''} → ${h.opener.pitches[1]} ${h.opener.zones[1] ?? ''}` : '—'}</div>
              <div>2K: {h.two_strikes ? `${h.two_strikes.type} ${h.two_strikes.zone ?? ''}` : '—'}</div>
              <div>Damage: {h.damage_zones.worst ?? '—'}</div>
              {notes?.[String(h.id)] && <div style={{ color: '#FDE047', marginTop: 2 }}>Note: {notes[String(h.id)]}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
