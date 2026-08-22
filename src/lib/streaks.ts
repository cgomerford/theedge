const MLB_API = 'https://statsapi.mlb.com/api/v1'

// ============================================================
// TYPES
// ============================================================
export type PitcherTrend = {
  player_id: number
  player_name: string
  last_3_era: number | null
  last_3_k_per_9: number | null
  last_3_bb_per_9: number | null
  last_3_innings: number
  current_scoreless_innings: number
  hr_allowed_last_3: number
  trend_label: string | null  // e.g. "Hot", "Cold", "Steady"
}

export type BatterStreak = {
  player_id: number
  player_name: string
  position: string | null
  on_base_streak: number  // games reached base
  hit_streak: number  // games with 1+ hits
  last_5_avg: number | null
  last_5_obp: number | null
  hits_last_10: number
  is_hot: boolean
  is_cold: boolean
  streak_label: string | null  // e.g. "8-game on-base streak"
}

export type GameStreaks = {
  home_pitcher: PitcherTrend | null
  away_pitcher: PitcherTrend | null
  home_hot_batters: BatterStreak[]
  away_hot_batters: BatterStreak[]
  home_cold_batters: BatterStreak[]
  away_cold_batters: BatterStreak[]
}

// ============================================================
// PITCHER TRENDS
// ============================================================
export async function getPitcherTrend(pitcherId: number, pitcherName: string): Promise<PitcherTrend | null> {
  try {
    // Fetch last 5 game logs (we'll use last 3)
    const url = `${MLB_API}/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${new Date().getFullYear()}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    
    const logs = data.stats?.[0]?.splits ?? []
    if (logs.length === 0) return null

    // Sort by date descending, take last 3
    const sortedLogs = logs
      .filter((l: any) => l.stat?.gamesStarted === 1) // starts only
      .sort((a: any, b: any) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 3)

    if (sortedLogs.length === 0) return null

    let totalER = 0
    let totalK = 0
    let totalBB = 0
    let totalIP = 0
    let totalHR = 0
    let scorelessStreak = 0
    let scorelessActive = true

    for (const log of sortedLogs) {
      const stat = log.stat ?? {}
      const ip = parseFloat(stat.inningsPitched ?? '0')
      const er = parseInt(stat.earnedRuns ?? '0')
      const k = parseInt(stat.strikeOuts ?? '0')
      const bb = parseInt(stat.baseOnBalls ?? '0')
      const hr = parseInt(stat.homeRuns ?? '0')

      totalIP += ip
      totalER += er
      totalK += k
      totalBB += bb
      totalHR += hr

      // Track scoreless innings streak (most recent first)
      if (scorelessActive) {
        if (er === 0) {
          scorelessStreak += ip
        } else {
          scorelessActive = false
        }
      }
    }

    const last_3_era = totalIP > 0 ? (totalER * 9) / totalIP : null
    const last_3_k_per_9 = totalIP > 0 ? (totalK * 9) / totalIP : null
    const last_3_bb_per_9 = totalIP > 0 ? (totalBB * 9) / totalIP : null

    // Trend label
    let trend_label: string | null = null
    if (last_3_era !== null && last_3_era < 2.5) trend_label = 'Rolling'
    else if (last_3_era !== null && last_3_era > 5.5) trend_label = 'Struggling'
    else if (scorelessStreak >= 12) trend_label = 'Scoreless streak'

    return {
      player_id: pitcherId,
      player_name: pitcherName,
      last_3_era: last_3_era !== null ? Math.round(last_3_era * 100) / 100 : null,
      last_3_k_per_9: last_3_k_per_9 !== null ? Math.round(last_3_k_per_9 * 10) / 10 : null,
      last_3_bb_per_9: last_3_bb_per_9 !== null ? Math.round(last_3_bb_per_9 * 10) / 10 : null,
      last_3_innings: Math.round(totalIP * 10) / 10,
      current_scoreless_innings: Math.round(scorelessStreak * 10) / 10,
      hr_allowed_last_3: totalHR,
      trend_label,
    }
  } catch (err) {
    console.error(`Pitcher trend fetch failed for ${pitcherId}:`, err)
    return null
  }
}

// ============================================================
// BATTER STREAKS
// ============================================================
export async function getTopBatterStreaks(teamId: number): Promise<{
  hot: BatterStreak[]
  cold: BatterStreak[]
  all: BatterStreak[]
}> {
  try {
    // Fetch team roster
    const rosterUrl = `${MLB_API}/teams/${teamId}/roster?rosterType=Active`
    const rosterRes = await fetch(rosterUrl, { signal: AbortSignal.timeout(8000), next: { revalidate: 1800 } })
    if (!rosterRes.ok) return { hot: [], cold: [], all: [] }
    const rosterData = await rosterRes.json()

    // Filter to position players only (no pitchers)
    const batters = (rosterData.roster ?? [])
      .filter((p: any) => p.position?.code !== '1' && p.position?.type !== 'Pitcher')
      .slice(0, 13) // limit to 13 to control API calls

    const streaks: BatterStreak[] = []

    // Process in batches of 4 to respect rate limits
    for (let i = 0; i < batters.length; i += 4) {
      const batch = batters.slice(i, i + 4)
      const results = await Promise.all(
        batch.map((b: any) => getBatterStreak(b.person.id, b.person.fullName, b.position?.abbreviation))
      )
      results.forEach(r => { if (r) streaks.push(r) })
    }

    // Categorize
    const hot = streaks
      .filter(s => s.is_hot)
      .sort((a, b) => Math.max(b.on_base_streak, b.hit_streak) - Math.max(a.on_base_streak, a.hit_streak))
      .slice(0, 3)
    const cold = streaks
      .filter(s => s.is_cold)
      .sort((a, b) => (a.last_5_avg ?? 1) - (b.last_5_avg ?? 1))
      .slice(0, 2)
    // `all` — every batter actually scanned (up to 13), unfiltered. Added
    // 2026-08-20 so LiteralStreakNotes can independently find real
    // consecutive-game streaks regardless of whether that batter happened
    // to be one of the 5 hot/cold picks above — those two lists are
    // selected by a DIFFERENT metric (is_hot also triggers on rolling AVG,
    // not just streak length), so a batter with a genuine 7-game hit
    // streak could be excluded from `hot` in favor of someone hot purely
    // by average, and previously never got a chance to show up as a note
    // at all.
    return { hot, cold, all: streaks }
  } catch (err) {
    console.error(`Team streak fetch failed for ${teamId}:`, err)
    return { hot: [], cold: [], all: [] }
  }
}

async function getBatterStreak(
  playerId: number, 
  playerName: string,
  position: string | null
): Promise<BatterStreak | null> {
  try {
       const url = `${MLB_API}/people/${playerId}/stats?stats=gameLog&group=hitting&season=${new Date().getFullYear()}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), next: { revalidate: 1800 } })
    if (!res.ok) return null
    const data = await res.json()

    const logs = data.stats?.[0]?.splits ?? []
    if (logs.length < 3) return null  // not enough data

    // Sort descending by date
    const sortedLogs = logs
      .sort((a: any, b: any) => (b.date ?? '').localeCompare(a.date ?? ''))

    // Compute on-base streak
    let onBaseStreak = 0
    for (const log of sortedLogs) {
      const stat = log.stat ?? {}
      const h = parseInt(stat.hits ?? '0')
      const bb = parseInt(stat.baseOnBalls ?? '0')
      const hbp = parseInt(stat.hitByPitch ?? '0')
      const ab = parseInt(stat.atBats ?? '0')
      
      if (ab === 0 && bb === 0 && hbp === 0) continue // didn't play
      
      if (h > 0 || bb > 0 || hbp > 0) {
        onBaseStreak++
      } else {
        break
      }
    }

    // Compute hit streak
    let hitStreak = 0
    for (const log of sortedLogs) {
      const stat = log.stat ?? {}
      const h = parseInt(stat.hits ?? '0')
      const ab = parseInt(stat.atBats ?? '0')
      
      if (ab === 0) continue
      
      if (h > 0) {
        hitStreak++
      } else {
        break
      }
    }

    // Last 5 games average
    const last5 = sortedLogs.filter((l: any) => parseInt(l.stat?.atBats ?? '0') > 0).slice(0, 5)
    let last5H = 0, last5AB = 0, last5OBP_num = 0, last5PA = 0
    for (const log of last5) {
      const stat = log.stat ?? {}
      const h = parseInt(stat.hits ?? '0')
      const ab = parseInt(stat.atBats ?? '0')
      const bb = parseInt(stat.baseOnBalls ?? '0')
      const hbp = parseInt(stat.hitByPitch ?? '0')
      const sf = parseInt(stat.sacFlies ?? '0')
      
      last5H += h
      last5AB += ab
      last5OBP_num += h + bb + hbp
      last5PA += ab + bb + hbp + sf
    }

    const last_5_avg = last5AB > 0 ? last5H / last5AB : null
    const last_5_obp = last5PA > 0 ? last5OBP_num / last5PA : null

    // Last 10 hits
    const last10 = sortedLogs.filter((l: any) => parseInt(l.stat?.atBats ?? '0') > 0).slice(0, 10)
    const hits_last_10 = last10.reduce((sum: number, l: any) => sum + parseInt(l.stat?.hits ?? '0'), 0)

    // Hot/cold classification
    const is_hot = onBaseStreak >= 5 || hitStreak >= 4 || (last_5_avg !== null && last_5_avg >= 0.350)
    const is_cold = (last_5_avg !== null && last_5_avg < 0.150 && last5AB >= 12) || (hitStreak === 0 && hits_last_10 < 3 && last10.length >= 7)

    // Streak label
    let streak_label: string | null = null
    if (onBaseStreak >= 8) streak_label = `${onBaseStreak}-game on-base streak`
    else if (hitStreak >= 5) streak_label = `${hitStreak}-game hit streak`
    else if (is_hot && last_5_avg !== null) streak_label = `Hitting .${Math.round(last_5_avg * 1000)} over L5`
    else if (is_cold && hitStreak === 0) {
      // Find the 0-fer length
      let zeroFer = 0
      for (const log of sortedLogs) {
        const stat = log.stat ?? {}
        const h = parseInt(stat.hits ?? '0')
        const ab = parseInt(stat.atBats ?? '0')
        if (ab === 0) continue
        if (h === 0) zeroFer += ab
        else break
      }
      if (zeroFer >= 8) streak_label = `0-for-${zeroFer} stretch`
    }

    return {
      player_id: playerId,
      player_name: playerName,
      position: position,
      on_base_streak: onBaseStreak,
      hit_streak: hitStreak,
      last_5_avg: last_5_avg !== null ? Math.round(last_5_avg * 1000) / 1000 : null,
      last_5_obp: last_5_obp !== null ? Math.round(last_5_obp * 1000) / 1000 : null,
      hits_last_10,
      is_hot,
      is_cold,
      streak_label,
    }
  } catch (err) {
    return null
  }
}

// ============================================================
// MAIN AGGREGATOR
// ============================================================
export async function aggregateGameStreaks(
  homeTeamId: number,
  awayTeamId: number,
  homePitcherId: number | null,
  homePitcherName: string | null,
  awayPitcherId: number | null,
  awayPitcherName: string | null,
): Promise<GameStreaks> {
  const [
    homePitcher,
    awayPitcher,
    homeBatters,
    awayBatters,
  ] = await Promise.all([
    homePitcherId && homePitcherName ? getPitcherTrend(homePitcherId, homePitcherName) : Promise.resolve(null),
    awayPitcherId && awayPitcherName ? getPitcherTrend(awayPitcherId, awayPitcherName) : Promise.resolve(null),
    getTopBatterStreaks(homeTeamId),
    getTopBatterStreaks(awayTeamId),
  ])

  return {
    home_pitcher: homePitcher,
    away_pitcher: awayPitcher,
    home_hot_batters: homeBatters.hot,
    away_hot_batters: awayBatters.hot,
    home_cold_batters: homeBatters.cold,
    away_cold_batters: awayBatters.cold,
  }
}