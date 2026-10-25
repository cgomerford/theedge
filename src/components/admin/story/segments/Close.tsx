'use client'

import { SANS } from '@/components/team/ui'
import { CLOSE_HEADLINE, CLOSE_SUB, CLOSE_URL_BASE } from '../copy'
import { fitText } from '../fit'
import { SAFE, SAFE_W, SPACE, TYPE, centreInSafe } from '../layout'
import { easeOutCubic, prog } from '../motion'
import type { StoryGame } from '../types'
import { SITE_HOST } from '@/lib/site'

type P = { game: StoryGame; localT: number; dur: number }

/** the site domain/mlb/{slug} → lines broken at "/mlb/" and "-vs-" */
export function urlLines(slug: string | null): string[] {
  if (!slug) return [CLOSE_URL_BASE]
  const [away, ...rest] = slug.split('-vs-')
  const home = rest.join('-vs-')
  return [`${SITE_HOST}`, `/mlb/${away}`, ...(home ? [`-vs-${home}`] : [])]
}

export default function Close({ game, localT }: P) {
  const lines = urlLines(game.slug)
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '')
  const urlSize = Math.max(TYPE.label, fitText(longest, { maxWidth: SAFE_W - 84, maxSize: TYPE.sub, minSize: TYPE.label, widthEm: 0.6 }).size)
  const head = fitText(CLOSE_HEADLINE, { maxWidth: SAFE_W, maxSize: 110, minSize: 70, widthEm: 0.5 })
  const headLines = Math.max(1, Math.ceil((CLOSE_HEADLINE.length * head.size * 0.5) / SAFE_W))
  const e1 = easeOutCubic(prog(localT, 0, 0.5))
  const e2 = easeOutCubic(prog(localT, 0.4, 0.5))
  const urlH = lines.length * Math.ceil(urlSize * 1.3) + 68
  const h = TYPE.label * 1.1 + SPACE.l + headLines * Math.ceil(head.size * 1.04) + SPACE.xl + 14 + SPACE.xxl + urlH + SPACE.xl + TYPE.sub * 1.3
  return (
    <div style={{ position: 'absolute', left: SAFE.left, top: centreInSafe(h), width: SAFE_W }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, letterSpacing: '.14em', color: '#FF5722' }}>⊕ X9LAB</div>
      <div style={{
        fontFamily: SANS, fontWeight: 800, fontSize: Math.min(head.size, 110), lineHeight: 1.04, letterSpacing: '-0.02em', color: '#FAF8F3', marginTop: SPACE.l,
        opacity: e1, transform: `translateY(${(1 - e1) * 50}px)`,
      }}>{CLOSE_HEADLINE}</div>
      <div style={{ height: 14, width: 420, background: '#FF5722', borderRadius: 7, marginTop: SPACE.xl, clipPath: `inset(0 ${(1 - e1) * 100}% 0 0)` }} />
      <div style={{ marginTop: SPACE.xxl, opacity: e2, transform: `translateY(${(1 - e2) * 40}px)` }}>
        <div style={{ background: '#FAF8F3', border: '2px solid #e7e2d8', borderRadius: 28, padding: '34px 40px', boxSizing: 'border-box', width: SAFE_W }}>
          {lines.map((l, i) => (
            <div key={i} style={{ fontFamily: SANS, fontSize: urlSize, lineHeight: 1.3, color: i === 0 ? '#FF5722' : '#1A1A1A', overflowWrap: 'anywhere' }}>{l}</div>
          ))}
        </div>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.sub, color: '#FAF8F3', marginTop: SPACE.xl }}>{CLOSE_SUB}</div>
      </div>
    </div>
  )
}
