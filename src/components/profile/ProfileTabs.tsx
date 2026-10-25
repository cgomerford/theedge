'use client'

// src/components/profile/ProfileTabs.tsx
//
// Tab bar for the player page. Every panel stays MOUNTED (just hidden) so switching tabs never refetches
// or re-animates a chart. Tabs flagged `pro` get a PRO badge; the panel body for a locked tab is a <ProPanel>
// built by the caller. This component never decides access itself (the server resolved `isPro`, the caller
// passes the right node), so there is nothing to default to true here.
//
// Built on the shared underline Tabs (src/components/ui/Tabs.tsx); the active tab is kept in the URL as ?tab=.

import { Suspense } from 'react'
import Tabs from '@/components/ui/Tabs'

export type ProfileTab = { id: string; label: string; pro?: boolean; content: React.ReactNode }

export default function ProfileTabs({ tabs, initial }: { tabs: ProfileTab[]; initial?: string }) {
  void initial // the active tab is read from ?tab= by the shared Tabs
  return (
    <Suspense fallback={null}>
      <Tabs
        tabs={tabs.map(t => ({ id: t.id, label: t.label, badge: undefined }))}
        defaultTab={tabs[0]?.id}
        panels={Object.fromEntries(tabs.map(t => [t.id, <div key={t.id} style={{ paddingTop: 22 }}>{t.content}</div>]))}
        label="Player sections"
      />
    </Suspense>
  )
}
