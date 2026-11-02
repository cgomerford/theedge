// src/app/admin/scatter/page.tsx
//
// Scatter chart builder: one dot per player, two stats, a few players named. Auth: src/proxy.ts guards every /admin path.

import Link from 'next/link'
import ScatterBuilder from './ScatterBuilder'

export const metadata = { title: 'Scatter chart builder - x9Lab', robots: { index: false, follow: false } }

export default function ScatterPage() {
  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: '24px 20px 60px', fontFamily: 'var(--font-redhat), system-ui, sans-serif', color: '#1A1A1A' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <Link href="/admin" style={{ color: '#5B5347', fontSize: 14, textDecoration: 'none' }}>← Admin</Link>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>Scatter chart builder</h1>
      </div>
      <p style={{ margin: '0 0 18px', color: '#5B5347', fontSize: 14, maxWidth: 820, lineHeight: 1.5 }}>
        Plot every player on two stats and name the ones that matter. Choose a table, the two stats and a minimum sample, then download the picture.
        Your own numbers (for example DRS from another site) can be pasted in and matched to players by name.
      </p>
      <ScatterBuilder />
    </div>
  )
}
