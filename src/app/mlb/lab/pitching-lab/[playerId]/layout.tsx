// src/app/mlb/lab/pitching-lab/[playerId]/layout.tsx
//
// SERVER layout: the Pro gate for every /mlb/lab/pitching-lab/[playerId]/* page. The
// lab UI itself (LabShell.tsx — the old client layout, unchanged) only renders
// for Pro members; everyone else gets the locked screen and none of the lab's
// client code or data requests run. The lab's data APIs are gated separately
// (lib/require-pro.ts), so bypassing this page doesn't reach the data either.

import { isProViewer } from '@/lib/require-pro'
import LabLocked from '@/components/LabLocked'
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
    title: `${person.fullName} pitching lab`,
    description: fitDescription(`${person.fullName} pitching lab: arsenal, shape, locations, sequencing and trends by pitch type, with the number of pitches behind every stat.`, ['Sample size shown beside each number.', 'Free daily email.']),
    path: `/mlb/lab/pitching-lab/${playerId}`,
  })
}

export default async function PitchingLabGate({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const person = await getMlbPerson(Number(playerId))
  if (!person) notFound()
  if (!(await isProViewer())) return <LabLocked lab="pitching" playerId={Number(playerId) || 0} />
  return <LabShell playerName={person.fullName}>{children}</LabShell>
}
