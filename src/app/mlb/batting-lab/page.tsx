// src/app/mlb/batting-lab/page.tsx
//
// v1 of the standalone Batting Lab: search any real batter and see real
// season stats/percentiles, zone-by-pitch-type breakdown, bat speed and
// contact quality, and the real reaction-window physics graphic — see
// BattingLabExplorer.tsx + /api/mlb/batting-lab. Mirrors
// /mlb/pitching-lab/page.tsx exactly, batter side. Tonight's games stay
// listed below as a quick jump into the live matchup view for anyone who
// wants that instead.

import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import BattingLabExplorer from '@/components/BattingLabExplorer'
import FeaturedPlayers from '@/components/FeaturedPlayers'
import { getScheduleForDate, slugifyGame } from '@/lib/mlb'
import { getLeaders } from '@/lib/lab'

export const metadata = {
  title: 'Batting Lab · The Edge',
  description: 'Real season stats, zone-by-pitch-type breakdown, bat speed, and contact quality for any MLB batter.',
}

export const revalidate = 1800

export default async function BattingLabPage() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const season = new Date().getFullYear()
  const [games, opsLeaders] = await Promise.all([
    getScheduleForDate(today),
    getLeaders('ops', season, 8).catch(() => []),
  ])

  return (
    <main className="min-h-screen bg-stone-50">
      <SiteHeader variant="page" />
      <MLBSubNav />

      <div className="max-w-[1160px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722] mb-2">Batting Lab</div>
          <div className="text-[26px] font-black text-[#1A1A1A] tracking-tight">Search any batter</div>
          <div className="text-[13px] text-[#57534E] mt-1 max-w-[640px]">
            Real season stats and percentiles, zone-by-pitch-type breakdown, bat speed and contact quality, and a
            real reaction-window physics graphic — not tied to tonight&apos;s slate.
          </div>
        </div>

        <BattingLabExplorer />

        <FeaturedPlayers
          title="Or explore a real current OPS leader"
          statLabel="OPS"
          leaders={opsLeaders}
          labPath="batting-lab"
          fmt={v => v.toFixed(3).replace(/^0\./, '.')}
        />

        {games.length > 0 && (
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="text-[11px] font-mono uppercase tracking-widest text-[#8A8577] mb-3">Or jump into tonight&apos;s live matchup view</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {games.map(g => (
                <Link
                  key={g.gamePk}
                  href={`/mlb/${slugifyGame(g)}?tab=batting`}
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
