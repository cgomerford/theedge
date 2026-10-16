import { SANS } from '@/components/team/ui'
import { TYPE } from '../layout'

/** Team-colour bar + abbr (+ optional mono label), the block header used by the scout-desk segments. 64px tall. */
export default function TeamTag({ abbr, color, label }: { abbr: string; color: string; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: 64 }}>
      <div style={{ width: 12, height: 56, borderRadius: 6, background: color, border: '2px solid rgba(250,248,243,.6)', boxSizing: 'border-box' }} />
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 56, letterSpacing: '-0.02em', color: '#FAF8F3', whiteSpace: 'nowrap' }}>{abbr}</div>
      {label && <div style={{ fontFamily: SANS, fontSize: TYPE.label, color: 'rgba(250,248,243,.7)', whiteSpace: 'nowrap' }}>{label}</div>}
    </div>
  )
}
