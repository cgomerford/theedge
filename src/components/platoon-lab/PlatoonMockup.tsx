'use client'

// src/components/platoon-lab/PlatoonMockup.tsx
//
// Platoon Lab MOCKUP (/dev/platoon-mockup): demo hitters run through the SAME panels and the SAME model as the live pages (PlatoonView.tsx, src/lib/platoon/model.ts).
// Nothing here is real data. 404 in production.

import { useState } from 'react'
import { LeagueView, Panel, PlatoonPanels, PlatoonShell, useReducedMotion } from './PlatoonView'
import { DEMO_HITTERS, DEMO_META, leagueDemo } from './demo'
import { statOf, type Hand, type MetricKey } from '@/lib/platoon/model'

export default function PlatoonMockup({ initial }: { initial?: { hid?: 'A' | 'B' | 'C' | 'D'; side?: Hand } }) {
  const [hid, setHid] = useState<'A' | 'B' | 'C' | 'D'>(initial?.hid ?? 'A')
  const [side, setSide] = useState<Hand>(initial?.side ?? 'L')
  const [hot, setHot] = useState<MetricKey | null>(null)
  const reduce = useReducedMotion()
  const idx = ['A', 'B', 'C', 'D'].indexOf(hid)
  const h = DEMO_HITTERS[idx]
  const bs: Hand = h.bats === 'S' ? side : (h.bats as Hand)
  const rows = h.bySide[bs]
  const g = (m: MetricKey) => { const l = statOf(rows, m, 'L').mean, r = statOf(rows, m, 'R').mean; return l != null && r != null ? l - r : null }
  return (
    <PlatoonShell reduce={reduce}>
      <header className="pl-head">
        <div>
          <div className="pl-crumb">LAB › BATTING LAB › PLATOON <span className="pl-demo">DEMO DATA · /dev/platoon-mockup</span></div>
          <h1 className="pl-h1">Platoon Lab</h1>
          <p className="pl-sub">Is his split against lefties and righties real, or sample size? Process settles fast; results take years.</p>
        </div>
        <div className="pl-ctl">
          <div className="pl-seg" role="group" aria-label="Hitter">
            {DEMO_META.map((m, i) => <button key={m.id} type="button" aria-pressed={m.id === hid} className={m.id === hid ? 'on' : ''} onClick={() => setHid(m.id)}>{DEMO_HITTERS[i].name}<small> · {m.tag}</small></button>)}
          </div>
          {h.bats === 'S' && (
            <div className="pl-seg" role="group" aria-label="Batting side">
              <button type="button" aria-pressed={side === 'L'} className={side === 'L' ? 'on' : ''} onClick={() => setSide('L')}>Batting left</button>
              <button type="button" aria-pressed={side === 'R'} className={side === 'R' ? 'on' : ''} onClick={() => setSide('R')}>Batting right</button>
            </div>
          )}
        </div>
      </header>
      <PlatoonPanels hitter={h} side={bs} reduce={reduce} asOf={{ label: 'LAST GAME DAY', value: '2026-09-27 (demo)' }} hot={hot} setHot={setHot} />
      <div className="pl-grid" style={{ marginTop: 16 }}>
        <Panel code="PNL-06" title="LEAGUE VIEW · /mlb/lab/platoon" wide hl={hot === 'bat_speed' || hot === 'chase'}>
          <LeagueView sets={{ single: leagueDemo(false), pooled: leagueDemo(true) }} mine={{ name: h.name, batGap: g('bat_speed'), chaseGap: g('chase'), wobaGap: g('woba'), paL: statOf(rows, 'woba', 'L').n }} />
        </Panel>
      </div>
      <footer className="pl-foot">Descriptions of what happened, with the sample behind each number: never a recommendation about who should face whom. Mockup only; no data here is real.</footer>
    </PlatoonShell>
  )
}
