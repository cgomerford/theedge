// src/lib/batter-bat-speed.ts
//
// "Loud outs" plot — real bat speed vs. contact-quality/luck, per batter.
// Same raw Statcast pitch-search CSV as pitcher-statcast-profile.ts,
// scoped to one batter via batters_lookup[] so it stays a fast, cacheable
// live fetch (curl-verified real columns: bat_speed, woba_value,
// estimated_woba_using_speedangle).
//
// We deliberately do NOT compute a "blast rate" — Savant's Blast metric
// combines bat_speed with squared_up_rate, and squared_up_rate isn't a
// column this CSV exposes (checked the full header — not present), so a
// homemade "blast" threshold would be an unverified guess dressed up as a
// real stat. avgBatSpeed alone is real and well-documented; that's the x
// axis. xwOBA-minus-wOBA (avg estimated_woba_using_speedangle minus avg
// woba_value, both real per-batted-ball fields) is the y axis — positive
// means the contact quality says he should be producing more than the
// results show ("loud outs"); negative means results are outrunning the
// quality of contact.
//
// This same CSV also carries miss_distance/swing_length on the batter's
// own swinging strikes — the same fields pitcher-statcast-profile.ts
// reads for a pitcher's whiff quality, just seen from the batter's side
// (how far off HIS swings are, against every pitcher he's faced, not one
// pitcher's whiffs against everybody). Computed here instead of a second
// fetch since it's already in this response.

import type { MissWindow } from '@/lib/pitcher-statcast-profile'
import { withSavantCache } from '@/lib/savant-cache'

const SEASON = 2026

export type MissByPitch = { pitchType: string; pitchName: string; whiffs: number; avgMissDistanceIn: number | null; avgSwingLengthIn: number | null }
const MIN_PITCH_WHIFF_SAMPLE = 3 // below this a pitch type's own average is too noisy to show as its own breakdown row

export type BatterBatSpeedProfile = {
  batterId: number
  swingsWithBatSpeed: number
  avgBatSpeed: number | null
  battedBalls: number
  avgWoba: number | null
  avgXwoba: number | null
  avgXslg: number | null // avg estimated_slg_using_speedangle per batted ball — expected slugging from exit velo/launch angle alone, same "physics only" spirit as avgXwoba
  avgExitVelo: number | null // avg launch_speed (mph) on balls actually put in play — how hard he hits the ball, independent of how fast the bat was moving to get there
  xwobaMinusWoba: number | null // + = underperforming contact quality ("loud outs")
  missSeason: MissWindow
  missLast30: MissWindow
  missByPitchSeason: MissByPitch[] // season-long miss distance split by the pitch type he whiffed on — "does he miss sliders by more than fastballs," sorted by whiffs desc
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = '' }
    else current += ch
  }
  cells.push(current.trim())
  return cells
}

export async function getBatterBatSpeedProfile(batterId: number): Promise<BatterBatSpeedProfile | null> {
  return withSavantCache(
    `bat-speed-profile:${batterId}:${SEASON}`,
    21600,
    () => fetchBatterBatSpeedProfile(batterId),
  )
}

