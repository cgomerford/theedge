// src/lib/scout/workload.ts
//
// One definition of "taxed" so the availability grid (§1) and the bullpen
// desk (§3) can never disagree about the same arm. Pure — no fetching.
// `byDate` is pitches per day for the last 7 days, oldest → newest, ending
// the day BEFORE the game (so the last entry is yesterday).

export const WORKLOAD_RULES = {
  yesterdayPitches: 25,     // a heavy single outing yesterday
  last3Pitches: 45,         // total over the last 3 days
  backToBackPlusLast3: 35,  // pitched both of the last 2 days AND ≥ this in L3
  appearsInLast4: 3,        // 3 appearances in the last 4 days
} as const

export type WorkloadFlag = { taxed: boolean; reason: string | null; p3: number; p7: number; apps7: number }

export function workloadFlag(byDate: number[]): WorkloadFlag {
  const d = byDate.length === 7 ? byDate : [...Array(Math.max(0, 7 - byDate.length)).fill(0), ...byDate].slice(-7)
  const yesterday = d[6], twoAgo = d[5]
  const p3 = d[4] + d[5] + d[6]
  const p7 = d.reduce((a, b) => a + b, 0)
  const apps7 = d.filter((v) => v > 0).length
  const appsL4 = d.slice(3).filter((v) => v > 0).length
  let reason: string | null = null
  if (yesterday >= WORKLOAD_RULES.yesterdayPitches) reason = `${yesterday} pitches yesterday`
  else if (p3 >= WORKLOAD_RULES.last3Pitches) reason = `${p3} pitches in the last 3 days`
  else if (yesterday > 0 && twoAgo > 0 && p3 >= WORKLOAD_RULES.backToBackPlusLast3) reason = `Back-to-back days (${p3} pitches in 3)`
  else if (appsL4 >= WORKLOAD_RULES.appearsInLast4) reason = `Pitched ${appsL4} of the last 4 days`
  return { taxed: reason != null, reason, p3, p7, apps7 }
}
