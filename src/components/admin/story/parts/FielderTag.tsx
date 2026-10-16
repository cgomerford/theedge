'use client'

import { useContext } from 'react'
import { SANS } from '@/components/team/ui'
import { signed } from '../copy'
import { fitText } from '../fit'
import { SPACE, TYPE } from '../layout'
import { easeOutCubic } from '../motion'
import { initials } from '../names'
import { PhotoContext } from './PhotoContext'

export const TAG_W = 270, TAG_H = 128, HEAD = 44
const PAD = 12                                   // left team bar is 12px; text starts after it

/** OAA tint: ±5 is a clear plus / minus over a season. */
function pillStyle(r: number) {
  const bg = r >= 5 ? '#1D9E75' : r <= -5 ? '#D4533B' : '#FAF8F3'
  return { bg, fg: r >= 5 || r <= -5 ? '#FAF8F3' : '#1A1A1A' }
}

/**
 * Compact fielder tag. The name gets the FULL tag width on its own line(s) (wraps, never truncated);
 * the circular headshot, position and OAA pill sit on a row underneath.
 */
export default function FielderTag({ playerId, name, short, position, oaa, color, pop, pill }: {
  playerId: number | null; name: string; short: string; position: string
  oaa: number | null; color: string; pop: number; pill: number
}) {
  const photos = useContext(PhotoContext)
  const src = playerId != null ? photos[playerId] : undefined
  const e = easeOutCubic(pop), pe = easeOutCubic(pill)
  const textW = TAG_W - PAD - SPACE.m - SPACE.s
  if (!name) {
    return (
      <div style={{ width: TAG_W, height: TAG_H, boxSizing: 'border-box', borderRadius: 24, border: '3px dashed rgba(250,248,243,.35)', display: 'flex', alignItems: 'center', gap: SPACE.m, padding: `0 ${SPACE.l}px`, opacity: e }}>
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.sub, color: 'rgba(250,248,243,.5)' }}>–</span>
        <span style={{ fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.5)' }}>{position}</span>
      </div>
    )
  }
  const fit = fitText(short, { maxWidth: textW, maxSize: TYPE.label, minSize: TYPE.foot, widthEm: 0.58 })
  const r = oaa != null ? Math.round(oaa) : null
  const ps = r != null ? pillStyle(r) : null
  return (
    <div style={{
      position: 'relative', width: TAG_W, height: TAG_H, boxSizing: 'border-box', overflow: 'hidden', background: '#FAF8F3', border: '2px solid #e7e2d8', borderRadius: 24,
      padding: `${SPACE.s}px ${SPACE.s}px ${SPACE.s}px ${PAD + SPACE.m}px`, opacity: e, transform: `scale(${0.9 + 0.1 * e})`,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: SPACE.xs,
    }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: PAD, background: color }} />
      <div style={{ width: textW, minHeight: 66, fontFamily: SANS, fontWeight: 800, fontSize: fit.size, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#1A1A1A', overflowWrap: 'anywhere' }}>{short}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.s, height: HEAD }}>
        <div style={{ width: HEAD, height: HEAD, aspectRatio: '1 / 1', flex: 'none', borderRadius: '50%', boxSizing: 'border-box', border: `3px solid ${color}`, overflow: 'hidden', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" width={HEAD - 6} height={HEAD - 6} style={{ width: HEAD - 6, height: HEAD - 6, objectFit: 'cover', objectPosition: '50% 20%', display: 'block', background: '#f1eee6' }} />
          ) : (
            <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 16, color: '#FAF8F3' }}>{initials(name)}</span>
          )}
        </div>
        <span style={{ fontFamily: SANS, fontSize: TYPE.foot, color: '#8a8275' }}>{position}</span>
        {ps && r != null ? (
          <span style={{ background: ps.bg, color: ps.fg, borderRadius: 999, padding: '0 14px', fontFamily: SANS, fontWeight: 800, fontSize: TYPE.foot, fontVariantNumeric: 'tabular-nums', border: '2px solid #1A1A1A', opacity: pe }}>{signed(r)}</span>
        ) : (
          <span style={{ background: '#e7e2d8', color: '#8a8275', borderRadius: 999, padding: '0 14px', fontFamily: SANS, fontWeight: 800, fontSize: TYPE.foot, opacity: pe }}>—</span>
        )}
      </div>
    </div>
  )
}
