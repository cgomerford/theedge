"use client";

// src/app/nfl/players/[id]/NflPlayerPageClient.tsx
//
// Structural match to src/app/mlb/players/[id]/PlayerPageClient.tsx:
//   Row 1: Identity strip (wide) + Signature dial row (narrow) --
//          signature dials replace MLB's Grade Banner, since there's
//          no NFL grade methodology (see player-stats-config.ts header).
//   Row 2: 3-col grid -- percentile rail (narrow) . tab engine (wide) .
//          trend chart + similar players (narrow)
//   Row 3: Career Table, full width -- tabs, career totals grid,
//          sortable season-by-season table with best-season highlight.
//
// Career/percentile/similarPlayers can each independently be null/empty
// (rookie with no prior seasons, comparison pool too small, etc) --
// every section handles that as a real empty state, not a blank crash.

import { useMemo, useState } from "react";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type {
  NflPlayerProfile,
  PlayerCareerData,
  PercentileDial,
  SimilarPlayer,
} from "@/lib/nfl/queries";
import { statGroupsForPosition, signatureKeysForPosition, findStatDef } from "@/lib/nfl/player-stats-config";

interface Props {
  profile: NflPlayerProfile;
  career: PlayerCareerData | null;
  percentiles: PercentileDial[];
  similarPlayers: SimilarPlayer[];
}

