// src/app/api/mlb/batting-lab/route.ts
//
// The standalone Batting Lab's identity + Overview data source — search
// any real batter, get real season stats, real Statcast quality-of-
// contact numbers, real bat-speed/miss profile, and real percentiles
// (vs every other qualified hitter this season, via the same leaderboard-
// rank percentile method already proven in /api/lab/batter-card).
// Mirrors /api/mlb/pitching-lab/route.ts's shape and reasoning exactly,
// just for the batter side.

import { NextRequest, NextResponse } from 'next/server'
import { getBatterSeasonStats, getBatterStatcast, type BatterStatcast } from '@/lib/batter-stats'
import { getBatterBatSpeedProfile } from '@/lib/batter-bat-speed'
import { getMetricPercentile, LEADER_METRICS } from '@/lib/lab'
import { MLB_TEAMS } from '@/lib/teams'
import { requirePro } from '@/lib/require-pro'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

// Real hitting leaderboards this app already has a percentile method for
// (see LEADER_METRICS in lib/lab.ts) — the subset that makes sense as
// Batting Lab Overview percentile axes.
// Expanded axes so the radar shows how ROUNDED a hitter is, not just
// power/average — doubles/triples/walks/total bases all have a real
// MLB leaderboard (LEADER_METRICS) to rank against. Singles and OAA
// (Outs Above Average) were considered too: singles has no real MLB
// leaderboard category to percentile against honestly, and OAA is a
// Statcast defensive metric not exposed by the MLB Stats API endpoint
// this app's percentile method uses — both left out rather than faked.
const HITTING_PERCENTILE_KEYS = [
  'avg', 'obp', 'slg', 'ops', 'homeRuns', 'rbi', 'stolenBases', 'hits',
  'doubles', 'triples', 'baseOnBalls', 'totalBases',
] as const

export const revalidate = 1800

function formatStatcastRows(sc: BatterStatcast | null): { key: string; label: string; value: string }[] {
  if (!sc) return []
  const rows: { key: string; label: string; value: string }[] = []
  const push = (key: string, label: string, val: number | null, fmt: (v: number) => string) => {
    if (val !== null) rows.push({ key, label, value: fmt(val) })
  }
  push('xba', 'xBA', sc.xba, v => v.toFixed(3).replace(/^0/, ''))
  push('xslg', 'xSLG', sc.xslg, v => v.toFixed(3).replace(/^0/, ''))
  push('xwoba', 'xwOBA', sc.xwoba, v => v.toFixed(3).replace(/^0/, ''))
  push('avg_exit_velocity', 'Avg EV', sc.avg_exit_velocity, v => `${v.toFixed(1)} mph`)
  push('max_exit_velocity', 'Max EV', sc.max_exit_velocity, v => `${v.toFixed(1)} mph`)
  push('hard_hit_pct', 'Hard-Hit%', sc.hard_hit_pct, v => `${v.toFixed(1)}%`)
  push('barrel_pct', 'Barrel%', sc.barrel_pct, v => `${v.toFixed(1)}%`)
  push('sweet_spot_pct', 'Sweet Spot%', sc.sweet_spot_pct, v => `${v.toFixed(1)}%`)
  return rows
}

export async function GET(req: NextRequest) {
  // Pro-only data (Batting / Pitching Lab). Enforced server-side — the UI lock is not the gate.
  const denied = await requirePro()
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const batterId = Number(searchParams.get('batterId'))
  if (!batterId) return NextResponse.json({ error: 'Missing batterId' }, { status: 400 })

  const season = new Date().getFullYear()

  const [personRes, seasonStats, statcast, batSpeed, ...percentileResults] = await Promise.all([
    fetch(`${MLB_API}/people/${batterId}?hydrate=currentTeam`, { next: { revalidate: 3600 } }),
    getBatterSeasonStats(batterId),
    getBatterStatcast(batterId),
    getBatterBatSpeedProfile(batterId),
    ...HITTING_PERCENTILE_KEYS.map(k => getMetricPercentile(k, season, batterId)),
  ])

  let name = 'Batter'
  let abbr = 'MLB'
  let color = '#1A1A1A'
  let bio: {
    birthDate: string | null; age: number | null; height: string | null; weight: number | null
    bats: string | null; birthCountry: string | null; mlbDebutDate: string | null; position: string | null
  } = { birthDate: null, age: null, height: null, weight: null, bats: null, birthCountry: null, mlbDebutDate: null, position: null }
  if (personRes.ok) {
    const data = await personRes.json()
    const person = data.people?.[0]
    name = person?.fullName ?? name
    const teamId = person?.currentTeam?.id
    const team = MLB_TEAMS.find(t => t.id === teamId)
    if (team) { abbr = team.abbrev; color = team.primary_color }
    bio = {
      birthDate: person?.birthDate ?? null,
      age: person?.currentAge ?? null,
      height: person?.height ?? null,
      weight: person?.weight ?? null,
      bats: person?.batSide?.description ?? null,
      birthCountry: person?.birthCountry ?? null,
      mlbDebutDate: person?.mlbDebutDate ?? null,
      position: person?.primaryPosition?.abbreviation ?? null,
    }
  }

  const seasonStatRows = seasonStats ? [
    { key: 'avg', label: 'AVG', value: seasonStats.avg },
    { key: 'obp', label: 'OBP', value: seasonStats.obp },
    { key: 'slg', label: 'SLG', value: seasonStats.slg },
    { key: 'ops', label: 'OPS', value: seasonStats.ops },
    { key: 'hr', label: 'HR', value: String(seasonStats.home_runs) },
    { key: 'rbi', label: 'RBI', value: String(seasonStats.rbi) },
    { key: 'runs', label: 'R', value: String(seasonStats.runs) },
    { key: 'sb', label: 'SB', value: String(seasonStats.stolen_bases) },
    { key: 'bb', label: 'BB', value: String(seasonStats.walks) },
    { key: 'so', label: 'K', value: String(seasonStats.strikeouts) },
    { key: 'iso', label: 'ISO', value: seasonStats.iso },
  ] : []

  const percentileRows = HITTING_PERCENTILE_KEYS.map((k, i) => ({
    key: k,
    label: LEADER_METRICS[k].label.replace(' leaders', ''),
    percentile: percentileResults[i]?.percentile ?? null,
  }))

  return NextResponse.json({
    id: batterId,
    name,
    abbr,
    color,
    bio,
    seasonStatRows: [...seasonStatRows, ...formatStatcastRows(statcast)],
    percentileRows,
    statcast,
    batSpeed,
  })
}
