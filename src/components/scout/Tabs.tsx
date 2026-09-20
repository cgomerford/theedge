'use client'

// src/components/scout/Tabs.tsx
//
// Small tab strip for Scout cards — keeps a dense section from becoming a long
// scroll. `content` is server-rendered by the parent and handed in as a node, so
// tab bodies can be async server components wrapped in <Suspense>. Every panel
// stays mounted (hidden) so a tab's data isn't refetched when you switch back.

import { useState } from 'react'

export type ScoutTab = { id: string; label: string; badge?: string; content: React.ReactNode }

export default function Tabs({ tabs, defaultId }: { tabs: ScoutTab[]; defaultId?: string }) {
  const [active, setActive] = useState(defaultId ?? tabs[0]?.id)
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1.5 mb-4">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={active === t.id} onClick={() => setActive(t.id)}
            className={`text-[10px] font-mono uppercase tracking-wide px-2.5 py-1.5 rounded-lg border transition ${
              active === t.id ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
            }`}>
            {t.label}{t.badge && <span className={`ml-1.5 ${active === t.id ? 'text-stone-300' : 'text-stone-400'}`}>{t.badge}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id}>{t.content}</div>
      ))}
    </div>
  )
}
