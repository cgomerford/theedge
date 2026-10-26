// src/app/mlb/lab/pitching-lab/[playerId]/layout.tsx
//
// SERVER layout for every /mlb/lab/pitching-lab/[playerId]/* page: 404s unknown ids, sets the title, wraps the lab shell.
// The Overview tab is free; every other tab lives in the (pro) route group behind the page's one ProGate. The lab's
// data API (/api/mlb/pitching-lab) only returns the overview fields to people without Pro.

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
    description: fitDescription(`${person.fullName} pitching lab: arsenal, shape, locations, sequencing and trends by pitch type, with the number of pitches behind every stat.`, ['Sample size shown beside each number.', 'Free account.']),
    path: `/mlb/lab/pitching-lab/${playerId}`,
  })
}

export default async function PitchingLabGate({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const person = await getMlbPerson(Number(playerId))
  if (!person) notFound()
  return <LabShell playerName={person.fullName}>{children}</LabShell>
}
