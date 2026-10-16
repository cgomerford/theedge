// Signal Meter: a small bar showing a player's sample against the point where
// the stat becomes reliable. Thresholds come from `stat_stabilisation`; if the
// metric has no row, nothing renders (no guessed threshold).

import { C, MONO, SANS } from '@/components/team/ui'
import { signalState, type Stabilisation } from '@/lib/front-office/signal'

const STATE = {
  early:    { label: 'Early',    color: '#D4533B' },
  settling: { label: 'Settling', color: '#C99A12' },
  reliable: { label: 'Reliable', color: '#1D9E75' },
} as const

export default function SignalMeter({ sample, stab }: { sample: number; stab: Stabilisation | undefined }) {
  if (!stab) return null
  const s = STATE[signalState(sample, stab.threshold)]
  const pct = Math.min(100, (sample / stab.threshold) * 100)
  return (
    <span title={`${stab.label}: ${sample} of ~${stab.threshold} ${stab.unit}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 44, height: 5, borderRadius: 3, background: C.soft, overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: s.color }} />
      </span>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 10, color: s.color, letterSpacing: '.04em' }}>{s.label}</span>
      <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint }}>{sample}/{stab.threshold}</span>
    </span>
  )
}
