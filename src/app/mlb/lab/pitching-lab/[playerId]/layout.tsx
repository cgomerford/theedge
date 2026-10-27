// src/app/mlb/lab/pitching-lab/[playerId]/layout.tsx
//
// SERVER layout for every /mlb/lab/pitching-lab/[playerId]/* page: 404s unknown ids, sets the title, wraps the lab shell.
// Overview, Arsenal and Location Lab are free for everyone, signed in or not. Every other tab lives in the (pro) route group (Shape beside it):
// signed-out visitors get a sign-in card there, and a free account opens one full look a day, per player. The data APIs enforce the same split.

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
    title: `${person.fullName} pitching lab`,
    description: fitDescription(`${person.fullName} pitching lab: arsenal, shape, locations, sequencing and trends by pitch type, with the number of pitches behind every stat.`, ['Sample size shown beside each number.', 'Free account.']),
    path: `/mlb/lab/pitching-lab/${playerId}`,
  })
}

export default async function PitchingLabGate({ children, params }: { children: React.ReactNode; params: Promise<{ playerId: string }> }) {
  const { playerId } = await params
  const person = await getMlbPerson(Number(playerId))
  if (!person) notFound()
  const follow = <FollowControl kind="player" refId={playerId} name={person.fullName} />
  return <LabShell playerName={person.fullName} followSlot={follow}>{children}</LabShell>
}
