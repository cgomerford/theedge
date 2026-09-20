'use client'

// src/components/profile/ProfileTabs.tsx
//
// Tab bar for the player page, styled like the team page's section nav.
// Every panel stays MOUNTED (just hidden) so switching tabs never refetches
// or re-animates a chart. Tabs flagged `pro` get a PRO badge; the panel body
// for a locked tab is a <ProPanel> built by the caller — this component never
// decides access itself (the server resolved `isPro`, the caller passes the
// right node), so there is nothing to default to true here.
//
// The active tab is mirrored into ?tab= via history.replaceState so a tab is
// linkable/shareable without triggering a server re-render.

import { useState } from 'react'

const MONO = 'var(--font-jetbrains), ui-monospace, monospace'

export type ProfileTab = { id: string; label: string; pro?: boolean; content: React.ReactNode }

export default function ProfileTabs({ tabs, initial }: { tabs: ProfileTab[]; initial?: string }) {
  const [active, setActive] = useState(() => (tabs.some(t => t.id === initial) ? (initial as string) : tabs[0]?.id))

  function select(id: string) {
    setActive(id)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', id)
      window.history.replaceState(null, '', url.toString())
    } catch { /* URL sync is a nicety, never required */ }
  }

  return (
    <div>
      <div
        role="tablist"
        style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(250,248,243,.95)', backdropFilter: 'blur(6px)', borderBottom: '1px solid #e7e2d8', margin: '16px -24px 0', padding: '10px 24px', display: 'flex', gap: 4, overflowX: 'auto' }}
      >
        {tabs.map(t => {
          const on = active === t.id
          return (
            <button
              key={t.id} type="button" role="tab" aria-selected={on} onClick={() => select(t.id)}
              style={{
                fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer',
                padding: '7px 12px', borderRadius: 999, border: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
                background: on ? '#1A1A1A' : 'transparent', color: on ? '#FAF8F3' : '#5b5347',
              }}
            >
              {t.label}
              {t.pro && <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '.1em', background: '#FDE047', color: '#1A1A1A', padding: '1px 5px', borderRadius: 4 }}>PRO</span>}
            </button>
          )
        })}
      </div>
      {tabs.map(t => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id} style={{ paddingTop: 22 }}>{t.content}</div>
      ))}
    </div>
  )
}
