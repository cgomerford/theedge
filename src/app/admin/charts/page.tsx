// src/app/admin/charts/page.tsx
//
// Chart builder: scatter, bubble, bar, column, histogram, season lines, donut and table from public player and team data. Auth: src/proxy.ts guards every /admin path.

import Link from 'next/link'
import ChartBuilder from './ChartBuilder'

export const metadata = { title: 'Chart builder - x9Lab', robots: { index: false, follow: false } }

export default function ChartsPage() {
  return (
    <div className="cb" style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 20px 60px', fontFamily: 'var(--font-redhat), system-ui, sans-serif', color: '#1A1A1A' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <Link href="/admin" style={{ color: '#5B5347', fontSize: 14, textDecoration: 'none' }}>← Admin</Link>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>Chart builder</h1>
      </div>
      <p style={{ margin: '0 0 18px', color: '#5B5347', fontSize: 14, maxWidth: 860, lineHeight: 1.5 }}>
        Choose a table, a chart type and the stats, click the dots or bars you want named, then download the picture or the data behind it.
        Your own numbers (for example DRS from another site) can be pasted in once and matched to players by name.
      </p>
      <ChartBuilder />
    </div>
  )
}
