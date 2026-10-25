'use client'

// src/components/scout/Tabs.tsx
//
// Tab strip for Scout cards: keeps a dense section from becoming a long scroll. `content` is server-rendered by
// the parent and handed in as a node, so tab bodies can be async server components wrapped in <Suspense>.
// Every panel stays mounted (hidden) so a tab's data isn't refetched when you switch back.
//
// Uses the shared underline Tabs. These are secondary tab sets (a page can hold many), so they keep state locally
// and are not sticky; only the page-level tab bar writes ?tab= and sticks.

import { Suspense } from 'react'
import UiTabs from '@/components/ui/Tabs'

export type ScoutTab = { id: string; label: string; badge?: string; content: React.ReactNode }

export default function Tabs({ tabs, defaultId }: { tabs: ScoutTab[]; defaultId?: string }) {
  return (
    <Suspense fallback={null}>
      <div style={{ marginBottom: 16 }}>
        <UiTabs
          tabs={tabs.map(t => ({ id: t.id, label: t.label, badge: t.badge }))}
          defaultTab={defaultId ?? tabs[0]?.id}
          urlSync={false}
          sticky={false}
          panels={Object.fromEntries(tabs.map(t => [t.id, t.content]))}
        />
      </div>
    </Suspense>
  )
}
