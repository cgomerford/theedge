'use client'

// src/components/sequencing-lab/GamePlanCard.tsx
//
// Sequencing Lab → Game Plan Card: how a probable starter has fared against the opposing lineup's hitters, one line each. The page is the matchup and arsenal, then the site's own tabs:
// Tonight's card (the lineup table and the wristband view), Build your own card, and After the game: card vs what was thrown. Every figure is read from the stored card
// (scripts/build_game_plan_cards.py) with its sample. Describes what has happened, never a forecast.

import Link from 'next/link'
import { Suspense, useState } from 'react'
import Tabs from '@/components/ui/Tabs'
import { C, SANS } from '@/components/team/ui'
import { pitchLabel } from '@/lib/lab/pitch-meta'
import type { Card, CardArsenal } from '@/lib/game-plan/data'
import PitchDot from './PitchDot'
import GamePlanAfter from './GamePlanAfter'
import GamePlanBuild from './GamePlanBuild'
import { ALL_COLS, LEVEL, LineupTable, Wristband } from './GamePlanCells'
import { PageHead, kick, star, tile } from './ui'

const signed = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(0)}`)
const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : null)
const dateOf = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

function ArsenalTile({ a }: { a: CardArsenal }) {
  const rise = a.type === 'FF' || a.type === 'FC'
  return (
    <div style={{ ...tile, padding: '10px 12px', background: '#faf8f3' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PitchDot t={a.type} size={26} /><span style={{ fontWeight: 800, fontSize: 14 }}>{pitchLabel(a.type)}</span></div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{Math.round(a.usage)}%</div>
      <div style={{ fontSize: 11.5, color: '#3a352c', lineHeight: 1.4 }}>{a.speed != null ? `${a.speed.toFixed(1)} mph` : '—'} · {rise ? `${signed(a.ivb)} rise` : `${signed(a.hb)} arm-side`}{a.stuff != null ? ` · Stuff ${a.stuff}` : ''}</div>
    </div>
  )
}

export default function GamePlanCard({ card, others }: { card: Card; others: { pitcherId: number; name: string; active: boolean; href: string }[] }) {
  const [view, setView] = useState('card')
  const m = card.meta
  const hand = card.starter.hand
  const handTxt = hand === 'R' ? 'RHP' : 'LHP'
  const lineupNote = card.lineup_source === 'posted' ? 'Posted lineup' : `Recent lineup vs ${handTxt}`

  const tonight = (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>⊕ The lineup, one line each</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, alignItems: 'center' }}>
          <span><b>{lineupNote}</b> · vs {card.batting.name}</span>
          {[['Most damage', LEVEL[2]], ['Some damage', LEVEL[1]], ['Little damage', LEVEL[0]]].map(([t, c]) => <span key={t}><span aria-hidden style={{ display: 'inline-block', width: 11, height: 11, borderRadius: 2, background: c, border: '1px solid #1A1A1A', marginRight: 5, verticalAlign: -1 }} />{t}</span>)}
          <span>{star} Small sample</span>
        </div>
      </div>
      <LineupTable hitters={card.hitters} hand={hand} cols={ALL_COLS} />
      <p style={{ fontSize: 12, color: '#5b5347', margin: 0, lineHeight: 1.55 }}>Hitter lines use hitters like him (grouped by chase, whiff and damage by pitch type) unless his own sample reaches the threshold. Opener and two-strike figures are this pitcher&apos;s pitch shapes against the league; two-strike n is swings. Damage is xwOBA on contact against {hand === 'R' ? 'right' : 'left'}-handers by the league tertiles in the same zone. Zones are from the catcher&apos;s view. Pitches before {card.pitches_before} only.</p>
      <div style={{ ...kick, marginTop: 6 }}>⊕ Wristband view</div>
      <Wristband card={card} hitters={card.hitters} />
    </div>
  )

  return (
    <div style={{ fontFamily: SANS, color: C.ink }}>
      <PageHead kicker="Sequencing Lab · Game Plan Card" title="How to read tonight's battery" intro={`One line per hitter, the way a catcher's wristband card is built: first pitch, opener, two strikes, damage zones and the second look. Every figure is what has happened in ${m.date.slice(0, 4)} against pitches and sequences like these, with the sample beside it.`} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={tile}>
          <div style={kick}>Matchup</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: '4px 0' }}>{m.away.name} at {m.home.name}</div>
          <div style={{ fontSize: 13, color: '#3a352c' }}>{dateOf(m.date)}{timeOf(m.firstPitchUtc) ? ` · First pitch ${timeOf(m.firstPitchUtc)}` : ''}{m.venue ? ` · ${m.venue}` : ''}</div>
          <div style={{ ...kick, marginTop: 14 }}>Starter</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{card.starter.name} · {handTxt}</div>
          {others.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {others.map(o => <Link key={o.pitcherId} href={o.href} aria-current={o.active ? 'page' : undefined} style={{ fontSize: 12.5, fontWeight: 800, padding: '6px 12px', borderRadius: 999, border: `1px solid ${o.active ? C.orange : C.line}`, background: o.active ? '#fff1ea' : '#fff', color: o.active ? C.orange : C.ink, textDecoration: 'none' }}>{o.name}</Link>)}
            </div>
          )}
        </div>
        <div style={tile}>
          <div style={kick}>Arsenal ({m.date.slice(0, 4)})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 8 }}>{card.arsenal.slice(0, 4).map(a => <ArsenalTile key={a.type} a={a} />)}</div>
        </div>
      </div>

      <Suspense fallback={null}>
        <Tabs
          label="Card views" urlSync={false} sticky={false} value={view} onChange={setView}
          tabs={[{ id: 'card', label: "Tonight's card" }, { id: 'build', label: 'Build your own card' }, { id: 'after', label: 'After the game: card vs what was thrown' }]}
          panels={{
            card: <div style={{ paddingTop: 16 }}>{tonight}</div>,
            build: <div style={{ paddingTop: 16 }}><GamePlanBuild card={card} /></div>,
            after: <div style={{ paddingTop: 16 }}><GamePlanAfter card={card} active={view === 'after'} /></div>,
          }}
        />
      </Suspense>

      <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 24, paddingTop: 12, fontSize: 12.5, color: '#5b5347', lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>Source: {m.date.slice(0, 4)} Statcast pitches before {card.pitches_before}, built from the Sequencing Lab at-bat index and the stored Second Look pairs. Each at-bat counts once. {lineupNote}{card.lineup_source === 'recent_vs_hand' ? `: this club's most common lineup against ${hand === 'R' ? 'right' : 'left'}-handed starters over the last 14 days` : ''}.</p>
        <p style={{ margin: '6px 0 0' }}>This card describes what has happened against pitches and sequences like these. It does not say what will happen.</p>
      </div>
    </div>
  )
}
