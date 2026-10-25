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
import { PitchingLabProvider, usePitchingLabData } from '@/lib/pitching-lab-context'

const TABS = [
  { seg: '',          label: 'Overview'         },
  { seg: 'arsenal',   label: 'Arsenal'          },
  { seg: 'location',  label: 'Location Lab'     },
  { seg: 'overlay',   label: 'Hot Zone Overlay' },
  { seg: 'shape',     label: 'Shape'            },
  { seg: 'stuff',     label: 'Edge+'            },
  { seg: 'sequencing',label: 'Sequencing'       },
  { seg: 'h2h',       label: 'H2H'              },
  { seg: 'trends',    label: 'Trends'           },
]

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

function ShellHeader({ playerId, playerName }: { playerId: number; playerName: string }) {
  const { data, failed } = usePitchingLabData()
  const pathname = usePathname()
  const base = `/mlb/lab/pitching-lab/${playerId}`

  return (
    <div className="border-b border-[#E8E4DC]">
      <div style={{ maxWidth: 1600, margin: '0 auto' }} className="px-4 sm:px-6 py-5 flex items-center gap-4 flex-wrap">
        <img
          src={mlbHeadshot(playerId)}
          alt=""
          width={48}
          height={48}
          style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', background: '#F4F1EA', border: '1px solid #DEDACE' }}
        />
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#FF5722]">
            {data ? `${data.abbr} · SP` : 'Pitching Lab'}
          </div>
          <h1 className="m-0 text-[22px] font-black text-[#1A1A1A] tracking-tight leading-tight">
            {data?.name ?? playerName}
          </h1>
        </div>
        <Link
          href="/mlb/lab/pitching-lab"
          className="ml-auto text-[11px] font-mono uppercase tracking-widest text-[#8A8577] hover:text-[#1A1A1A]"
        >
          ← Search another pitcher
        </Link>
      </div>

      <div style={{ maxWidth: 1600, margin: '0 auto' }} className="px-4 sm:px-6">
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

export default function PitcherLabLayout({ children, playerName }: { children: React.ReactNode; playerName: string }) {
  const params = useParams()
  const playerId = Number(params.playerId)

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav />
      <PitchingLabProvider key={playerId} pitcherId={playerId}>
        <ShellHeader playerId={playerId} playerName={playerName} />
        <div style={{ maxWidth: 1600, margin: '0 auto' }} className="px-4 sm:px-6 py-8">
          {children}
        </div>
      </PitchingLabProvider>
    </main>
  )
}
