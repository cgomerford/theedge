import { SANS } from '@/components/team/ui'
import { fitText } from '../fit'
import { ROW, TYPE } from '../layout'
import { easeOutCubic } from '../motion'

export const BAR_LABEL_W = 270
export const BAR_TRACK_W = 560

/** Horizontal reliever bar: label | bar growing L→R | value in mono at the bar end. Fixed ROW.bar height. */
export default function BarRow({ label, value, max, p, accent }: {
  label: string; value: number; max: number; p: number; accent?: boolean
}) {
  const fit = fitText(label, { maxWidth: BAR_LABEL_W - 16, maxSize: TYPE.body, minSize: TYPE.label, widthEm: 0.56 })
  const w = Math.max(10, (value / Math.max(max, 1)) * BAR_TRACK_W)   // final width; revealed by a clip, never scaled
  const e = easeOutCubic(p)
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: ROW.bar, position: 'relative' }}>
      <div style={{ width: BAR_LABEL_W, fontFamily: SANS, fontWeight: 700, fontSize: fit.size, color: '#FAF8F3', lineHeight: 1.05, flex: 'none' }}>{label}</div>
      <div style={{ position: 'relative', width: BAR_TRACK_W + 110, height: ROW.bar - 16 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w, borderRadius: 12, background: accent ? '#FF5722' : '#FAF8F3', clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` }} />
        <div style={{ position: 'absolute', left: w + 14, top: 0, bottom: 0, display: 'flex', alignItems: 'center', fontFamily: SANS, fontSize: TYPE.label, color: '#FAF8F3', opacity: p > 0.3 ? 1 : 0 }}>
          {Math.round(value * e)}
        </div>
      </div>
    </div>
  )
}
