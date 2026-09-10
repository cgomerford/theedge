"use client";

// src/app/nfl/teams/[teamId]/NflTeamPageClient.tsx
//
// Same visual system as the player page: stone palette, orange accent,
// rounded-xl cards, font-mono labels. Four tabs: Year-on-Year,
// Coverage, Injuries, Depth Chart -- each an honest empty state when
// the underlying data isn't there yet.

import { useState } from "react";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type {
  TeamDetail,
  TeamSeasonTrendRow,
  TeamCoverageStats,
  TeamInjuryRow,
  DepthChartByPosition,
  TeamSchemeProfile,
} from "@/lib/nfl/queries";

interface Props {
  team: TeamDetail;
  statsSeason: number;
  yearOverYear: TeamSeasonTrendRow[];
  coverage: TeamCoverageStats | null;
  injuries: TeamInjuryRow[];
  depthChart: DepthChartByPosition[];
  scheme: TeamSchemeProfile | null;
}

type TabKey = "yoy" | "scheme" | "coverage" | "injuries" | "depth";

export default function NflTeamPageClient({ team, statsSeason, yearOverYear, coverage, injuries, depthChart, scheme }: Props) {
  const [tab, setTab] = useState<TabKey>("yoy");

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 pb-24">
      <Link
        href="/nfl"
        className="font-mono text-[10px] uppercase tracking-widest text-stone-500 hover:text-[#FF5722] transition-colors"
      >
        ← All teams
      </Link>

      <TeamHeader team={team} statsSeason={statsSeason} />

      <div className="mt-6 rounded-xl border border-stone-200 shadow-sm">
        <div className="flex border-b border-stone-200 text-sm overflow-x-auto">
          {(
            [
              ["yoy", "YEAR ON YEAR"],
              ["scheme", "SCHEME"],
              ["coverage", "COVERAGE"],
              ["injuries", `INJURIES${injuries.length > 0 ? ` (${injuries.length})` : ""}`],
              ["depth", "DEPTH CHART"],
            ] as [TabKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-6 py-3 whitespace-nowrap border-b-2 font-medium transition-colors ${
                tab === key ? "border-[#FF5722] text-[#FF5722]" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "yoy" && <YearOverYearTab rows={yearOverYear} teamColor={team.teamColor} />}
          {tab === "scheme" && <SchemeTab scheme={scheme} statsSeason={statsSeason} />}
          {tab === "coverage" && <CoverageTab coverage={coverage} statsSeason={statsSeason} />}
          {tab === "injuries" && <InjuriesTab injuries={injuries} />}
          {tab === "depth" && <DepthChartTab depthChart={depthChart} />}
        </div>
      </div>
    </div>
  );
}

function TeamHeader({ team, statsSeason }: { team: TeamDetail; statsSeason: number }) {
  return (
    <div
      className="mt-4 rounded-xl border border-stone-200 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center gap-5"
      style={{ borderLeftWidth: 4, borderLeftColor: team.teamColor }}
    >
      {team.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logoUrl} alt={team.teamName} className="w-16 h-16 object-contain flex-shrink-0" />
      ) : (
        <div className="w-16 h-16 rounded-full bg-stone-100 flex-shrink-0" />
      )}
      <div className="flex-1">
        <p className="font-mono text-[11px] uppercase tracking-widest text-stone-500">
          {team.conference} · {team.division}
        </p>
        <h1 className="font-serif text-3xl text-stone-900 mt-0.5">{team.teamName}</h1>
        <p className="font-mono text-xs text-stone-400 mt-1">
          {statsSeason} · {team.record ?? "No games played"}
        </p>
      </div>
      <div className="flex gap-4">
        <StatBadge label="PPG" value={team.pointsPerGame != null ? team.pointsPerGame.toFixed(1) : "—"} />
        <StatBadge
          label="PPG Allowed"
          value={team.pointsAllowedPerGame != null ? team.pointsAllowedPerGame.toFixed(1) : "—"}
        />
        <StatBadge label="Off Rank" value={team.offEpaRank != null ? `#${team.offEpaRank}` : "—"} />
        <StatBadge label="Def Rank" value={team.defEpaRank != null ? `#${team.defEpaRank}` : "—"} />
      </div>
    </div>
  );
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-lg font-semibold text-stone-900">{value}</p>
      <p className="font-mono text-[9px] uppercase text-stone-400">{label}</p>
    </div>
  );
}

