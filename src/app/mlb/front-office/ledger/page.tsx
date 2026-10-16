// /mlb/front-office/ledger — placeholder until its data layer exists. Shows no numbers
// (empty state over fabricated data); the Pro card lists what will unlock.

import FoShell from '@/components/front-office/FoShell'
import UpgradeCard from '@/components/front-office/UpgradeCard'
import { Card, Empty } from '@/components/team/ui'

export const metadata = { title: 'The Ledger · Front Office · x9Lab' }

export default function Page() {
  return (
    <FoShell active="/mlb/front-office/ledger" kicker="Front Office" title="The Ledger">
      <p style={{ fontSize: 14, color: '#5b5347', maxWidth: 760, lineHeight: 1.5, margin: '12px 0 20px' }}>Who is under control, for how long, at what cost, and how much surplus each player carries over his contract.</p>
      <Card><Empty>Contract data is curated by hand and checked against the roster. It opens for the four clubs still playing, then all thirty.</Empty></Card>
      <div style={{ marginTop: 16 }}>
        <UpgradeCard title="The Ledger in Pro" features={['Per-team control timeline', 'Years under control', 'Filters by position and control status']} />
      </div>
    </FoShell>
  )
}
