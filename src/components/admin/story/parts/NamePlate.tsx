'use client'

import { useContext, type CSSProperties } from 'react'
import { SANS } from '@/components/team/ui'
import { fitText } from '../fit'
import { TYPE } from '../layout'
import { initials } from '../names'
import { easeOutCubic } from '../motion'
import { PhotoContext } from './PhotoContext'

type Props = {
  id: number | null
  name: string
  short?: string
  sub?: string
  color: string
  head: number
  width: number
  /** 0..1 pop-in progress: scale .85→1 + opacity (isotropic scale on a chip, not on text) */
  pop?: number
  popFrom?: number
  nameMax?: number
  bg?: string
  /** no card chrome (use when the plate already sits on a cream card) */
  flat?: boolean
  style?: CSSProperties
}

const PAD_L = 30, PAD_R = 18, GAP = 16, BAR = 12

export default function NamePlate({ id, name, short, sub, color, head, width, pop = 1, popFrom = 0.85, nameMax = 44, bg = '#FAF8F3', flat = false, style }: Props) {
  const photos = useContext(PhotoContext)
  const src = id != null ? photos[id] : undefined
  const label = short ?? name
  const textW = width - BAR - PAD_L - PAD_R - head - GAP
  const fit = fitText(label, { maxWidth: textW, maxSize: nameMax, minSize: TYPE.label, widthEm: 0.58 })
  const e = easeOutCubic(pop)
  return (
    <div
      style={{
        width, display: 'flex', alignItems: 'center', gap: GAP, boxSizing: 'border-box',
        background: flat ? 'transparent' : bg, border: flat ? '2px solid transparent' : '2px solid #e7e2d8', borderRadius: 28, overflow: 'hidden',
        padding: `14px ${PAD_R}px 14px ${PAD_L}px`, position: 'relative',
        opacity: e, transform: `scale(${popFrom + (1 - popFrom) * e})`, transformOrigin: 'center',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: BAR, background: color }} />
      <div
        style={{
          width: head, height: head, aspectRatio: '1 / 1', flex: 'none', borderRadius: '50%', boxSizing: 'border-box',
          border: `4px solid ${color}`, overflow: 'hidden', background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" width={head - 8} height={head - 8} style={{ width: head - 8, height: head - 8, objectFit: 'cover', objectPosition: '50% 20%', background: '#f1eee6', display: 'block' }} />
        ) : (
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: Math.round(head * 0.38), color: '#FAF8F3', letterSpacing: '-0.02em' }}>
            {initials(name)}
          </span>
        )}
      </div>
      <div style={{ width: textW, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: fit.size, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#1A1A1A', overflowWrap: 'anywhere' }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontFamily: SANS, fontSize: TYPE.foot, lineHeight: 1.1, color: '#8a8275', marginTop: 4 }}>{sub}</div>
        )}
      </div>
    </div>
  )
}
