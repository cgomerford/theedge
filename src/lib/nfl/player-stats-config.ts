/**
 * lib/nfl/player-stats-config.ts
 *
 * Position-specific stat definitions, mirroring the existing MLB
 * pattern (StatDef/StatGroup in player-stats.ts, SignatureDial in
 * player-signature.ts) rather than inventing a new shape. One source
 * of truth for label/format/higherIsBetter, read by the career table,
 * the percentile rail, and the similarity model -- so a stat's
 * definition only lives in one place.
 *
 * NO GRADE SYSTEM: MLB's page has computeSeasonGrade/computeCareerGrade,
 * a proprietary weighted formula. There's no NFL equivalent methodology
 * defined anywhere in this codebase, and inventing one here would be
 * exactly the kind of black-box number this product is built to avoid.
 * The percentile rail (real ranks against real same-position peers) is
 * the honest substitute -- omit a dial if it can't be computed, never
 * fabricate one. Same principle as player-signature.ts's own comment.
 */

export type StatFormat = (v: number) => string;

export interface StatDef {
  key: string;
  label: string;
  format: StatFormat;
  higherIsBetter: boolean;
  percentileEligible?: boolean;
}

export interface StatGroup {
  title: string;
  stats: StatDef[];
}

const dp = (n: number): StatFormat => (v) => v.toFixed(n);

export type NflPosition = "QB" | "RB" | "WR" | "TE";

export const QB_STAT_GROUPS: StatGroup[] = [
  {
    title: "Passing",
    stats: [
      { key: "passYdsPerG", label: "Pass Yds/G", format: dp(1), higherIsBetter: true, percentileEligible: true },
      { key: "passTdPerG", label: "Pass TD/G", format: dp(2), higherIsBetter: true, percentileEligible: true },
      { key: "intPerG", label: "INT/G", format: dp(2), higherIsBetter: false, percentileEligible: true },
      { key: "epaPerDropback", label: "EPA/Dropback", format: dp(2), higherIsBetter: true, percentileEligible: true },
      { key: "cpoe", label: "CPOE", format: dp(1), higherIsBetter: true, percentileEligible: true },
    ],
  },
  {
    title: "Rushing",
    stats: [
      { key: "rushYdsPerG", label: "Rush Yds/G", format: dp(1), higherIsBetter: true, percentileEligible: true },
      { key: "rushTdPerG", label: "Rush TD/G", format: dp(2), higherIsBetter: true, percentileEligible: true },
    ],
  },
];

export const RB_STAT_GROUPS: StatGroup[] = [
  {
    title: "Rushing",
    stats: [
      { key: "rushYdsPerG", label: "Rush Yds/G", format: dp(1), higherIsBetter: true, percentileEligible: true },
      { key: "rushTdPerG", label: "Rush TD/G", format: dp(2), higherIsBetter: true, percentileEligible: true },
      { key: "rushEpaPerCarry", label: "EPA/Carry", format: dp(2), higherIsBetter: true, percentileEligible: true },
    ],
  },
  {
    title: "Receiving",
    stats: [
      { key: "recPerG", label: "Rec/G", format: dp(1), higherIsBetter: true, percentileEligible: true },
      { key: "recYdsPerG", label: "Rec Yds/G", format: dp(1), higherIsBetter: true, percentileEligible: true },
      { key: "recTdPerG", label: "Rec TD/G", format: dp(2), higherIsBetter: true, percentileEligible: true },
    ],
  },
];

export const WR_TE_STAT_GROUPS: StatGroup[] = [
  {
    title: "Receiving",
    stats: [
      { key: "targetsPerG", label: "Targets/G", format: dp(1), higherIsBetter: true, percentileEligible: true },
      { key: "recPerG", label: "Rec/G", format: dp(1), higherIsBetter: true, percentileEligible: true },
      { key: "recYdsPerG", label: "Rec Yds/G", format: dp(1), higherIsBetter: true, percentileEligible: true },
      { key: "recTdPerG", label: "Rec TD/G", format: dp(2), higherIsBetter: true, percentileEligible: true },
      {
        key: "targetShare",
        label: "Target Share",
        format: (v) => `${(v * 100).toFixed(1)}%`,
        higherIsBetter: true,
        percentileEligible: true,
      },
    ],
  },
];

export function statGroupsForPosition(position: string): StatGroup[] {
  if (position === "QB") return QB_STAT_GROUPS;
  if (position === "RB") return RB_STAT_GROUPS;
  if (position === "WR" || position === "TE") return WR_TE_STAT_GROUPS;
  return [];
}

/** Which stat keys feed the similarity model, per position -- a subset
 * of the percentile-eligible keys above, chosen to reflect role/usage
 * rather than every available number (too many dimensions makes
 * "similarity" mean less, not more). */
export function similarityKeysForPosition(position: string): string[] {
  if (position === "QB") return ["passYdsPerG", "passTdPerG", "intPerG", "epaPerDropback", "rushYdsPerG"];
  if (position === "RB") return ["rushYdsPerG", "rushTdPerG", "recPerG", "recYdsPerG"];
  if (position === "WR" || position === "TE")
    return ["targetsPerG", "recPerG", "recYdsPerG", "recTdPerG", "targetShare"];
  return [];
}

/** 3 signature dials per position -- the honest substitute for a grade.
 * Mirrors dialsForPosition() in player-signature.ts's pattern exactly:
 * a fixed, position-dependent subset, never a fabricated composite. */
export function signatureKeysForPosition(position: string): string[] {
  if (position === "QB") return ["passYdsPerG", "epaPerDropback", "cpoe"];
  if (position === "RB") return ["rushYdsPerG", "rushEpaPerCarry", "recPerG"];
  if (position === "WR" || position === "TE") return ["recYdsPerG", "targetShare", "recTdPerG"];
  return [];
}

export function findStatDef(position: string, key: string): StatDef | undefined {
  for (const group of statGroupsForPosition(position)) {
    const found = group.stats.find((s) => s.key === key);
    if (found) return found;
  }
  return undefined;
}