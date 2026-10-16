'use client'

import { SANS } from '@/components/team/ui'
import { BRAND_KICKER, POST_KICKER, scoutPill, seriesPill } from '../copy'
import { fitText } from '../fit'
import { noteFit } from '../hook'
import { KICKER_H, SAFE, SAFE_W, SPACE, TYPE, centreInSafe, stackHeight } from '../layout'
import { easeOutCubic, prog } from '../motion'
import NamePlate from '../parts/NamePlate'
import Pill from '../parts/Pill'
import { COL2 } from '../layout'
import type { StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

const PLATE_H = 128, PILL_H = 66, UNDERLINE = 14

export default function Hook({ game, localT }: P) {
  const { away, home } = game
  const l1 = away.nickname.toUpperCase()
  const l2 = `@ ${home.nickname.toUpperCase()}`
  const longest = l1.length > l2.length ? l1 : l2
  const size = fitText(longest, { maxWidth: SAFE_W, maxSize: TYPE.hook, minSize: 96, widthEm: 0.64 }).size
  const note = noteFit(game.hook.text)
  const spBoth = !!(game.sp.away.id && game.sp.home.id && game.sp.away.name !== 'TBD' && game.sp.home.name !== 'TBD')
  const matchLine = [`${away.name} @ ${home.name}`, game.venue, game.firstPitch].filter(Boolean).join(' · ')
  const matchH = Math.ceil(TYPE.label * 1.3) * Math.ceil((matchLine.length * TYPE.label * 0.6) / SAFE_W)

  // One tight stack, centred in SAFE. Heights are computed, never measured.
  const headH = Math.ceil(size * 1.0) * 2
  const parts = [KICKER_H, headH + SPACE.l + UNDERLINE, ...(spBoth ? [PLATE_H] : []), note.height, PILL_H + SPACE.m + matchH]
  const gap = SPACE.xl
  const top = centreInSafe(stackHeight(parts, gap))

  // Motion: clip wipe of the underline + rise (translateY) + opacity. The headline is fully on screen at t=0.
  const wipe = easeOutCubic(prog(localT, 0, 0.6))
  const rise = easeOutCubic(prog(localT, 0, 0.6))
  const headStyle = { fontFamily: SANS, fontWeight: 800, fontSize: size, letterSpacing: '-0.02em', textTransform: 'uppercase' as const, color: '#FAF8F3', lineHeight: 1.0, whiteSpace: 'nowrap' as const }
  return (
    <div style={{ position: 'absolute', left: SAFE.left, top, width: SAFE_W, display: 'flex', flexDirection: 'column', gap }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, letterSpacing: '.14em', color: '#FF5722', height: KICKER_H, lineHeight: 1.1 }}>{game.series ? POST_KICKER : BRAND_KICKER}</div>
      <div>
        <div style={headStyle}>{l1}</div>
        <div style={headStyle}>{l2}</div>
        <div style={{ height: UNDERLINE, marginTop: SPACE.l, width: SAFE_W * 0.55, background: '#FF5722', borderRadius: 7, clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)` }} />
      </div>

      {spBoth && (
        <div style={{ display: 'flex', gap: SPACE.l, opacity: rise, transform: `translateY(${(1 - rise) * 40}px)` }}>
          <NamePlate id={game.sp.away.id} name={game.sp.away.name} short={game.sp.away.short} sub={`SP · ${away.abbr}`} color={away.color} head={96} width={COL2} nameMax={TYPE.sub} />
          <NamePlate id={game.sp.home.id} name={game.sp.home.name} short={game.sp.home.short} sub={`SP · ${home.abbr}`} color={home.color} head={96} width={COL2} nameMax={TYPE.sub} />
        </div>
      )}

      <div style={{
        boxSizing: 'border-box', height: note.height, padding: '0 36px', width: SAFE_W, display: 'flex', alignItems: 'center',
        background: '#FAF8F3', border: '2px solid #e7e2d8', borderRadius: 28,
        fontFamily: SANS, fontWeight: 700, fontSize: note.size, lineHeight: 1.2, color: '#1A1A1A',
        opacity: rise, transform: `translateY(${(1 - rise) * 60}px)`,
      }}>
        {game.hook.text}
      </div>

      <div style={{ opacity: rise, transform: `translateY(${(1 - rise) * 60}px)` }}>
        <Pill>{game.series ? seriesPill(game.series.label, game.series.game, game.series.of, game.dateLabel) : scoutPill(game.dateLabel)}</Pill>
        <div style={{ fontFamily: SANS, fontSize: TYPE.label, lineHeight: 1.3, color: 'rgba(250,248,243,.8)', marginTop: SPACE.m }}>{matchLine}</div>
      </div>
    </div>
  )
}
