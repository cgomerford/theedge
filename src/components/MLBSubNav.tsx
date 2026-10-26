'use client'

/**
 * src/components/MLBSubNav.tsx
 *
 * The MLB sub-header: underline tabs (shared Tabs component, 3px orange bar). One list for the whole site: src/lib/nav/mlbTabs.ts.
 * 44px row, white, 1px bottom border. On mobile the row scrolls sideways with a soft fade over the right edge,
 * and the active tab is scrolled into view (Tabs does that on mount).
 */

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import Tabs from '@/components/ui/Tabs'
import { MLB_TABS, activeMlbTab } from '@/lib/nav/mlbTabs'

export default function MLBSubNav({ isPro }: { isPro?: boolean } = {}) {
  void isPro
  const pathname = usePathname()
  return (
    <nav className="mlb-subnav" aria-label="MLB navigation">
      <style>{`
        .mlb-subnav{position:relative;background:#fff;border-bottom:1px solid #E8E4DC}
        .mlb-subnav .x9-tabs{background:#fff;border-bottom:0;gap:20px;padding:0 16px;max-width:1400px;margin:0 auto}
        .mlb-subnav .x9-tab{height:44px;display:inline-flex;align-items:center;padding:0;margin-bottom:0;font-weight:600;font-size:15px;color:#57534E}
        .mlb-subnav .x9-tab[aria-selected="true"]{color:#1A1A1A}
        .mlb-subnav::after{content:"";position:absolute;top:0;right:0;bottom:1px;width:32px;pointer-events:none;background:linear-gradient(to right,rgba(255,255,255,0),#fff)}
        @media (min-width:768px){.mlb-subnav .x9-tabs{gap:24px;padding:0 32px}.mlb-subnav::after{display:none}}
      `}</style>
      <Suspense fallback={<div style={{ height: 44 }} />}>
        <Tabs
          label="MLB sections"
          sticky={false}
          activeId={activeMlbTab(pathname) ?? ''}
          tabs={MLB_TABS.map(t => ({ id: t.id, label: t.label, href: t.href }))}
        />
      </Suspense>
    </nav>
  )
}
