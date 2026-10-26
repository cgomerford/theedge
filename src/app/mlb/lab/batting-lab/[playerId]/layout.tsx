// src/app/mlb/lab/batting-lab/[playerId]/layout.tsx
//
// SERVER layout: the SIGN-UP gate for every /mlb/lab/batting-lab/[playerId]/* page. The lab UI itself (LabShell.tsx —
// the client layout with the header and tab bar) only renders for signed-up members; a signed-out visitor gets the
// sign-up card and none of the lab's client code or data requests run.
//
// Pro is NOT decided here any more. The tabs that were Pro before the Nerve Centre restructure (Overview, Vs Arsenal,
// Location Lab, Hot Zone Overlay, Sequencing, Trends, H2H) live in the (pro) route group, whose layout keeps the Pro
// gate exactly as it was; Contact and the other Nerve Centre tabs sit outside it, open to any signed-up member. The lab's
// Pro data APIs are gated separately (lib/require-pro.ts), so bypassing a page does not reach that data either.

import { isSignedIn } from '@/lib/require-signup'
import LabTabShell from '@/components/pro/LabTabShell'
import { ProGateRow } from '@/components/pro/ProGateView'
import LabShell from './LabShell'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMlbPerson } from '@/lib/mlb-person.server-fetch-allowed'
import { pageMeta } from '@/lib/seo'
import { fitDescription } from '@/lib/game-slug'

export async function generateMetadata({ params }: { params: Promise<{ playerId: string }> }): Promise<Metadata> {
  const { playerId } = await params
  const person = await getMlbPerson(Number(playerId))
  if (!person) notFound()
  return pageMeta({
    title: `${person.fullName} batting lab`,
    description: fitDescription(`${person.fullName} batting lab: contact quality, spray direction, swing decisions and zone breakdowns by pitch type, with the number of pitches or batted balls behind every stat.`, ['Free account.']),
    path: `/mlb/lab/batting-lab/${playerId}`,
  })
}

export default async function BattingLabGate({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const person = await getMlbPerson(Number(playerId))
  if (!person) notFound()
  if (!(await isSignedIn())) {
    // Signed out: the lab's own header and tab bar, and on every tab a barebones placeholder of that tab (labels only, no numbers)
    // with the create-account row, so a visitor can see what each tab is before signing up.
    return (
      <LabShell playerName={person.fullName}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 24px 60px' }}>
          <LabTabShell lab="batting" name={person.fullName} />
          <ProGateRow tier="anon" source="batting_lab" who={{ lab: 'batting', name: person.fullName }} />
        </div>
      </LabShell>
    )
  }
  return <LabShell playerName={person.fullName}>{children}</LabShell>
}
