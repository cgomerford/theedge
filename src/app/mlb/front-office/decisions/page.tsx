// /mlb/front-office/decisions — placeholder until its data layer exists. Shows no numbers
// (empty state over fabricated data); the Pro card lists what will unlock.

import FoShell from '@/components/front-office/FoShell'
import UpgradeCard from '@/components/front-office/UpgradeCard'
import { Card, Empty } from '@/components/team/ui'

export const metadata = { title: 'Swing Decisions · Front Office · x9Lab' }

export default function Page() {
  return (
    <FoShell active="/mlb/front-office/decisions" kicker="Front Office" title="Swing Decisions">
      <p style={{ fontSize: 14, color: '#5b5347', maxWidth: 760, lineHeight: 1.5, margin: '12px 0 20px' }}>Which hitters make the best swing and take choices, by zone and count.</p>
      <Card><Empty>This needs the incremental pitch-level Statcast pull and a swing and take run model. It follows the Ledger.</Empty></Card>
      <div style={{ marginTop: 16 }}>
        <UpgradeCard title="Swing Decisions in Pro" features={['Full leaderboard', 'Per-hitter zone grids', 'Count splits']} />
      </div>
    </FoShell>
  )
}
