import { createClient } from '@supabase/supabase-js'
import { getSeasonGamePks, getEligibleRelieverIds, getBullpenReport } from '../src/lib/bullpen-usage'
import { getTeamRoster, LEAGUE_BY_TEAM_ID } from '../src/lib/lab'

const TEAM_IDS = Object.keys(LEAGUE_BY_TEAM_ID).map(Number)
const SEASON = new Date().getFullYear()
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

async function main() {
  for (const teamId of TEAM_IDS) {
    const gamePks = await getSeasonGamePks(teamId, SEASON)
    const roster = await getTeamRoster(teamId)
    const rosterIds = new Set(roster.map(p => p.id))
    const pitcherIds = roster.filter(p => p.primaryPosition === 'P').map(p => p.id)
    const eligibleIds = await getEligibleRelieverIds(pitcherIds, SEASON, rosterIds)

    const report = await getBullpenReport(teamId, gamePks, SEASON)
    const eligibleRelievers = report.relievers.filter(r => eligibleIds.has(r.playerId))

    console.log(`Team ${teamId}: ${eligibleRelievers.length} relievers. Sample:`, eligibleRelievers[0])

    const relieverRows = eligibleRelievers.flatMap(r =>
      r.lines.map(line => ({
        team_id: teamId, season: SEASON, player_id: r.playerId, player_name: r.playerName,
        inning: line.inning, battersFaced: line.battersFaced, strikeouts: line.strikeouts,
        walks: line.walks, hit_by_pitch: line.hitByPitch, home_runs: line.homeRuns,
        avg_runs_allowed: line.avgRunsAllowed, blown_leads: line.blownLeads, blown_saves: line.blownSaves,
        appearances_in_inning: line.appearancesInInning, most_used_inning: r.mostUsedInning,
        best_inning: r.bestInning?.inning ?? null, best_inning_avg_runs: r.bestInning?.avgRunsAllowed ?? null,
        total_blown_leads: r.totalBlownLeads, total_blown_saves: r.totalBlownSaves,
        summary: r.summary, games_sampled: report.gamesSampled,
      }))
    )

    const usageRows = report.inningUsage.map(u => ({
      team_id: teamId, season: SEASON, inning: u.inning, avg_balls_seen: u.avgBallsSeen,
      avg_strikes_seen: u.avgStrikesSeen, avg_runs_scored: u.avgRunsScored, avg_balls_thrown: u.avgBallsThrown,
      avg_strikes_thrown: u.avgStrikesThrown, avg_runs_allowed: u.avgRunsAllowed, games_sampled: u.gamesSampled,
    }))

    console.log(`Upserting ${relieverRows.length} reliever rows, ${usageRows.length} usage rows for team ${teamId}. Ctrl+C within 5s to abort.`)
    await new Promise(r => setTimeout(r, 5000))

    if (relieverRows.length > 0) {
      const { error: relieverErr } = await supabase
        .from('bullpen_inning_reports')
        .upsert(relieverRows, { onConflict: 'team_id,season,player_id,inning' })
      if (relieverErr) console.error(`Team ${teamId} reliever upsert failed:`, relieverErr.message)
    }

    if (usageRows.length > 0) {
      const { error: usageErr } = await supabase
        .from('bullpen_inning_usage')
        .upsert(usageRows, { onConflict: 'team_id,season,inning' })
      if (usageErr) console.error(`Team ${teamId} usage upsert failed:`, usageErr.message)
    }
  }
  console.log('Done.')
}

main()