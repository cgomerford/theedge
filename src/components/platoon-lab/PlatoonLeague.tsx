'use client'

// src/components/platoon-lab/PlatoonLeague.tsx
//
// Body of /mlb/lab/platoon: the league view of platoon splits (process gap against wOBA gap, one dot per hitter) with a way into any hitter's Platoon tab. Sign-up gate only (the page
// checks it). Props are plain data.

import { LeagueView, Panel, PlatoonShell, useReducedMotion, type LeagueDot } from './PlatoonView'
import HitterPicker from '@/components/contact-lab/HitterPicker'

export default function PlatoonLeague({ league, picker }: { league: { single: LeagueDot[]; pooled: LeagueDot[]; season: number }; picker: { id: number; name: string; team: string | null; n: number }[] }) {
  const reduce = useReducedMotion()
  return (
    <PlatoonShell reduce={reduce}>
      <header className="pl-head">
        <div>
          <div className="pl-crumb">LAB › BATTING LAB › PLATOON · {league.season}</div>
          <h1 className="pl-h1">Platoon Lab</h1>
          <p className="pl-sub">Whose split against left-handed and right-handed pitching shows up in the swing, and whose shows up only in the results? One dot per hitter.</p>
        </div>
        <div className="pl-ctl">
          <HitterPicker rows={picker} selectedId={0} selectedName="Find a hitter" target="platoon" />
        </div>
      </header>
      <div className="pl-grid" style={{ marginTop: 16 }}>
        <Panel code="PNL-06" title="LEAGUE VIEW" wide>
          <LeagueView sets={league} linkBase="/mlb/lab/batting-lab" />
          <p className="pl-fn" style={{ borderTop: 0, paddingTop: 0 }}>Switch hitters are left out: their split is between two batting sides. Click a dot to open that hitter’s Platoon tab. Updated weekly.</p>
        </Panel>
      </div>
      <footer className="pl-foot">Descriptions of what happened, with the sample behind each number.</footer>
    </PlatoonShell>
  )
}
