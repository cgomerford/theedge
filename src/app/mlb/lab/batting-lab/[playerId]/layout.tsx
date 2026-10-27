// src/app/mlb/lab/batting-lab/[playerId]/layout.tsx
//
// SERVER layout for every /mlb/lab/batting-lab/[playerId]/* page. Overview, vs pitch type and Location Lab are open to everyone, signed in or
// not. The rest need an account: the tabs in the (pro) group (hot zone overlay, sequencing, H2H, trends) spend a free account's one full look
// a day on this player, and the tabs in the (member) group (spray, swing, contact, outcomes, platoon, approach) read stored tables and
// are open to any signed-in member. Signed-out visitors get a sign-in card on those (their layouts), never the data. The data APIs enforce the
// same split (lib/deep-look.ts), so bypassing a page does not reach it.

import LabShell from './LabShell'
import FollowControl from '@/components/signup/FollowControl'
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
  const follow = <FollowControl kind="player" refId={playerId} name={person.fullName} />
  return <LabShell playerName={person.fullName} followSlot={follow}>{children}</LabShell>
}
