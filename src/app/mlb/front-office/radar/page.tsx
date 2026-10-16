// /mlb/front-office/radar — placeholder until its data layer exists. Shows no numbers
// (empty state over fabricated data); the Pro card lists what will unlock.

import FoShell from '@/components/front-office/FoShell'
import UpgradeCard from '@/components/front-office/UpgradeCard'
import { Card, Empty } from '@/components/team/ui'

export const metadata = { title: 'Breakout Radar · Front Office · x9Lab' }

export default function Page() {
  return (
    <FoShell active="/mlb/front-office/radar" kicker="Front Office" title="Breakout Radar">
      <p style={{ fontSize: 14, color: '#5b5347', maxWidth: 760, lineHeight: 1.5, margin: '12px 0 20px' }}>Pitchers and hitters whose process is ahead of their results: new pitches, velocity gains, bat-speed jumps.</p>
      <Card><Empty>This needs year-over-year Statcast changes and x9Lab's own pitch-quality model. Both are next in the build.</Empty></Card>
      <div style={{ marginTop: 16 }}>
        <UpgradeCard title="Breakout Radar in Pro" features={['Full list with sparklines', 'Pitch-quality grades', 'Filters and the weekly email']} />
      </div>
    </FoShell>
  )
}
