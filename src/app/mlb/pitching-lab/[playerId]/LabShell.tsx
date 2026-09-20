'use client'

// src/app/mlb/pitching-lab/[playerId]/LabShell.tsx (was layout.tsx; the server layout.tsx now Pro-gates it)
//
// Pitcher shell — header (name/team/headshot) + sub-tab nav, wrapping
// every /mlb/pitching-lab/[playerId]/* tab page. Fetches the pitcher's
// real data ONCE here (PitchingLabProvider) so switching tabs doesn't
// re-fetch. Only Overview and Location Lab have real content today —
// the rest are honest "coming soon" placeholders (see each tab's page.tsx)
// rather than fabricated data, matching the site's real-data-only rule.

import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import SiteHeader from '@/components/SiteHeader'
import MLBSubNav from '@/components/MLBSubNav'
import { PitchingLabProvider, usePitchingLabData } from '@/lib/pitching-lab-context'

const TABS = [
  { seg: '',          label: 'Overview'         },
  { seg: 'arsenal',   label: 'Arsenal'          },
  { seg: 'location',  label: 'Location Lab'     },
  { seg: 'overlay',   label: 'Hot Zone Overlay' },
  { seg: 'stuff',     label: 'Edge+'            },
  { seg: 'sequencing',label: 'Sequencing'       },
  { seg: 'h2h',       label: 'H2H'              },
  { seg: 'trends',    label: 'Trends'           },
]

function mlbHeadshot(id: number | string): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`
}

function ShellHeader({ playerId }: { playerId: number }) {
  const { data, failed } = usePitchingLabData()
  const pathname = usePathname()
  const base = `/mlb/pitching-lab/${playerId}`

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
          <div className="text-[22px] font-black text-[#1A1A1A] tracking-tight leading-tight">
            {failed ? 'Couldn’t load pitcher' : data?.name ?? 'Loading…'}
          </div>
        </div>
        <Link
          href="/mlb/pitching-lab"
          className="ml-auto text-[11px] font-mono uppercase tracking-widest text-[#8A8577] hover:text-[#1A1A1A]"
        >
          ← Search another pitcher
        </Link>
      </div>

      <div style={{ maxWidth: 1600, margin: '0 auto' }} className="px-4 sm:px-6 flex gap-1 overflow-x-auto">
        {TABS.map(t => {
          const href = t.seg ? `${base}/${t.seg}` : base
          const active = pathname === href
          return (
            <Link
              key={t.seg || 'overview'}
              href={href}
              className={`whitespace-nowrap font-mono uppercase tracking-wider text-[11px] px-3 py-2.5 border-b-2 transition ${
                active ? 'border-[#FF5722] text-[#1A1A1A]' : 'border-transparent text-[#8A8577] hover:text-[#1A1A1A]'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default function PitcherLabLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const playerId = Number(params.playerId)

  return (
    <main className="min-h-screen bg-[#FAF8F3]">
      <SiteHeader variant="page" />
      <MLBSubNav />
      <PitchingLabProvider key={playerId} pitcherId={playerId}>
        <ShellHeader playerId={playerId} />
        <div style={{ maxWidth: 1600, margin: '0 auto' }} className="px-4 sm:px-6 py-8">
          {children}
        </div>
      </PitchingLabProvider>
    </main>
  )
}
