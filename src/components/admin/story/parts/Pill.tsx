import { SANS } from '@/components/team/ui'
import type { CSSProperties, ReactNode } from 'react'

export default function Pill({ children, bg = '#FF5722', fg = '#1A1A1A', style }: { children: ReactNode; bg?: string; fg?: string; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: 'inline-block', background: bg, color: fg, borderRadius: 999, padding: '12px 34px',
        fontFamily: SANS, fontWeight: 800, fontSize: 40, letterSpacing: '.06em', textTransform: 'uppercase', lineHeight: 1.1,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