async function fetchBatterBatSpeedProfile(batterId: number): Promise<BatterBatSpeedProfile | null> {
  const url = [
    'https://baseballsavant.mlb.com/statcast_search/csv',
    `?all=true&hfGT=R%7C&hfSea=${SEASON}%7C&player_type=batter`,
    `&batters_lookup%5B%5D=${batterId}`,
    `&game_date_gt=${SEASON}-01-01&game_date_lt=${SEASON}-12-31`,
    '&min_pitches=0&min_results=0&group_by=name&sort_col=pitches',
    '&player_event_sort=api_p_release_speed&sort_order=desc&type=details',
  ].join('')

  let text: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TheEdge/1.0)', Accept: 'text/csv,*/*' },
      next: { revalidate: 21600 },
    })
    if (!res.ok) return null
    text = await res.text()
  } catch (err) {
    console.error(`getBatterBatSpeedProfile fetch failed (${batterId}):`, err)
    return null
  }

  const lines = text.trim().split('\n')
  if (lines.length < 2) return null

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿?"|"$/g, ''))
  const idx = (name: string) => headers.indexOf(name)
  const iBatSpeed = idx('bat_speed')
  const iWoba = idx('woba_value')
  const iWobaDenom = idx('woba_denom')
  const iXwoba = idx('estimated_woba_using_speedangle')
  const iXslg = idx('estimated_slg_using_speedangle')
  const iType = idx('type') // 'S' (strike) | 'B' (ball) | 'X' (ball in play) — same convention already relied on in pitcher-statcast-profile.ts
  const iLaunchSpeed = idx('launch_speed')
  const iDesc = idx('description')
  const iMiss = idx('miss_distance')
  const iSwingLen = idx('swing_length')
  const iDate = idx('game_date')
  const iPitchType = idx('pitch_type')
  const iPitchName = idx('pitch_name')

  if (iBatSpeed === -1) return null

  let sumBatSpeed = 0, nBatSpeed = 0
  let sumWoba = 0, sumXwoba = 0, nBattedBalls = 0
  let sumXslg = 0, nXslg = 0
  let sumExitVelo = 0, nExitVelo = 0

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const missSeason = { sumMiss: 0, nMiss: 0, sumLen: 0, nLen: 0, whiffs: 0 }
  const missLast30 = { sumMiss: 0, nMiss: 0, sumLen: 0, nLen: 0, whiffs: 0 }
  const missByPitch = new Map<string, { sumMiss: number; nMiss: number; sumLen: number; nLen: number; whiffs: number }>()
  const pitchNames: Record<string, string> = {}

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]).map(c => c.replace(/^"|"$/g, ''))

    const batSpeed = Number(cells[iBatSpeed])
    if (!Number.isNaN(batSpeed) && cells[iBatSpeed] !== '') { sumBatSpeed += batSpeed; nBatSpeed++ }

    // woba_denom > 0 marks a plate-appearance-ending batted ball (not every
    // pitch has a woba value — only the one that ends the PA).
    const denom = iWobaDenom !== -1 ? Number(cells[iWobaDenom]) : NaN
    if (denom > 0) {
      const woba = Number(cells[iWoba])
      const xwoba = iXwoba !== -1 ? Number(cells[iXwoba]) : NaN
      if (!Number.isNaN(woba) && !Number.isNaN(xwoba)) {
        sumWoba += woba
        sumXwoba += xwoba
        nBattedBalls++
      }
      const xslg = iXslg !== -1 ? Number(cells[iXslg]) : NaN
      if (!Number.isNaN(xslg)) { sumXslg += xslg; nXslg++ }
    }

    if (iType !== -1 && cells[iType] === 'X') {
      const ev = iLaunchSpeed !== -1 ? Number(cells[iLaunchSpeed]) : NaN
      if (!Number.isNaN(ev)) { sumExitVelo += ev; nExitVelo++ }
    }

    const description = iDesc !== -1 ? cells[iDesc] : ''
    if (description === 'swinging_strike' || description === 'swinging_strike_blocked') {
      const miss = iMiss !== -1 ? Number(cells[iMiss]) : NaN
      const swingLen = iSwingLen !== -1 ? Number(cells[iSwingLen]) : NaN
      const gameDate = iDate !== -1 ? new Date(cells[iDate]) : null
      const isRecent = gameDate ? gameDate >= thirtyDaysAgo : false

      missSeason.whiffs++
      if (!Number.isNaN(miss)) { missSeason.sumMiss += miss; missSeason.nMiss++ }
      if (!Number.isNaN(swingLen)) { missSeason.sumLen += swingLen; missSeason.nLen++ }

      if (isRecent) {
        missLast30.whiffs++
        if (!Number.isNaN(miss)) { missLast30.sumMiss += miss; missLast30.nMiss++ }
        if (!Number.isNaN(swingLen)) { missLast30.sumLen += swingLen; missLast30.nLen++ }
      }

      const pitchType = iPitchType !== -1 ? cells[iPitchType] : ''
      if (pitchType) {
        const bucket = missByPitch.get(pitchType) ?? { sumMiss: 0, nMiss: 0, sumLen: 0, nLen: 0, whiffs: 0 }
        bucket.whiffs++
        if (!Number.isNaN(miss)) { bucket.sumMiss += miss; bucket.nMiss++ }
        if (!Number.isNaN(swingLen)) { bucket.sumLen += swingLen; bucket.nLen++ }
        missByPitch.set(pitchType, bucket)
        if (iPitchName !== -1 && cells[iPitchName] && !pitchNames[pitchType]) pitchNames[pitchType] = cells[iPitchName]
      }
    }
  }

  if (nBatSpeed === 0 && nBattedBalls === 0) return null

  const avgWoba = nBattedBalls > 0 ? sumWoba / nBattedBalls : null
  const avgXwoba = nBattedBalls > 0 ? sumXwoba / nBattedBalls : null
  const avgXslg = nXslg > 0 ? sumXslg / nXslg : null
  const avgExitVelo = nExitVelo > 0 ? sumExitVelo / nExitVelo : null

  const toWindow = (w: typeof missSeason): MissWindow => ({
    whiffs: w.whiffs,
    avgMissDistanceIn: w.nMiss > 0 ? Math.round((w.sumMiss / w.nMiss) * 10) / 10 : null,
    avgSwingLengthIn: w.nLen > 0 ? Math.round((w.sumLen / w.nLen) * 10) / 10 : null,
  })

  const missByPitchSeason: MissByPitch[] = [...missByPitch.entries()]
    .filter(([, w]) => w.whiffs >= MIN_PITCH_WHIFF_SAMPLE)
    .map(([pitchType, w]) => ({ pitchType, pitchName: pitchNames[pitchType] ?? pitchType, ...toWindow(w) }))
    .sort((a, b) => b.whiffs - a.whiffs)

  return {
    batterId,
    swingsWithBatSpeed: nBatSpeed,
    avgBatSpeed: nBatSpeed > 0 ? Math.round((sumBatSpeed / nBatSpeed) * 10) / 10 : null,
    battedBalls: nBattedBalls,
    avgWoba: avgWoba !== null ? Math.round(avgWoba * 1000) / 1000 : null,
    avgXwoba: avgXwoba !== null ? Math.round(avgXwoba * 1000) / 1000 : null,
    avgXslg: avgXslg !== null ? Math.round(avgXslg * 1000) / 1000 : null,
    avgExitVelo: avgExitVelo !== null ? Math.round(avgExitVelo * 10) / 10 : null,
    xwobaMinusWoba: avgWoba !== null && avgXwoba !== null ? Math.round((avgXwoba - avgWoba) * 1000) / 1000 : null,
    missSeason: toWindow(missSeason),
    missLast30: toWindow(missLast30),
    missByPitchSeason,
  }
}

// Bounded concurrency — a flat Promise.all across up to ~100 batters would
// fire that many simultaneous ~2-2.5MB CSV pulls at Savant at once, which
// risks looking like abuse (same reasoning as mapWithConcurrency in
// player-statcast-history.ts). Each player's fetch is independently cached
// by URL for 6h (see `next: { revalidate: 21600 }` above), so this cost is
// only paid once per player per 6h window, not on every page view — 8-at-
// a-time keeps that refresh from hammering Savant all at once.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    results.push(...await Promise.all(batch.map(fn)))
  }
  return results
}

// Fetches full bat-speed profiles (bat speed, contact quality, miss
// precision — everything the radar's 5 axes need) for a wide batter pool
// in one bounded-concurrency pass, keyed by batter id so callers can join
// it back against whatever season-stats/name/team source they already
// have (see src/app/page.tsx's top-100-by-plate-appearances pool).
export async function getBatSpeedProfilesForBatters(batterIds: number[], concurrency = 8): Promise<Map<number, BatterBatSpeedProfile>> {
  const pairs = await mapWithConcurrency(batterIds, concurrency, async id => [id, await getBatterBatSpeedProfile(id)] as const)
  const map = new Map<number, BatterBatSpeedProfile>()
  for (const [id, profile] of pairs) if (profile) map.set(id, profile)
  return map
}
