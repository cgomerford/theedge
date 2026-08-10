// src/lib/stats-gamelog.ts
//
// Per-game logs + windowed aggregation for the /stats/player/[id] share-card
// page. Uses MLB's stats=gameLog endpoint — a real, documented, reliable
// endpoint (unlike the Savant CSV guessing elsewhere in this feature).
//
// AGGREGATION NOTE: rate stats (AVG/OBP/SLG/ERA/WHIP) are computed by
// summing the underlying counting stats over the window and dividing once —
// NOT by averaging each game's individual rate stat, which is a common but
// mathematically wrong shortcut (a .500 game on 2-for-4 and a .100 game on
// 1-for-10 do not average to reflect 3-for-14 true performance).

const MLB_API = 'https://statsapi.mlb.com/api/v1'

async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export type BatterGame = {
  date: string
  opponent: string
  isHome: boolean
  ab: number; h: number; doubles: number; triples: number; hr: number
  rbi: number; bb: number; so: number; sb: number; hbp: number; sf: number; pa: number
}

export type PitcherGame = {
  date: string
  opponent: string
  isHome: boolean
  ip: number
  er: number; h: number; bb: number; so: number; hr: number
}

// MLB writes partial innings as .1 = one out, .2 = two outs (not decimal
// tenths). "5.2" means 5 and 2/3 innings, i.e. 17 outs, i.e. 5.667 for math.
function parseInningsPitched(raw: string | number | undefined): number {
  if (raw === undefined || raw === null) return 0
  const str = String(raw)
  const [whole, frac] = str.split('.')
  const w = parseInt(whole, 10) || 0
  const f = frac === '1' ? 1 / 3 : frac === '2' ? 2 / 3 : 0
  return w + f
}

// src/lib/stats-gamelog.ts — only the changed lines

export async function getBatterGameLog(playerId: number, season: number): Promise<BatterGame[]> {
  const url = `${MLB_API}/people/${playerId}/stats?stats=gameLog&group=hitting&season=${season}`
  const json = await safeFetchJson<any>(url)
  const splits = json?.stats?.[0]?.splits ?? []
  // CORRECTED 2026-08: MLB's gameLog endpoint returns splits OLDEST-FIRST
  // already (verified via direct curl against statsapi.mlb.com — see chat).
  // The previous .reverse() here was flipping correctly-ordered data into
  // reverse-chronological order, which silently fed WindowCompareTab's
  // "last N games" slice the EARLIEST N games instead, and made Season
  // Progression's cumulative chart plot backwards. No reversal needed.
  return splits.map((s: any): BatterGame => ({
    date: s.date,
    opponent: s.opponent?.abbreviation ?? s.opponent?.name ?? '—',
    isHome: !!s.isHome,
    ab: s.stat?.atBats ?? 0,
    h: s.stat?.hits ?? 0,
    doubles: s.stat?.doubles ?? 0,
    triples: s.stat?.triples ?? 0,
    hr: s.stat?.homeRuns ?? 0,
    rbi: s.stat?.rbi ?? 0,
    bb: s.stat?.baseOnBalls ?? 0,
    so: s.stat?.strikeOuts ?? 0,
    sb: s.stat?.stolenBases ?? 0,
    hbp: s.stat?.hitByPitch ?? 0,
    sf: s.stat?.sacFlies ?? 0,
    pa: s.stat?.plateAppearances ?? 0,
  }))
}

export async function getPitcherGameLog(playerId: number, season: number): Promise<PitcherGame[]> {
  const url = `${MLB_API}/people/${playerId}/stats?stats=gameLog&group=pitching&season=${season}`
  const json = await safeFetchJson<any>(url)
  const splits = json?.stats?.[0]?.splits ?? []
  // Same correction as getBatterGameLog above — no .reverse() needed.
  return splits.map((s: any): PitcherGame => ({
    date: s.date,
    opponent: s.opponent?.abbreviation ?? s.opponent?.name ?? '—',
    isHome: !!s.isHome,
    ip: parseInningsPitched(s.stat?.inningsPitched),
    er: s.stat?.earnedRuns ?? 0,
    h: s.stat?.hits ?? 0,
    bb: s.stat?.baseOnBalls ?? 0,
    so: s.stat?.strikeOuts ?? 0,
    hr: s.stat?.homeRuns ?? 0,
  }))
}

export type BattingAgg = {
  g: number; pa: number; ab: number; h: number; hr: number; rbi: number; bb: number; so: number; sb: number
  avg: number | null; obp: number | null; slg: number | null; ops: number | null
}

export function aggregateBatting(games: BatterGame[]): BattingAgg {
  const sum = (k: keyof BatterGame) => games.reduce((acc, g) => acc + (typeof g[k] === 'number' ? (g[k] as number) : 0), 0)
  const ab = sum('ab'), h = sum('h'), doubles = sum('doubles'), triples = sum('triples'), hr = sum('hr')
  const bb = sum('bb'), hbp = sum('hbp'), sf = sum('sf'), pa = sum('pa')
  const singles = h - doubles - triples - hr
  const totalBases = singles + doubles * 2 + triples * 3 + hr * 4
  const avg = ab > 0 ? h / ab : null
  const obpDenom = ab + bb + hbp + sf
  const obp = obpDenom > 0 ? (h + bb + hbp) / obpDenom : null
  const slg = ab > 0 ? totalBases / ab : null
  const ops = obp !== null && slg !== null ? obp + slg : null
  return {
    g: games.length, pa, ab, h, hr, rbi: sum('rbi'), bb, so: sum('so'), sb: sum('sb'),
    avg, obp, slg, ops,
  }
}

export type PitchingAgg = {
  g: number; ip: number; er: number; h: number; bb: number; so: number; hr: number
  era: number | null; whip: number | null; k9: number | null; bb9: number | null
}

export function aggregatePitching(games: PitcherGame[]): PitchingAgg {
  const ip = games.reduce((acc, g) => acc + g.ip, 0)
  const er = games.reduce((acc, g) => acc + g.er, 0)
  const h = games.reduce((acc, g) => acc + g.h, 0)
  const bb = games.reduce((acc, g) => acc + g.bb, 0)
  const so = games.reduce((acc, g) => acc + g.so, 0)
  const hr = games.reduce((acc, g) => acc + g.hr, 0)
  return {
    g: games.length, ip, er, h, bb, so, hr,
    era: ip > 0 ? (er * 9) / ip : null,
    whip: ip > 0 ? (bb + h) / ip : null,
    k9: ip > 0 ? (so * 9) / ip : null,
    bb9: ip > 0 ? (bb * 9) / ip : null,
  }
}