function BarRow({ label, pct, sublabel }: { label: string; pct: number | null; sublabel?: string }) {
  return (
    <div>
      <div className="flex justify-between font-mono text-[11px] text-stone-600 mb-1">
        <span>
          {label}
          {sublabel ? <span className="text-stone-400"> · {sublabel}</span> : null}
        </span>
        <span className="font-semibold">{pct != null ? `${pct.toFixed(1)}%` : "—"}</span>
      </div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full bg-[#FF5722] rounded-full" style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}

function SchemeTab({ scheme, statsSeason }: { scheme: TeamSchemeProfile | null; statsSeason: number }) {
  if (!scheme) {
    return (
      <p className="font-serif italic text-sm text-stone-400 text-center py-10">
        No scheme profile synced for {statsSeason} yet.
      </p>
    );
  }

  const hasFtn = scheme.offFtnPlaysCharted > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-[#FF5722] font-bold mb-1">Offense</p>
        <p className="font-serif italic text-xs text-stone-400 mb-4">
          {scheme.offPlaysCharted} plays charted this season.
        </p>

        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">Formation</p>
        <div className="space-y-2 mb-5">
          <BarRow label="Shotgun" pct={scheme.offFormationShotgunPct} />
          <BarRow label="Under Center" pct={scheme.offFormationUndercenterPct} />
          <BarRow label="Pistol" pct={scheme.offFormationPistolPct} />
        </div>

        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">Personnel</p>
        <div className="space-y-2 mb-5">
          <BarRow label="11 Personnel" sublabel="1 RB, 1 TE" pct={scheme.offPersonnel11Pct} />
          <BarRow label="12 Personnel" sublabel="1 RB, 2 TE" pct={scheme.offPersonnel12Pct} />
          <BarRow label="21 Personnel" sublabel="2 RB, 1 TE" pct={scheme.offPersonnel21Pct} />
          <BarRow label="Other" pct={scheme.offPersonnelOtherPct} />
        </div>

        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">Play Design</p>
        {hasFtn ? (
          <div className="space-y-2">
            <BarRow label="Play-Action Rate" pct={scheme.offPlayActionRate} />
            <BarRow label="Pre-Snap Motion" pct={scheme.offMotionRate} />
            <BarRow label="Screen Rate" pct={scheme.offScreenRate} />
            <BarRow label="No-Huddle Rate" pct={scheme.offNoHuddleRate} />
            <BarRow label="RPO Rate" pct={scheme.offRpoRate} />
          </div>
        ) : (
          <p className="font-serif italic text-xs text-stone-400">
            Play-action/motion/screen charting isn&apos;t available for {statsSeason} (FTN charting starts 2022).
          </p>
        )}
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-[#FF5722] font-bold mb-1">Defense</p>
        <p className="font-serif italic text-xs text-stone-400 mb-4">
          {scheme.defPlaysCharted} plays charted · {scheme.defCoverageClassifiedPct?.toFixed(0) ?? "0"}% of plays had a
          coverage shell identified — percentages below are of classified plays, not all plays.
        </p>

        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">Coverage Shell</p>
        <div className="space-y-2 mb-5">
          <BarRow label="Cover 1" pct={scheme.defCover1Pct} />
          <BarRow label="Cover 2" pct={scheme.defCover2Pct} />
          <BarRow label="Cover 3" pct={scheme.defCover3Pct} />
          <BarRow label="Cover 4" pct={scheme.defCover4Pct} />
          <BarRow label="Cover 0" pct={scheme.defCover0Pct} />
          <BarRow label="Cover 6" pct={scheme.defCover6Pct} />
          <BarRow label="2-Man" pct={scheme.def2ManPct} />
          <BarRow label="Combo" pct={scheme.defComboPct} />
        </div>

        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">Man / Zone</p>
        <div className="space-y-2 mb-5">
          <BarRow label="Man" pct={scheme.defManPct} />
          <BarRow label="Zone" pct={scheme.defZonePct} />
        </div>

        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">Pressure</p>
        {hasFtn ? (
          <div className="space-y-2">
            <BarRow label="Blitz Rate (5+ rushers)" pct={scheme.defBlitzRate} />
          </div>
        ) : (
          <p className="font-serif italic text-xs text-stone-400">
            Blitz charting isn&apos;t available for {statsSeason} (FTN charting starts 2022).
          </p>
        )}
        <p className="font-mono text-xs text-stone-500 mt-3">
          Avg. defenders in box: {scheme.defAvgBoxDefenders != null ? scheme.defAvgBoxDefenders.toFixed(1) : "—"}
        </p>
      </div>
    </div>
  );
}

function YearOverYearTab({ rows, teamColor }: { rows: TeamSeasonTrendRow[]; teamColor: string }) {
  if (rows.length === 0) {
    return (
      <p className="font-serif italic text-sm text-stone-400 text-center py-10">
        No completed seasons in the current data window yet.
      </p>
    );
  }

  const chartData = rows.map((r) => ({
    season: String(r.season),
    ppg: r.pointsPerGame ?? 0,
    ppgAllowed: r.pointsAllowedPerGame ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">
          Points For / Against by Season
        </p>
        <div style={{ width: "100%", height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <XAxis dataKey="season" tick={{ fontSize: 11 }} stroke="#A8A29E" />
              <YAxis tick={{ fontSize: 11 }} stroke="#A8A29E" width={30} />
              <Tooltip contentStyle={{ fontSize: 12, fontFamily: "monospace" }} />
              <Line type="monotone" dataKey="ppg" name="PPG" stroke={teamColor} strokeWidth={2} dot={{ r: 3 }} />
              <Line
                type="monotone"
                dataKey="ppgAllowed"
                name="PPG Allowed"
                stroke="#A8A29E"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full font-mono text-[12.5px]">
          <thead>
            <tr className="border-b border-stone-200 text-stone-400">
              <th className="text-left py-2 px-2 font-normal">SEASON</th>
              <th className="text-right py-2 px-2 font-normal">RECORD</th>
              <th className="text-right py-2 px-2 font-normal">PPG</th>
              <th className="text-right py-2 px-2 font-normal">PPG ALLOWED</th>
              <th className="text-right py-2 px-2 font-normal">OFF RANK</th>
              <th className="text-right py-2 px-2 font-normal">DEF RANK</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.season} className="border-b border-stone-100">
                <td className="py-1.5 px-2 text-stone-800 font-semibold">{r.season}</td>
                <td className="py-1.5 px-2 text-right text-stone-600">
                  {r.wins}-{r.losses}
                  {r.ties ? `-${r.ties}` : ""}
                </td>
                <td className="py-1.5 px-2 text-right text-stone-600">{r.pointsPerGame?.toFixed(1) ?? "—"}</td>
                <td className="py-1.5 px-2 text-right text-stone-600">
                  {r.pointsAllowedPerGame?.toFixed(1) ?? "—"}
                </td>
                <td className="py-1.5 px-2 text-right text-stone-600">
                  {r.offEpaRank != null ? `#${r.offEpaRank}` : "—"}
                </td>
                <td className="py-1.5 px-2 text-right text-stone-600">
                  {r.defEpaRank != null ? `#${r.defEpaRank}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoverageTab({ coverage, statsSeason }: { coverage: TeamCoverageStats | null; statsSeason: number }) {
  if (!coverage) {
    return (
      <p className="font-serif italic text-sm text-stone-400 text-center py-10">
        No coverage data synced for {statsSeason} yet.
      </p>
    );
  }

  const cells: { label: string; value: string; explainer: string }[] = [
    {
      label: "Completion % Allowed",
      value: coverage.completionPctAllowed != null ? `${coverage.completionPctAllowed.toFixed(1)}%` : "—",
      explainer: "How often passes into this defense's coverage are completed. Lower is better coverage.",
    },
    {
      label: "Yards/Target Allowed",
      value: coverage.yardsPerTargetAllowed != null ? coverage.yardsPerTargetAllowed.toFixed(1) : "—",
      explainer: "Average yards given up per pass thrown at this defense, regardless of completion.",
    },
    {
      label: "Passer Rating Allowed",
      value: coverage.passerRatingAllowed != null ? coverage.passerRatingAllowed.toFixed(1) : "—",
      explainer: "What opposing QBs' passer rating looks like specifically when targeting this defense.",
    },
    {
      label: "Avg Depth of Target",
      value: coverage.avgDepthOfTarget != null ? `${coverage.avgDepthOfTarget.toFixed(1)} yds` : "—",
      explainer:
        "How far downfield opponents are willing to throw against this defense — a low number can mean opponents don't trust their deep coverage.",
    },
    {
      label: "Pressures",
      value: String(coverage.totalPressures),
      explainer: "Total quarterback pressures generated this season across all defenders.",
    },
    {
      label: "Sacks",
      value: String(coverage.totalSacks),
      explainer: "Total sacks this season.",
    },
    {
      label: "Interceptions",
      value: String(coverage.totalInterceptions),
      explainer: "Total interceptions this season.",
    },
  ];

  return (
    <div>
      <p className="font-serif italic text-xs text-stone-400 mb-4">
        Built from {coverage.defendersIncluded} defenders&apos; individual coverage snaps this season, weighted by
        targets faced — a corner targeted 80 times counts more than one targeted 5 times.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg bg-stone-50 p-3" title={c.explainer}>
            <p className="font-mono text-lg font-semibold text-stone-900">{c.value}</p>
            <p className="font-mono text-[10px] uppercase text-stone-400">{c.label}</p>
            <p className="font-serif text-[11px] text-stone-400 mt-1">{c.explainer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function InjuriesTab({ injuries }: { injuries: TeamInjuryRow[] }) {
  if (injuries.length === 0) {
    return (
      <p className="font-serif italic text-sm text-stone-400 text-center py-10">No injuries reported this week.</p>
    );
  }

  const statusColor = (status: string | null) => {
    if (status === "Out") return "text-red-600";
    if (status === "Doubtful") return "text-orange-600";
    if (status === "Questionable") return "text-amber-600";
    return "text-stone-500";
  };

  return (
    <ul className="divide-y divide-stone-100">
      {injuries.map((inj) => (
        <li key={inj.playerId} className="flex items-center gap-3 py-3">
          {inj.headshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={inj.headshotUrl}
              alt={inj.playerName}
              className="w-10 h-10 rounded-full object-cover bg-stone-100"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-stone-100" />
          )}
          <div className="flex-1">
            <p className="font-serif text-sm text-stone-800">
              {inj.playerName} <span className="font-mono text-[10px] text-stone-400">{inj.position}</span>
            </p>
            <p className="font-mono text-[11px] text-stone-400">{inj.injury ?? "—"}</p>
          </div>
          <div className="text-right">
            <p className={`font-mono text-xs font-semibold ${statusColor(inj.reportStatus)}`}>
              {inj.reportStatus ?? "—"}
            </p>
            <p className="font-mono text-[10px] text-stone-400">{inj.practiceStatus ?? ""}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DepthChartTab({ depthChart }: { depthChart: DepthChartByPosition[] }) {
  if (depthChart.length === 0) {
    return <p className="font-serif italic text-sm text-stone-400 text-center py-10">No depth chart synced yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {depthChart.map((group) => (
        <div key={group.position}>
          <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">{group.position}</p>
          <ul className="space-y-2">
            {group.players.slice(0, 4).map((p) => (
              <li key={`${p.playerId ?? p.playerName}-${p.depthRank}`} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-stone-400 w-4">{p.depthRank}</span>
                {p.headshotUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.headshotUrl}
                    alt={p.playerName}
                    className="w-8 h-8 rounded-full object-cover bg-stone-100"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-stone-100" />
                )}
                {p.playerId ? (
                  <Link
                    href={`/nfl/players/${p.playerId}`}
                    className="font-serif text-sm text-stone-800 hover:text-[#FF5722] transition-colors"
                  >
                    {p.playerName}
                  </Link>
                ) : (
                  <span className="font-serif text-sm text-stone-800">{p.playerName}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}