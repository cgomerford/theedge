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
import LabLevelBar from '@/components/pitching-lab/LabLevelBar'

const TABS = [
  { seg: '',          label: 'Overview'         },
  { seg: 'arsenal',   label: 'Arsenal'          },
  { seg: 'location',  label: 'Location Lab'     },
  { seg: 'overlay',   label: 'Hot Zone Overlay' },
  { seg: 'shape',     label: 'Shape'            },
  { seg: 'stuff',     label: 'Stuff'            },
  { seg: 'sequencing',label: 'Sequencing'       },
  { seg: 'levels',    label: 'Levels'           },
  { seg: 'h2h',       label: 'H2H'              },
  { seg: 'trends',    label: 'Trends'           },
]

// A minor leaguer with no MLB games only gets the tabs that have data: Overview, plus the tabs that read his per-pitch log at a minor level (Location Lab, Sequencing, Levels) when the
// minor-league pitch-shape tables hold rows for him. Arsenal, Shape, Stuff, Hot Zone Overlay, H2H and Trends read MLB-only tables, so they stay hidden.
function ShellHeader({ playerId, playerName, followSlot, minorsOnly, hasMilbShape }: { playerId: number; playerName: string; followSlot?: React.ReactNode; minorsOnly: boolean; hasMilbShape: boolean }) {
  const { data } = usePitchingLabData()
  const pathname = usePathname()
  const base = `/mlb/lab/pitching-lab/${playerId}`
  const name = data?.name ?? playerName
  const shown = minorsOnly ? TABS.filter(t => t.seg === '' || (hasMilbShape && LEVEL_TABS.includes(t.seg))) : TABS
  // Only what the lab data already holds; a missing part is dropped (hand, record and innings are not in it today).

  const team = MLB_TEAMS.find(t => t.abbrev === data?.abbr)
  return (
    <div className="border-b border-[#E8E4DC]">
      <LabPlayerHeader id={playerId} name={name} teamId={team?.id} teamAbbr={data?.abbr} teamName={team?.name}
        facts={[data?.fullStats?.era != null ? `${data.fullStats.era.toFixed(2)} ERA` : null].filter(Boolean).join(' · ')}
        followSlot={followSlot} changeHref="/mlb/lab/pitching-lab" changeLabel="Change pitcher" />

      <div style={{ maxWidth: 1800, margin: '0 auto', paddingLeft: 32, paddingRight: 32 }} className="">
        <Suspense fallback={null}>
          <Tabs
            label="Pitcher lab sections"
            sticky
            activeId={TABS.map(t => (t.seg ? `${base}/${t.seg}` : base)).indexOf(pathname) >= 0 ? (TABS[TABS.map(t => (t.seg ? `${base}/${t.seg}` : base)).indexOf(pathname)].seg || 'overview') : undefined}
            tabs={shown.map(t => ({ id: t.seg || 'overview', label: t.label, href: t.seg ? `${base}/${t.seg}` : base }))}
          />
        </Suspense>
      </div>
    </div>
  )
}

/** The tabs that read a level: they show the Pitching Lab's level selector. */
const LEVEL_TABS = ['location', 'sequencing', 'levels']

export default function PitcherLabLayout({ children, playerName, followSlot, minorsOnly, hasMilbShape }: { children: React.ReactNode; playerName: string; followSlot?: React.ReactNode; minorsOnly: boolean; hasMilbShape: boolean }) {
  const params = useParams()
  const pathname = usePathname()
  const playerId = Number(params.playerId)

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav />
      <PitchingLabProvider key={playerId} pitcherId={playerId}>
        <ShellHeader playerId={playerId} playerName={playerName} followSlot={followSlot} minorsOnly={minorsOnly} hasMilbShape={hasMilbShape} />
        <div style={{ maxWidth: 1800, margin: '0 auto', paddingLeft: 32, paddingRight: 32 }} className=" py-8">
          {LEVEL_TABS.some(t => pathname.endsWith(`/${t}`)) && <LabLevelBar playerId={playerId} />}
          {children}
        </div>
      </PitchingLabProvider>
    </main>
  )
}
