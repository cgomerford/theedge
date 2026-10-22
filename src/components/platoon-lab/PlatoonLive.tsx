'use client'

// src/components/platoon-lab/PlatoonLive.tsx
//
// The live Platoon Lab for one hitter (the Batting Lab Platoon tab): the PlatoonView panels on real rows, with a batting-side toggle for a switch hitter (his sides are never
// mixed), and the league view with him highlighted. Sign-up gate only (the batting-lab layout checks it). Props are plain data.

import { useState } from 'react'
import Link from 'next/link'
import { LeagueView, Panel, PlatoonPanels, PlatoonShell, useReducedMotion, type LeagueDot } from './PlatoonView'
import { Empty } from '@/components/team/ui'
import { paOf, sidesOf, type Hand, type MetricKey, type PlatoonHitter } from '@/lib/platoon/model'

export default function PlatoonLive({ hitter, updated, league, mine }: {
  hitter: PlatoonHitter; updated: string
  league: { single: LeagueDot[]; pooled: LeagueDot[]; season: number } | null
  mine: { batGap: number | null; chaseGap: number | null; wobaGap: number | null; paL: number } | null
}) {
  const sides = sidesOf(hitter)
  const [side, setSide] = useState<Hand>(sides[0] ?? 'R')
  const [hot, setHot] = useState<MetricKey | null>(null)
  const reduce = useReducedMotion()
  if (sides.length === 0) return <Empty>No platoon data for this hitter yet.</Empty>
  const bs: Hand = hitter.bats === 'S' ? side : sides[0]
  return (
    <PlatoonShell reduce={reduce} embedded>
      <header className="pl-head">
        <div>
          <div className="pl-crumb">BATTING LAB › PLATOON · {hitter.season}{hitter.team ? ` · ${hitter.team}` : ''}</div>
          <h2 className="pl-h1" style={{ fontSize: 'clamp(26px,4vw,40px)' }}>{hitter.name}</h2>
          <p className="pl-sub">Is his split against lefties and righties real, or sample size? Every number shows its sample; process settles fast, results take years.</p>
        </div>
        <div className="pl-ctl">
          {hitter.bats === 'S' && (
            <div className="pl-seg" role="group" aria-label="Batting side">
              {sides.map(s => <button key={s} type="button" aria-pressed={bs === s} className={bs === s ? 'on' : ''} onClick={() => setSide(s)}>Batting {s === 'L' ? 'left' : 'right'}<small> · {paOf(hitter.bySide[s])} PA</small></button>)}
            </div>
          )}
        </div>
      </header>
      {hitter.bats === 'S' && (
        <p className="pl-fn" style={{ borderTop: 0, margin: '12px 0 0', fontSize: 12 }}>
          Switch hitter: he bats from the opposite side of the pitcher, so each batting side here mostly faces one pitcher hand and there is little same-side split to compare. The side toggle shows each side on its own; the two are never mixed.
        </p>
      )}
      <PlatoonPanels hitter={hitter} side={bs} reduce={reduce} asOf={{ label: 'UPDATED', value: updated }} hot={hot} setHot={setHot} />
      {league && (
        <div className="pl-grid" style={{ marginTop: 16 }}>
          <Panel code="PNL-06" title="LEAGUE VIEW" wide hl={hot === 'bat_speed' || hot === 'chase'}>
            <LeagueView sets={league} mine={mine ? { name: hitter.name, ...mine } : null} linkBase="/mlb/lab/batting-lab" />
            <p className="pl-fn" style={{ borderTop: 0, paddingTop: 0 }}>Switch hitters are left out of the league view: their split is between two batting sides. <Link href="/mlb/lab/platoon" style={{ color: 'var(--L)', fontWeight: 700 }}>Open the full league view</Link>.</p>
          </Panel>
        </div>
      )}
    </PlatoonShell>
  )
}
