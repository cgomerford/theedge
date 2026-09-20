// src/app/mlb/pitching-lab/page.tsx
//
// v1 of the standalone Pitching Lab: search any real pitcher and see the
// same real arsenal/movement/count-tendency/sequencing/hot-zone data the
// per-game Pitching Lab tab already renders — see PitchingLabExplorer.tsx
// + /api/mlb/pitching-lab. Tonight's games stay listed below as a quick
// jump into the live matchup view (GamePageShell's own Pitching Lab tab,
// built on PitchingSlotAsync.tsx) for anyone who wants that instead.

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import PitchingLabExplorer from '@/components/PitchingLabExplorer'
import FeaturedPlayers from '@/components/FeaturedPlayers'
import { getScheduleForDate, slugifyGame } from '@/lib/mlb'
import { getLeaders } from '@/lib/lab'

export const metadata = {
  title: 'Pitching Lab · The Edge',
  description: 'Full arsenal breakdown, count tendency, pitch sequencing, and hot zones for any MLB pitcher.',
}

export const revalidate = 1800

export default async function PitchingLabPage() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const season = new Date().getFullYear()
  const [games, eraLeaders] = await Promise.all([
    getScheduleForDate(today),
    getLeaders('era', season, 8).catch(() => []),
  ])

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />
      <MLBSubNav />

      <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-2">Pitching Lab</div>
          <div className="text-[26px] font-black text-[#1A1A1A] tracking-tight">Search any pitcher</div>
          <div className="text-[13px] text-[#57534E] mt-1 max-w-[640px]">
            Real arsenal breakdown, pitch movement, count tendency, sequencing, and hot zones — not tied to
            tonight&apos;s slate. Same real data the per-game Pitching Lab tab uses.
          </div>
        </div>

        <PitchingLabExplorer />

        <FeaturedPlayers
          title="Or explore a real current ERA leader"
          statLabel="ERA"
          leaders={eraLeaders}
          labPath="pitching-lab"
          fmt={v => v.toFixed(2)}
        />

        {games.length > 0 && (
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="text-[11px] font-mono uppercase tracking-widest text-[#8A8577] mb-3">Or jump into tonight&apos;s live matchup view</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {games.map(g => (
                <Link
                  key={g.gamePk}
                  href={`/mlb/${slugifyGame(g)}?tab=pitching`}
                  className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2.5 text-[13px] font-medium text-[#1A1A1A] hover:border-[#FF5722] transition"
                >
                  <span>{g.teams.away.team.abbreviation} @ {g.teams.home.team.abbreviation}</span>
                  <span className="text-[10px] font-mono uppercase tracking-wide text-[#FF5722]">Open →</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
