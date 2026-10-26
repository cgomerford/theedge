'use client'

// src/app/mlb/lab/pitching-lab/[playerId]/LabShell.tsx (was layout.tsx; the server layout.tsx now Pro-gates it)
//
// Pitcher shell — header (name/team/headshot) + sub-tab nav, wrapping
// every /mlb/lab/pitching-lab/[playerId]/* tab page. Fetches the pitcher's
// real data ONCE here (PitchingLabProvider) so switching tabs doesn't
// re-fetch. Only Overview and Location Lab have real content today —
// the rest are honest "coming soon" placeholders (see each tab's page.tsx)
// rather than fabricated data, matching the site's real-data-only rule.

import Link from 'next/link'
import { Suspense } from 'react'
import Tabs from '@/components/ui/Tabs'
import { usePathname, useParams } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import LabPlayerHeader from '@/components/labs/LabPlayerHeader'
import { MLB_TEAMS } from '@/lib/teams'
import { PitchingLabProvider, usePitchingLabData } from '@/lib/pitching-lab-context'

const TABS = [
  { seg: '',          label: 'Overview'         },
  { seg: 'arsenal',   label: 'Arsenal'          },
  { seg: 'location',  label: 'Location Lab'     },
  { seg: 'overlay',   label: 'Hot Zone Overlay' },
  { seg: 'shape',     label: 'Shape'            },
  { seg: 'stuff',     label: 'Stuff'            },
  { seg: 'sequencing',label: 'Sequencing'       },
  { seg: 'h2h',       label: 'H2H'              },
  { seg: 'trends',    label: 'Trends'           },
]

function ShellHeader({ playerId, playerName, followSlot }: { playerId: number; playerName: string; followSlot?: React.ReactNode }) {
  const { data } = usePitchingLabData()
  const pathname = usePathname()
  const base = `/mlb/lab/pitching-lab/${playerId}`
  const name = data?.name ?? playerName
  // Only what the lab data already holds; a missing part is dropped (hand, record and innings are not in it today).

  const team = MLB_TEAMS.find(t => t.abbrev === data?.abbr)
  return (
    <div className="border-b border-[#E8E4DC]">
      <LabPlayerHeader id={playerId} name={name} teamId={team?.id} teamAbbr={data?.abbr} teamName={team?.name}
        facts={[data?.fullStats?.era != null ? `${data.fullStats.era.toFixed(2)} ERA` : null].filter(Boolean).join(' · ')}
        followSlot={followSlot} changeHref="/mlb/lab/pitching-lab" changeLabel="Change pitcher" />

      <div style={{ maxWidth: 1360, margin: '0 auto', paddingLeft: 24, paddingRight: 24 }} className="">
        <Suspense fallback={null}>
          <Tabs
            label="Pitcher lab sections"
            sticky
            activeId={TABS.map(t => (t.seg ? `${base}/${t.seg}` : base)).indexOf(pathname) >= 0 ? (TABS[TABS.map(t => (t.seg ? `${base}/${t.seg}` : base)).indexOf(pathname)].seg || 'overview') : undefined}
            tabs={TABS.map(t => ({ id: t.seg || 'overview', label: t.label, href: t.seg ? `${base}/${t.seg}` : base }))}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default function PitcherLabLayout({ children, playerName, followSlot }: { children: React.ReactNode; playerName: string; followSlot?: React.ReactNode }) {
  const params = useParams()
  const playerId = Number(params.playerId)

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav />
      <PitchingLabProvider key={playerId} pitcherId={playerId}>
        <ShellHeader playerId={playerId} playerName={playerName} followSlot={followSlot} />
        <div style={{ maxWidth: 1360, margin: '0 auto', paddingLeft: 24, paddingRight: 24 }} className=" py-8">
          {children}
        </div>
      </PitchingLabProvider>
    </main>
  )
}
