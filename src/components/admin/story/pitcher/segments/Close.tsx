'use client'

import { SANS } from '@/components/team/ui'
import { fitText } from '../../fit'
import { SAFE, SAFE_W, SPACE, TYPE, centreInSafe } from '../../layout'
import { easeOutCubic, prog } from '../../motion'
import { PR_CLOSE_HEADLINE, PR_CLOSE_SUB, PR_CLOSE_URL } from '../copy'

export default function Close({ localT }: { localT: number }) {
  const head = fitText(PR_CLOSE_HEADLINE, { maxWidth: SAFE_W, maxSize: 110, minSize: 70, widthEm: 0.5 })
  const headLines = Math.max(1, Math.ceil((PR_CLOSE_HEADLINE.length * head.size * 0.5) / SAFE_W))
  const e1 = easeOutCubic(prog(localT, 0, 0.5)), e2 = easeOutCubic(prog(localT, 0.4, 0.5))
  const h = TYPE.label * 1.1 + SPACE.l + headLines * Math.ceil(head.size * 1.04) + SPACE.xl + 14 + SPACE.xxl + TYPE.sub * 1.3
  return (
    <div style={{ position: 'absolute', left: SAFE.left, top: centreInSafe(h), width: SAFE_W }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, letterSpacing: '.14em', color: '#FF5722' }}>⊕ X9LAB</div>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: Math.min(head.size, 110), lineHeight: 1.04, letterSpacing: '-0.02em', color: '#FAF8F3', marginTop: SPACE.l, opacity: e1, transform: `translateY(${(1 - e1) * 50}px)` }}>{PR_CLOSE_HEADLINE}</div>
      <div style={{ height: 14, width: 420, background: '#FF5722', borderRadius: 7, marginTop: SPACE.xl, clipPath: `inset(0 ${(1 - e1) * 100}% 0 0)` }} />
      <div style={{ marginTop: SPACE.xxl, opacity: e2, transform: `translateY(${(1 - e2) * 40}px)` }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: '#FAF8F3' }}>{PR_CLOSE_SUB}</div>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: '#FF5722', marginTop: SPACE.s }}>{PR_CLOSE_URL}</div>
      </div>
    </div>
  )
}