export default function NflPlayerPageClient({ profile, career, percentiles, similarPlayers }: Props) {
  const teamColor = profile.team?.teamColor ?? "#1A1A1A";
  const statGroups = statGroupsForPosition(profile.position);
  const signatureKeys = signatureKeysForPosition(profile.position);

  const percentileByKey = new Map(percentiles.map((p) => [p.key, p]));
  const signatureDials = signatureKeys
    .map((key) => percentileByKey.get(key))
    .filter((d): d is PercentileDial => d != null);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8 pb-24">
      <Link
        href="/nfl"
        className="font-mono text-[10px] uppercase tracking-widest text-stone-500 hover:text-[#FF5722] transition-colors"
      >
        ← All players
      </Link>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-5 items-stretch">
        <div className="lg:col-span-2">
          <IdentityStrip profile={profile} teamColor={teamColor} />
        </div>
        <SignatureDialCard dials={signatureDials} teamColor={teamColor} />
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-5 items-start">
        <PercentileRail percentiles={percentiles} position={profile.position} />

        <TabEngine profile={profile} statGroups={statGroups} />

        <div className="space-y-5">
          <TrendChart gameLog={profile.gameLog} position={profile.position} />
          <SimilarPlayersPanel players={similarPlayers} />
        </div>
      </div>

      <div className="mt-8">
        {career ? (
          <CareerTable career={career} position={profile.position} />
        ) : (
          <div className="rounded-xl border border-stone-200 p-8 text-center">
            <p className="font-serif italic text-sm text-stone-400">
              No career data yet for this player in the current data window.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function IdentityStrip({ profile, teamColor }: { profile: NflPlayerProfile; teamColor: string }) {
  return (
    <div
      className="rounded-xl border border-stone-200 shadow-sm p-5 flex items-center gap-5 h-full"
      style={{ borderLeftWidth: 4, borderLeftColor: teamColor }}
    >
      {profile.headshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.headshotUrl}
          alt={profile.fullName}
          className="w-20 h-20 rounded-full object-cover bg-stone-100 flex-shrink-0"
        />
      ) : (
        <div className="w-20 h-20 rounded-full bg-stone-100 flex-shrink-0" />
      )}
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-stone-500">
          {profile.position} . {profile.teamId}
          {profile.jerseyNumber != null ? ` . #${profile.jerseyNumber}` : ""}
        </p>
        <h1 className="font-serif text-3xl text-stone-900 mt-0.5">{profile.fullName}</h1>
        <p className="font-mono text-xs text-stone-400 mt-1">
          {[
            profile.heightIn ? `${Math.floor(profile.heightIn / 12)}'${profile.heightIn % 12}"` : null,
            profile.weightLb ? `${profile.weightLb} lb` : null,
            profile.college,
            profile.yearsExp != null ? `Yr ${profile.yearsExp + 1}` : null,
          ]
            .filter(Boolean)
            .join(" . ")}
        </p>
      </div>
    </div>
  );
}

function SignatureDialCard({ dials, teamColor }: { dials: PercentileDial[]; teamColor: string }) {
  return (
    <div className="rounded-xl border border-stone-200 shadow-sm p-5 h-full">
      <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-3">Signature</p>
      {dials.length === 0 ? (
        <p className="font-serif italic text-xs text-stone-400">
          Not enough games yet this season to rank against peers.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {dials.map((d) => (
            <div key={d.key} className="text-center">
              <div
                className="w-full aspect-square rounded-full flex items-center justify-center font-mono text-sm font-bold"
                style={{
                  background: `conic-gradient(${teamColor} ${d.percentile * 3.6}deg, #E7E5E4 0deg)`,
                }}
              >
                <div className="w-[80%] aspect-square rounded-full bg-white flex items-center justify-center">
                  {d.percentile}
                </div>
              </div>
              <p className="font-mono text-[9px] uppercase tracking-wide text-stone-400 mt-1.5">{d.key}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PercentileRail({ percentiles, position }: { percentiles: PercentileDial[]; position: string }) {
  return (
    <div className="rounded-xl border border-stone-200 shadow-sm p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">Percentiles</p>
      <p className="font-serif italic text-[11px] text-stone-400 mb-3">
        Ranked against same-position peers with a reliable sample this season.
      </p>
      {percentiles.length === 0 ? (
        <p className="font-serif italic text-xs text-stone-400">Not enough data to rank yet.</p>
      ) : (
        <div className="space-y-3">
          {percentiles.map((p) => {
            const def = findStatDef(position, p.key);
            return (
              <div key={p.key}>
                <div className="flex justify-between font-mono text-[11px] text-stone-600 mb-1">
                  <span>{def?.label ?? p.key}</span>
                  <span className="font-semibold">{def ? def.format(p.value) : p.value.toFixed(1)}</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#FF5722] rounded-full" style={{ width: `${p.percentile}%` }} />
                </div>
                <p className="font-mono text-[9px] text-stone-400 mt-0.5">
                  {p.percentile}th percentile . n={p.sampleSize}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type TabKey = "overview" | "gamelog" | "bio";

function TabEngine({
  profile,
  statGroups,
}: {
  profile: NflPlayerProfile;
  statGroups: ReturnType<typeof statGroupsForPosition>;
}) {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="rounded-xl border border-stone-200 shadow-sm">
      <div className="flex border-b border-stone-200 text-sm">
        {(["overview", "gamelog", "bio"] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-6 py-3 border-b-2 font-medium transition-colors ${
              tab === t ? "border-[#FF5722] text-[#FF5722]" : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            {t === "gamelog" ? "GAME LOG" : t.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "overview" && <OverviewTab profile={profile} statGroups={statGroups} />}
        {tab === "gamelog" && <GameLogTab profile={profile} />}
        {tab === "bio" && <BioTab profile={profile} />}
      </div>
    </div>
  );
}

function OverviewTab({
  profile,
  statGroups,
}: {
  profile: NflPlayerProfile;
  statGroups: ReturnType<typeof statGroupsForPosition>;
}) {
  if (!profile.seasonTotals) {
    return (
      <p className="font-serif italic text-sm text-stone-400 text-center py-10">
        No games played yet this season.
      </p>
    );
  }

  const games = profile.seasonTotals.gamesPlayed;

  return (
    <div className="space-y-6">
      {statGroups.map((group) => (
        <div key={group.title}>
          <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">{group.title}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {group.stats.map((stat) => {
              const rawTotal = seasonTotalFor(profile, stat.key);
              if (rawTotal == null) return null;
              const perGame = games > 0 ? rawTotal / games : 0;
              return (
                <div key={stat.key} className="rounded-lg bg-stone-50 p-3">
                  <p className="font-mono text-lg font-semibold text-stone-900">{stat.format(perGame)}</p>
                  <p className="font-mono text-[10px] uppercase text-stone-400">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function seasonTotalFor(profile: NflPlayerProfile, key: string): number | null {
  const t = profile.seasonTotals;
  if (!t) return null;
  const map: Record<string, number> = {
    passYdsPerG: t.passingYards,
    passTdPerG: t.passingTds,
    intPerG: t.interceptions,
    rushYdsPerG: t.rushingYards,
    rushTdPerG: t.rushingTds,
    recPerG: t.receptions,
    recYdsPerG: t.receivingYards,
    recTdPerG: t.receivingTds,
    targetsPerG: t.targets,
  };
  return map[key] ?? null;
}

function GameLogTab({ profile }: { profile: NflPlayerProfile }) {
  const isQb = profile.position === "QB";

  if (profile.gameLog.length === 0) {
    return (
      <p className="font-serif italic text-sm text-stone-400 text-center py-10">
        No games logged yet this season.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-[12.5px]">
        <thead>
          <tr className="border-b border-stone-200 text-stone-400">
            <th className="text-left py-2 px-2 font-normal">WK</th>
            {isQb ? (
              <>
                <th className="text-right py-2 px-2 font-normal">CMP/ATT</th>
                <th className="text-right py-2 px-2 font-normal">YDS</th>
                <th className="text-right py-2 px-2 font-normal">TD</th>
                <th className="text-right py-2 px-2 font-normal">INT</th>
              </>
            ) : (
              <>
                <th className="text-right py-2 px-2 font-normal">REC</th>
                <th className="text-right py-2 px-2 font-normal">TGT</th>
                <th className="text-right py-2 px-2 font-normal">YDS</th>
                <th className="text-right py-2 px-2 font-normal">TD</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {profile.gameLog.map((row) => (
            <tr key={row.week} className="border-b border-stone-100">
              <td className="py-1.5 px-2 text-stone-600">{row.week}</td>
              {isQb ? (
                <>
                  <td className="py-1.5 px-2 text-right">
                    {row.completions ?? 0}/{row.attempts ?? 0}
                  </td>
                  <td className="py-1.5 px-2 text-right">{row.passingYards ?? 0}</td>
                  <td className="py-1.5 px-2 text-right">{row.passingTds ?? 0}</td>
                  <td className="py-1.5 px-2 text-right">{row.interceptions ?? 0}</td>
                </>
              ) : (
                <>
                  <td className="py-1.5 px-2 text-right">{row.receptions ?? 0}</td>
                  <td className="py-1.5 px-2 text-right">{row.targets ?? 0}</td>
                  <td className="py-1.5 px-2 text-right">{row.receivingYards ?? 0}</td>
                  <td className="py-1.5 px-2 text-right">{row.receivingTds ?? 0}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BioTab({ profile }: { profile: NflPlayerProfile }) {
  return (
    <div className="space-y-2 font-serif text-sm text-stone-700">
      <p>College: {profile.college ?? "—"}</p>
      <p>Experience: {profile.yearsExp != null ? `Year ${profile.yearsExp + 1}` : "—"}</p>
      <p>
        Height/Weight:{" "}
        {profile.heightIn ? `${Math.floor(profile.heightIn / 12)}'${profile.heightIn % 12}"` : "—"} /{" "}
        {profile.weightLb ? `${profile.weightLb} lb` : "—"}
      </p>
    </div>
  );
}

function TrendChart({ gameLog, position }: { gameLog: NflPlayerProfile["gameLog"]; position: string }) {
  const isQb = position === "QB";
  const data = useMemo(
    () =>
      gameLog.map((g) => ({
        week: `W${g.week}`,
        value: isQb ? g.passingYards ?? 0 : g.receivingYards ?? g.rushingYards ?? 0,
      })),
    [gameLog, isQb]
  );

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 shadow-sm p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">Season Trend</p>
        <p className="font-serif italic text-xs text-stone-400">No games yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 shadow-sm p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-2">
        {isQb ? "Pass Yds by Week" : "Yds by Week"}
      </p>
      <div style={{ width: "100%", height: 140 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <XAxis dataKey="week" tick={{ fontSize: 10 }} stroke="#A8A29E" />
            <YAxis tick={{ fontSize: 10 }} stroke="#A8A29E" width={30} />
            <Tooltip contentStyle={{ fontSize: 12, fontFamily: "monospace" }} />
            <Line type="monotone" dataKey="value" stroke="#FF5722" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SimilarPlayersPanel({ players }: { players: SimilarPlayer[] }) {
  return (
    <div className="rounded-xl border border-stone-200 shadow-sm p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400 mb-1">Similar To</p>
      <p className="font-serif italic text-[11px] text-stone-400 mb-3">
        Statistical resemblance in production, not play style or role.
      </p>
      {players.length === 0 ? (
        <p className="font-serif italic text-xs text-stone-400">Not enough data to compare yet.</p>
      ) : (
        <ul className="space-y-2">
          {players.map((p) => (
            <li key={p.gsisId}>
              <Link
                href={`/nfl/players/${p.gsisId}`}
                className="flex items-center gap-2 hover:text-[#FF5722] transition-colors"
              >
                {p.headshotUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.headshotUrl}
                    alt={p.fullName}
                    className="w-8 h-8 rounded-full object-cover bg-stone-100"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-stone-100" />
                )}
                <span className="font-serif text-sm text-stone-800">{p.fullName}</span>
                <span className="font-mono text-[10px] text-stone-400 ml-auto">{p.teamId}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CareerView = "overview" | "table";

function CareerTable({ career, position }: { career: PlayerCareerData; position: string }) {
  const [view, setView] = useState<CareerView>("overview");
  const [sortKey, setSortKey] = useState<string>("season");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const statGroups = statGroupsForPosition(position);
  const allStats = statGroups.flatMap((g) => g.stats);

  const sortedSeasons = useMemo(() => {
    const rows = [...career.seasons];
    rows.sort((a, b) => {
      if (sortKey === "season") return sortDir === "desc" ? b.season - a.season : a.season - b.season;
      const aVal = a.rates[sortKey] ?? 0;
      const bVal = b.rates[sortKey] ?? 0;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
    return rows;
  }, [career.seasons, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function bestSeasonFor(key: string): number | null {
    const def = allStats.find((s) => s.key === key);
    if (!def) return null;
    let best: number | null = null;
    for (const s of career.seasons) {
      const v = s.rates[key];
      if (v == null) continue;
      if (best == null || (def.higherIsBetter ? v > best : v < best)) best = v;
    }
    return best;
  }

  return (
    <div className="rounded-xl border border-stone-200 shadow-sm p-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-y-1 mb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-[#FF5722] font-bold">CAREER</p>
          <p className="text-2xl font-semibold tracking-tight text-stone-900">Player Statistics</p>
        </div>
        <p className="font-mono text-xs text-stone-500">
          {career.seasons.length} season{career.seasons.length !== 1 ? "s" : ""} . {career.yearSpan}
        </p>
      </div>

      <p className="font-serif italic text-xs text-stone-400 mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Career stats since {career.dataStartSeason} — backfilling further seasons is a work in progress.
      </p>

      <div className="flex border-b border-stone-200 text-sm mb-4">
        {(["overview", "table"] as CareerView[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-6 py-3 border-b-2 font-medium transition-colors ${
              view === v ? "border-[#FF5722] text-[#FF5722]" : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            {v.toUpperCase()}
          </button>
        ))}
      </div>

      {view === "overview" && (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-stone-400">CAREER TOTALS (PER GAME)</p>
            <div className="h-px flex-1 bg-stone-100" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {allStats.map((stat) => {
              const val = career.careerRates[stat.key];
              if (val == null) return null;
              return (
                <div key={stat.key} className="rounded-lg bg-stone-50 p-3">
                  <p className="font-mono text-lg font-semibold text-stone-900">{stat.format(val)}</p>
                  <p className="font-mono text-[10px] uppercase text-stone-400">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "table" && (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-[12.5px]">
            <thead>
              <tr className="border-b border-stone-200 text-stone-400">
                <th className="text-left py-2 px-2 font-normal cursor-pointer" onClick={() => handleSort("season")}>
                  SEASON
                </th>
                <th className="text-left py-2 px-2 font-normal">TEAM</th>
                <th className="text-right py-2 px-2 font-normal">G</th>
                {allStats.map((stat) => (
                  <th
                    key={stat.key}
                    className="text-right py-2 px-2 font-normal cursor-pointer hover:text-stone-700"
                    onClick={() => handleSort(stat.key)}
                  >
                    {stat.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSeasons.map((s) => (
                <tr key={s.season} className="border-b border-stone-100">
                  <td className="py-1.5 px-2 text-stone-800 font-semibold">{s.season}</td>
                  <td className="py-1.5 px-2 text-stone-500">{s.teamId}</td>
                  <td className="py-1.5 px-2 text-right text-stone-500">{s.gamesPlayed}</td>
                  {allStats.map((stat) => {
                    const v = s.rates[stat.key];
                    const best = bestSeasonFor(stat.key);
                    const isBest = v != null && best != null && v === best;
                    return (
                      <td
                        key={stat.key}
                        className={`py-1.5 px-2 text-right ${isBest ? "text-[#FF5722] font-semibold" : "text-stone-700"}`}
                      >
                        {v != null ? stat.format(v) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}