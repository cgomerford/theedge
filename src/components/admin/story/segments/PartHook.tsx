'use client'

import { SANS } from '@/components/team/ui'
import { BRAND_KICKER, POST_KICKER } from '../copy'
import { fitText } from '../fit'
import { SAFE, SAFE_W, SPACE, TYPE, centreInSafe } from '../layout'
import { easeOutCubic, prog } from '../motion'
import type { StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

/** Bumper that opens part 2 of a split export. Brand + matchup only, no data. */
export default function PartHook({ game, localT }: P) {
  const e = easeOutCubic(prog(localT, 0, 0.5))
  const text = `PART 2 · ${game.away.abbr} @ ${game.home.abbr}`
  const size = fitText(text, { maxWidth: SAFE_W, maxSize: TYPE.hook, minSize: 70, widthEm: 0.62 }).size
  const h = TYPE.label * 1.1 + SPACE.l + size
  return (
    <div style={{ position: 'absolute', left: SAFE.left, top: centreInSafe(h), width: SAFE_W, opacity: e, transform: `translateY(${(1 - e) * 40}px)` }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, letterSpacing: '.14em', color: '#FF5722', lineHeight: 1.1 }}>{game.series ? POST_KICKER : BRAND_KICKER}</div>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: size, letterSpacing: '-0.02em', color: '#FAF8F3', lineHeight: 1.0, marginTop: SPACE.l, whiteSpace: 'nowrap' }}>
        {text}
      </div>
    </div>
  )
}
