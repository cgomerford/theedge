// Shared locked-state card for every Front Office Pro surface. Shows copy and a
// feature list only — never numbers, never blurred data (DESIGN_SYSTEM §5).

import Link from 'next/link'
import { C, MONO, SANS, DISPLAY } from '@/components/team/ui'
import { ProBadge } from '@/components/profile/ProPanel'

export default function UpgradeCard({ title, features, message = 'Front Office tools are part of Pro.' }: { title: string; features: string[]; message?: string }) {
  return (
    <div style={{ border: '1.5px dashed #d8d2c4', borderRadius: 14, padding: 20, background: 'rgba(255,255,255,.55)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <ProBadge />
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 22, color: C.ink }}>{title}</span>
      </div>
      <p style={{ fontFamily: SANS, fontSize: 13, color: '#5b5347', margin: '8px 0 12px', lineHeight: 1.5, maxWidth: 680 }}>{message}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '6px 20px' }}>
        {features.map(f => (
          <li key={f} style={{ fontFamily: SANS, fontSize: 12.5, color: '#3a352c', display: 'flex', gap: 8, lineHeight: 1.4 }}>
            <span style={{ color: C.orange, flexShrink: 0 }}>◆</span>{f}
          </li>
        ))}
      </ul>
      <Link href="/pricing" style={{ display: 'inline-block', marginTop: 16, fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', background: C.ink, color: C.cream, padding: '9px 14px', borderRadius: 8, textDecoration: 'none' }}>Unlock with Pro →</Link>
    </div>
  )
}
