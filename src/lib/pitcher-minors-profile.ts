// src/lib/pitcher-minors-profile.ts
//
// Fallback profile for a starter who has NO 2026 MLB rows yet (call-ups,
// rehab ramp-ups — e.g. a Triple-A arm making his first MLB start). The MLB
// tables (pitcher_stats, pitch_arsenals, pitcher_hot_zones) only carry
// MLB-level rows, so those pitchers previously rendered as blanks.
//
// Sources (both free, both verified against live responses 2026-09-21):
//   * MLB Stats API, one request PER LEVEL (sportId 11 AAA, 12 AA, 13 High-A,
//     14 Single-A, 16 Rookie). The plural `sportIds=` form returns nothing.
//   * Baseball Savant minor-league pitch-level CSV (statcast-search-minors).
//
// Read-only: writes no tables. Used only by the admin Scout Report Graphic
// builder for pitchers that have no MLB data, and every value it returns is
// labelled as minor-league by the caller — never passed off as MLB numbers.
// Returns null (with a prefixed log on failure) when there is nothing real.
//
// Not precomputed like the MLB tables: it runs live, but only for the
// handful of pitchers per slate with no MLB rows, admin-side only.

import type { RichArsenalPitch } from '@/components/PitchLocationCard'
import type { PitcherHotZones } from '@/lib/hot-zones'
import type { PitcherGameLog } from '@/lib/mlb'
import { classifySwingCall, isSwingCall } from '@/lib/batter-pitch-log'

const MLB_API = 'https://statsapi.mlb.com/api/v1'
const LEVELS: { id: number; label: string }[] = [
  { id: 11, label: 'AAA' }, { id: 12, label: 'AA' }, { id: 13, label: 'High-A' }, { id: 14, label: 'A' }, { id: 16, label: 'Rookie' },
]

export type PitcherMinorsProfile = {
  levelLabel: string   // 'AAA', or 'MiLB' when spread across several levels
  stats: { era: number | null; whip: number | null; k_per_9: number | null; bb_per_9: number | null; l3_era: number | null } | null
  last3: PitcherGameLog[]
  arsenal: RichArsenalPitch[]
  hotZones: Record<string, PitcherHotZones>
}

// "13.2" means 13 and two-thirds innings, not 13.2 — convert to outs.
function ipToOuts(ip: string | number | undefined): number {
  const [whole, frac] = String(ip ?? '0').split('.')
  return Number(whole || 0) * 3 + Number(frac || 0)
}

