// src/app/nfl/teams/[teamId]/page.tsx
//
// Server component, same split pattern as the player page: fetch
// everything server-side, hand to a client component for tabs.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import {
  getTeamDetail,
  getTeamYearOverYear,
  getTeamCoverageStats,
  getTeamInjuries,
  getTeamDepthChart,
  getTeamSchemeProfile,
  getActiveStatsSeason,
} from "@/lib/nfl/queries";
import NflTeamPageClient from "./NflTeamPageClient";

interface Props {
  params: Promise<{ teamId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { teamId } = await params;
  const statsSeason = await getActiveStatsSeason();
  const team = await getTeamDetail(teamId, statsSeason);
  if (!team) return { title: "Team · The Edge" };
  return {
    title: `${team.teamName} — ${team.record ?? "Schedule"} · The Edge`,
    description: `Year-on-year stats, coverage profile, injuries, and depth chart for the ${team.teamName}.`,
  };
}

export default async function NflTeamPage({ params }: Props) {
  const { teamId } = await params;
  const upperTeamId = teamId.toUpperCase();

  const statsSeason = await getActiveStatsSeason();
  const team = await getTeamDetail(upperTeamId, statsSeason);
  if (!team) notFound();

  const [yearOverYear, coverage, injuries, depthChart, scheme] = await Promise.all([
    getTeamYearOverYear(upperTeamId),
    getTeamCoverageStats(upperTeamId, statsSeason),
    getTeamInjuries(upperTeamId, statsSeason),
    getTeamDepthChart(upperTeamId),
    getTeamSchemeProfile(upperTeamId, statsSeason),
  ]);

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader />
      <NflTeamPageClient
        team={team}
        statsSeason={statsSeason}
        yearOverYear={yearOverYear}
        coverage={coverage}
        injuries={injuries}
        depthChart={depthChart}
        scheme={scheme}
      />
    </main>
  );
}