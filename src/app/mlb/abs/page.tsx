// src/app/mlb/abs/page.tsx
//
// Dedicated ABS (Automated Ball-Strike) Challenge deep-dive page. Reuses
// the same real, per-pitch-backfilled data (abs_challenge_log) and the
// existing 2x2 homepage grid (AbsChallengeGrid, exported from
// MlbDeepDives.tsx) so both places stay in sync off one data layer, then
// adds a page-only "all-round" radar/leaderboard section that needs more
// room than a homepage card can give it.

import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import { getABSChallengeLeaderboard } from '@/lib/abs-challenges'
import { getAbsInningBreakdown, getAbsDailyTrendByTeam, getPlayerChallengeEfficiency } from '@/lib/abs-challenge-log'
import { AbsChallengeGrid } from '@/components/MlbDeepDives'
import AbsRadarSection from '@/components/AbsRadarSection'

export const metadata = {
  title: 'ABS Challenges · The Edge',
  description: "Who challenges the Automated Ball-Strike system, how often it works, and who's the best all-round challenger in baseball.",
}

export const revalidate = 1800

export default async function AbsChallengesPage() {
  const [ledger, inningBreakdown, dailyTrendByTeam, playerEfficiency] = await Promise.all([
    getABSChallengeLeaderboard(),
    getAbsInningBreakdown(),
    getAbsDailyTrendByTeam(),
    getPlayerChallengeEfficiency(),
  ])

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">

        <div>
          <div className="text-[26px] font-black text-[#1A1A1A] tracking-tight">ABS Challenges</div>
          <div className="text-[13px] text-[#57534E] mt-1 max-w-[720px]">
            MLB&apos;s Automated Ball-Strike system lets each team challenge a small number of ball/strike calls per game —
            the batter can challenge a call on themselves, or the catcher/pitcher can challenge a call against the batter.
            A challenge sends the pitch to an automated strike-zone review; if the review disagrees with the umpire, the
            call is <span className="font-bold text-[#1A1A1A]">overturned</span> (challenge succeeds). If it agrees, the
            original call is <span className="font-bold text-[#1A1A1A]">confirmed</span> (challenge fails, and the
            challenging team loses one for the rest of the game). Every chart below is built from real per-pitch
            challenge data pulled straight off MLB&apos;s live feed. The one estimate is how close each challenged pitch was
            to the zone edge (the Precision and Miss by figures), which is calculated from the pitch location.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <AbsChallengeGrid
            ledger={ledger}
            inningBreakdown={inningBreakdown}
            dailyTrendByTeam={dailyTrendByTeam}
            playerEfficiency={playerEfficiency}
          />
        </div>

        <AbsRadarSection players={playerEfficiency} />

      </div>
    </main>
  )
}
