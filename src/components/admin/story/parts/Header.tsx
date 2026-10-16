import { SANS } from '@/components/team/ui'
import { fitText } from '../fit'
import { HEADER_INSET, HEADLINE_H, KICKER_H, SAFE, SAFE_W, SPACE, TYPE } from '../layout'

// Re-exported so segments import geometry from one place (layout.ts is the source of truth).
export { BODY_TOP, HEADER_H, SAFE_W as CONTENT_W } from '../layout'
export const CONTENT_X = SAFE.left

/** Kicker (orange) at SAFE.top + headline under it. Height is HEADER_H, always. */
export default function Header({ kicker, headline, size = TYPE.headline }: { kicker: string; headline: string; size?: number }) {
  const fit = fitText(headline, { maxWidth: SAFE_W, maxSize: size, minSize: 70, widthEm: 0.62 })
  return (
    <div style={{ position: 'absolute', left: SAFE.left, top: SAFE.top + HEADER_INSET, width: SAFE_W }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, letterSpacing: '.14em', textTransform: 'uppercase', color: '#FF5722', height: KICKER_H, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
        {kicker}
      </div>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: fit.size, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#FAF8F3', lineHeight: 1.02, height: HEADLINE_H, marginTop: SPACE.s, whiteSpace: 'nowrap' }}>
        {headline}
      </div>
    </div>
  )
}
