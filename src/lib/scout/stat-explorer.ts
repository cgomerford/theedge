// src/lib/scout/stat-explorer.ts
//
// Shared shapes + the rolling-window builder behind the Scout "pick any stat"
// charts (team offense in §2, bullpen in §3). Pure — safe to import from both
// server libs and the client StatExplorer component.
//
// The server precomputes, for every stat and every window size, the value of
// the trailing N-game window at each game. The client only picks which array to
// draw — no stat maths in the browser, and the payload stays small (a few
// thousand numbers per club).

export type StatFormat = 'r3' | 'pct' | 'mph' | 'num1' | 'num2'

export type ExplorerStat = {
  key: string
  label: string
  group: string
  format: StatFormat
  /** One plain sentence — shown under the picker for the selected stat. */
  hint: string
  /** true = up is good for the club being scouted, false = down is good, null = neutral. */
  higherIsBetter: boolean | null
  /** How to average single-game values across games: by sample size (rates — the default) or per game (counts). */
  weight?: 'sample' | 'game'
}

/** A "flag the games where…" choice: a player started, or a given starter was faced. */
export type StartMarker = {
  id: string
  label: string
  group: string
  /** One per game, aligned with ExplorerClub.dates. */
  flags: boolean[]
}

export type ExplorerClub = {
  abbr: string
  name: string
  /** One label per game, oldest → newest (ISO date). */
  dates: string[]
  /** Game ids aligned with dates. */
  pks: number[]
  markers: StartMarker[]
  windows: number[]
  /** rolling[window][statKey][i] — the trailing `window` games ending at game i; null until the window fills. */
  rolling: Record<number, Record<string, (number | null)[]>>
  /** samples[window][i] — the sample size (PA or batters faced) behind that window. */
  samples: Record<number, number[]>
  baseline: Record<string, { value: number | null; label: string }>
}

export function formatStat(format: StatFormat, v: number): string {
  switch (format) {
    case 'r3': return v.toFixed(3).replace(/^(-?)0\./, '$1.')
    case 'pct': return `${v.toFixed(1)}%`
    case 'mph': return `${v.toFixed(1)} mph`
    case 'num1': return v.toFixed(1)
    case 'num2': return v.toFixed(2)
  }
}

export type StatFns<G> = Record<string, (window: G[]) => number | null>

export function buildRolling<G>(
  games: G[],
  windows: number[],
  statFns: StatFns<G>,
  sampleFn: (window: G[]) => number,
): Pick<ExplorerClub, 'rolling' | 'samples'> {
  const rolling: ExplorerClub['rolling'] = {}
  const samples: ExplorerClub['samples'] = {}
  for (const w of windows) {
    rolling[w] = {}
    samples[w] = games.map((_, i) => (i >= w - 1 ? sampleFn(games.slice(i - w + 1, i + 1)) : 0))
    for (const [key, fn] of Object.entries(statFns)) {
      rolling[w][key] = games.map((_, i) => (i >= w - 1 ? fn(games.slice(i - w + 1, i + 1)) : null))
    }
  }
  return { rolling, samples }
}

export const ratio = (num: number, den: number, scale = 1): number | null => (den > 0 ? (num / den) * scale : null)
export const sumOf = <G,>(gs: G[], pick: (g: G) => number): number => gs.reduce((a, g) => a + pick(g), 0)

/** Season baselines fall back to the average of the games on the chart when no season figure is sourced. */
export function withFallbackBaselines<G>(
  keys: string[],
  known: Record<string, number | null>,
  knownLabel: string,
  games: G[],
  statFns: StatFns<G>,
): ExplorerClub['baseline'] {
  const out: ExplorerClub['baseline'] = {}
  for (const key of keys) {
    if (known[key] != null) out[key] = { value: known[key], label: knownLabel }
    else out[key] = { value: statFns[key](games), label: `Avg of last ${games.length} games` }
  }
  return out
}