async function mlbJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      console.error(`[getPitcherMinorsProfile] MLB HTTP ${res.status}: ${url}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.error('[getPitcherMinorsProfile] MLB fetch failed:', err)
    return null
  }
}

// Same quote-aware line split used in lib/batter-pitch-log.ts (play-by-play
// text in the `des` column contains commas inside quotes).
function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { cells.push(cur); cur = '' }
    else cur += ch
  }
  cells.push(cur)
  return cells
}

type MinorsPitch = { code: string; name: string; velo: number | null; zone: number | null; desc: string }

async function getMinorsPitches(pitcherId: number, season: number): Promise<MinorsPitch[]> {
  const url = `https://baseballsavant.mlb.com/statcast-search-minors/csv?all=true&hfSea=${season}%7C&player_type=pitcher&pitchers_lookup%5B%5D=${pitcherId}&type=details&minors=true`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
      next: { revalidate: 3600 },   // one pitcher's season is ~0.4 MB, well under the 2 MB fetch-cache ceiling
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.error(`[getPitcherMinorsProfile] Savant minors HTTP ${res.status} for ${pitcherId}`)
      return []
    }
    // Savant CSVs can start with a UTF-8 BOM that corrupts the first header.
    const lines = (await res.text()).replace(/^\uFEFF/, '').trim().split('\n')
    if (lines.length < 2) return []
    const head = parseCsvLine(lines[0]).map(h => h.trim().replace(/"/g, ''))
    const ix = (n: string) => head.indexOf(n)
    const [iCode, iName, iVelo, iZone, iDesc] = ['pitch_type', 'pitch_name', 'release_speed', 'zone', 'description'].map(ix)
    if ([iCode, iName, iVelo, iZone, iDesc].some(i => i < 0)) {
      console.error('[getPitcherMinorsProfile] Savant minors CSV is missing an expected column')
      return []
    }
    const out: MinorsPitch[] = []
    for (const line of lines.slice(1)) {
      const c = parseCsvLine(line)
      if (c.length !== head.length) continue
      const code = c[iCode].trim().replace(/"/g, '')
      if (!code) continue
      const velo = Number(c[iVelo])
      const zone = Number(c[iZone])
      out.push({
        code,
        name: c[iName].trim().replace(/"/g, '') || code,
        velo: c[iVelo].trim() === '' || Number.isNaN(velo) ? null : velo,
        zone: c[iZone].trim() === '' || Number.isNaN(zone) ? null : zone,
        desc: c[iDesc].trim().replace(/"/g, ''),
      })
    }
    return out
  } catch (err) {
    console.error('[getPitcherMinorsProfile] Savant minors fetch failed:', err)
    return []
  }
}

export async function getPitcherMinorsProfile(pitcherId: number, season = new Date().getFullYear()): Promise<PitcherMinorsProfile | null> {
  // One request per level, sequential: MLB's API resets bursts from one process.
  let outs = 0, er = 0, h = 0, bb = 0, so = 0
  const levelsUsed: string[] = []
  const starts: (PitcherGameLog & { outs: number })[] = []

  for (const lv of LEVELS) {
    const s = await mlbJson(`${MLB_API}/people/${pitcherId}/stats?stats=season&group=pitching&season=${season}&sportId=${lv.id}`)
    const st = s?.stats?.[0]?.splits?.[0]?.stat
    if (!st || ipToOuts(st.inningsPitched) === 0) continue
    levelsUsed.push(lv.label)
    outs += ipToOuts(st.inningsPitched)
    er += Number(st.earnedRuns ?? 0)
    h += Number(st.hits ?? 0)
    bb += Number(st.baseOnBalls ?? 0)
    so += Number(st.strikeOuts ?? 0)

    const g = await mlbJson(`${MLB_API}/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${season}&sportId=${lv.id}`)
    for (const sp of g?.stats?.[0]?.splits ?? []) {
      if (Number(sp.stat?.gamesStarted ?? 0) < 1) continue   // "last 3 STARTS" — skip relief outings
      const o = ipToOuts(sp.stat?.inningsPitched)
      starts.push({
        date: sp.date, opponent: sp.opponent?.name ?? '—', ip: String(sp.stat?.inningsPitched ?? '0'),
        h: Number(sp.stat?.hits ?? 0), er: Number(sp.stat?.earnedRuns ?? 0), bb: Number(sp.stat?.baseOnBalls ?? 0),
        so: Number(sp.stat?.strikeOuts ?? 0), era: sp.stat?.era ?? '—',
        result: sp.isWin ? 'W' : sp.isLoss ? 'L' : 'ND', outs: o,
      })
    }
  }

  const pitches = await getMinorsPitches(pitcherId, season)
  if (outs === 0 && pitches.length === 0) return null

  const ip = outs / 3
  const last3 = starts.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
  const l3Outs = last3.reduce((n, x) => n + x.outs, 0)
  const l3Er = last3.reduce((n, x) => n + x.er, 0)

  // Arsenal: usage / velocity / whiff rate per pitch type from real pitch rows.
  const byType = new Map<string, { name: string; n: number; veloSum: number; veloN: number; swings: number; whiffs: number }>()
  const zoneCounts: Record<string, number> = {}
  let zonePitches = 0
  for (const p of pitches) {
    const t = byType.get(p.code) ?? { name: p.name, n: 0, veloSum: 0, veloN: 0, swings: 0, whiffs: 0 }
    t.n++
    if (p.velo != null) { t.veloSum += p.velo; t.veloN++ }
    const call = classifySwingCall(p.desc)
    if (isSwingCall(call)) { t.swings++; if (call === 'whiff') t.whiffs++ }
    byType.set(p.code, t)
    if (p.zone != null) { zoneCounts[String(p.zone)] = (zoneCounts[String(p.zone)] ?? 0) + 1; zonePitches++ }
  }
  const arsenal: RichArsenalPitch[] = [...byType.entries()].map(([code, t]) => ({
    pitch_type: code,
    pitch_name: t.name,
    percentage: pitches.length ? (t.n / pitches.length) * 100 : null,
    count: t.n,
    avg_velocity: t.veloN ? t.veloSum / t.veloN : null,
    whiff_percent: t.swings >= 10 ? (t.whiffs / t.swings) * 100 : null,   // under 10 swings is noise — leave blank
    put_away_percent: null, est_woba: null, hard_hit_percent: null, ba_against: null,
  }))

  const zones: PitcherHotZones['zones'] = {}
  for (const [z, n] of Object.entries(zoneCounts)) zones[z] = { usage_pct: zonePitches ? (n / zonePitches) * 100 : null, pitches: n }
  const hotZones: Record<string, PitcherHotZones> = zonePitches
    ? { all: { player_id: pitcherId, player_name: '', team_id: null, season, split: 'all', total_pitches: zonePitches, zones, go_to_zone_label: null, weak_zone_label: null } }
    : {}

  return {
    levelLabel: levelsUsed.length === 1 ? levelsUsed[0] : 'MiLB',
    stats: ip > 0 ? {
      era: (er * 9) / ip,
      whip: (h + bb) / ip,
      k_per_9: (so * 9) / ip,
      bb_per_9: (bb * 9) / ip,
      l3_era: l3Outs > 0 ? (l3Er * 27) / l3Outs : null,
    } : null,
    last3: last3.map(({ outs: _outs, ...log }) => log),
    arsenal,
    hotZones,
  }
}
