// src/app/nfl/players/[id]/page.tsx
//
// Server component, mirrors src/app/mlb/players/[id]/page.tsx exactly:
// fetch everything server-side in one place, hand it to a client
// component for the interactive parts (tabs, sortable table).
//
// [id] is the gsis_id (e.g. '00-0033873'), not a slug -- see queries.ts
// header comment on getPlayerProfile for why.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import {
  getPlayerProfile,
  getPlayerCareerData,
  getPlayerPercentiles,
  getSimilarPlayers,
} from "@/lib/nfl/queries";
import NflPlayerPageClient from "./NflPlayerPageClient"

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPlayerProfile(id);
  if (!profile) return { title: "Player · The Edge" };
  return {
    title: `${profile.fullName} — ${profile.teamId} ${profile.position} · The Edge`,
    description: `Full statistical profile for ${profile.fullName}: career stats, percentiles, and comparable players.`,
  };
}

export default async function NflPlayerPage({ params }: Props) {
  const { id } = await params;

  const profile = await getPlayerProfile(id);
  if (!profile) notFound();

  // Career/percentile/similar all independent of each other -- fetch
  // in parallel rather than sequentially.
  const [career, percentiles, similarPlayers] = await Promise.all([
    getPlayerCareerData(id),
    getPlayerPercentiles(id, profile.statsSeason),
    getSimilarPlayers(id),
  ]);

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader />
      <NflPlayerPageClient profile={profile} career={career} percentiles={percentiles} similarPlayers={similarPlayers} />
    </main>
  );
}