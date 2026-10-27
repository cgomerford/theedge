'use client'

// src/app/mlb/lab/batting-lab/[playerId]/LabShell.tsx (was layout.tsx; the server layout.tsx now gates it)
//
// Batter shell — header (name/team/headshot) + sub-tab nav, wrapping
// every /mlb/lab/batting-lab/[playerId]/* tab page. Fetches the batter's
// real data ONCE here (BattingLabProvider) so switching tabs doesn't
// re-fetch. Mirrors the Pitching Lab's own layout.tsx exactly.

import Link from 'next/link'
import { Suspense } from 'react'
import Tabs from '@/components/ui/Tabs'
import { usePathname, useParams } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import LabPlayerHeader from '@/components/labs/LabPlayerHeader'
import { MLB_TEAMS } from '@/lib/teams'
import { BattingLabProvider, useBattingLabData } from '@/lib/batting-lab-context'

// Same structure as the Pitching Lab: Overview, vs pitch type and Location Lab are open to everyone; the rest need an account.
const MAIN = [
  { seg: '',            label: 'Overview'         },
  { seg: 'arsenal',     label: 'vs pitch type'    },
  { seg: 'location',    label: 'Location Lab'     },
  { seg: 'hot-zones',   label: 'Hot Zone Overlay' },
  { seg: 'sequencing',  label: 'Sequencing'       },
  { seg: 'h2h',         label: 'H2H'              },
  { seg: 'trends',      label: 'Trends'           },
]
const MORE = [
  { seg: 'spray',      label: 'Spray'        },
  { seg: 'swing',      label: 'Swing'        },
  { seg: 'contact',    label: 'Contact'      },
  { seg: 'outcomes',   label: 'Outcomes'     },
  { seg: 'platoon',    label: 'Platoon'      },
  { seg: 'approach',   label: 'Approach'     },
  // Reaction Window archived (2026-09-14): route/component left on disk.
]
const TABS = [...MAIN, ...MORE]

function ShellHeader({ playerId, playerName, followSlot }: { playerId: number; playerName: string; followSlot?: React.ReactNode }) {
  const { data, failed } = useBattingLabData()
  const pathname = usePathname()
  const base = `/mlb/lab/batting-lab/${playerId}`

  const team = MLB_TEAMS.find(t => t.abbrev === data?.abbr)
  return (
    <div className="border-b border-[#E8E4DC]">
      <LabPlayerHeader id={playerId} name={data?.name ?? playerName} teamId={team?.id} teamAbbr={data?.abbr} teamName={team?.name}
        facts={[data?.bio.position, data?.bio.bats ? `Bats ${data.bio.bats}` : null].filter(Boolean).join(' · ')}
        followSlot={followSlot} changeHref="/mlb/lab/batting-lab" changeLabel="Change batter" />

      <div style={{ maxWidth: 1360, margin: '0 auto', paddingLeft: 24, paddingRight: 24 }} className="">
        <Suspense fallback={null}>
          <Tabs
            label="Batter lab sections"
            sticky
            activeId={MAIN.some(t => (t.seg ? `${base}/${t.seg}` : base) === pathname) ? (MAIN.find(t => (t.seg ? `${base}/${t.seg}` : base) === pathname)!.seg || 'overview') : ''}
            tabs={MAIN.map(t => ({ id: t.seg || 'overview', label: t.label, href: t.seg ? `${base}/${t.seg}` : base }))}
          />
          <div className="flex items-center gap-3" style={{ marginTop: 2 }}>
            <span className="text-[12px] font-semibold text-[#8A8577] shrink-0">More in the lab</span>
            <div className="min-w-0 flex-1">
              <Tabs
                label="More batter lab sections"
                sticky={false}
                activeId={MORE.find(t => `${base}/${t.seg}` === pathname)?.seg ?? ''}
                tabs={MORE.map(t => ({ id: t.seg, label: t.label, href: `${base}/${t.seg}` }))}
              />
            </div>
          </div>
        </Suspense>
      </div>
    </div>
  )
}

export default function BatterLabLayout({ children, playerName, followSlot }: { children: React.ReactNode; playerName: string; followSlot?: React.ReactNode }) {
  const params = useParams()
  const playerId = Number(params.playerId)

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav />
      <BattingLabProvider key={playerId} batterId={playerId}>
        <ShellHeader playerId={playerId} playerName={playerName} followSlot={followSlot} />
        <div style={{ maxWidth: 1360, margin: '0 auto', paddingLeft: 24, paddingRight: 24 }} className=" py-8">
          {children}
        </div>
      </BattingLabProvider>
    </main>
  )
}
