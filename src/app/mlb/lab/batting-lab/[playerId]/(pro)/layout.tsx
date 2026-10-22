// src/app/mlb/lab/batting-lab/[playerId]/(pro)/layout.tsx
//
// The Batting Lab tabs that stay PRO: Overview, Vs Arsenal, Location Lab, Hot Zone Overlay, Sequencing, Trends, H2H. This is the
// gate the whole lab used to have (the parent layout now only checks sign-up), so these tabs behave exactly as before:
// a non-Pro member sees the locked card inside the lab shell, and none of the tab's client code or data requests run.
// A route group: it adds no URL segment.

import Link from 'next/link'
import { isProViewer } from '@/lib/require-pro'

export default async function ProBattingTabs({ children }: { children: React.ReactNode }) {
  if (!(await isProViewer())) {
    return (
      <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 24px' }}>
        <div style={{ border: '1.5px dashed #1A1A1A', borderRadius: 14, padding: 22, background: '#fff' }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', background: '#FDE047', color: '#1A1A1A', padding: '3px 7px', borderRadius: 5 }}>PRO</span>
          <h2 style={{ margin: '10px 0 6px', fontSize: 22, fontWeight: 800, letterSpacing: '-.01em' }}>This tab is part of Pro</h2>
          <p style={{ color: '#5b5347', fontSize: 14, margin: '0 0 12px' }}>Results against every pitch type, the location lab, hot-zone overlay, sequencing, trends and career head-to-head. Contact and Approach are free with a sign-up.</p>
          <Link href="/pricing" style={{ display: 'inline-block', background: '#FF5722', color: '#fff', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Unlock with Pro</Link>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
