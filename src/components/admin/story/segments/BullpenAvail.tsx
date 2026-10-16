'use client'

import { SANS } from '@/components/team/ui'
import { AVAIL_HEADLINE, AVAIL_KICKER, fmtShortDate } from '../copy'
import { fitText } from '../fit'
import { BODY_TOP, ROW, SAFE_W, SPACE, TYPE } from '../layout'
import { rowsPerTeam, AVAIL_COLS_H, AVAIL_TOP_LINE_H } from '../rows'
import { shadeStep, type PenRow, type PenTeam } from '../bullpenModel'
import { buildEndOf, easeOutCubic, prog, revealAt } from '../motion'
import Body from '../parts/Body'
import Foot from '../parts/Foot'
import Header from '../parts/Header'
import TeamTag from '../parts/TeamTag'
import { useContext } from 'react'
import { PhotoContext } from '../parts/PhotoContext'
import { initials } from '../names'
import type { StoryGame } from '../types'

type P = { game: StoryGame; localT: number; dur: number }

const HEAD = 40, NAME_W = 190, HAND_W = 34, CELL_W = 96, COLS_H = AVAIL_COLS_H, TOP_LINE_H = AVAIL_TOP_LINE_H
const SHADE = ['transparent', 'rgba(250,248,243,.22)', 'rgba(250,248,243,.5)', '#FF5722']

function Row({ r, p }: { r: PenRow; p: number }) {
  const photos = useContext(PhotoContext)
  const src = photos[r.id]
  const e = easeOutCubic(p)
  const fit = fitText(r.name ? shortOf(r.name) : '', { maxWidth: NAME_W, maxSize: TYPE.label, minSize: TYPE.foot, widthEm: 0.58 })
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: ROW.grid, width: SAFE_W, opacity: e, transform: `translateY(${(1 - e) * 16}px)` }}>
      <div style={{ width: HEAD, height: HEAD, aspectRatio: '1 / 1', flex: 'none', borderRadius: '50%', overflow: 'hidden', background: '#2b2b2b', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" width={HEAD} height={HEAD} style={{ width: HEAD, height: HEAD, objectFit: 'cover', objectPosition: '50% 20%', display: 'block' }} />
        ) : <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 16, color: '#FAF8F3' }}>{initials(r.name)}</span>}
      </div>
      <div style={{ width: NAME_W, fontFamily: SANS, fontWeight: 800, fontSize: fit.size, color: '#FAF8F3', whiteSpace: 'nowrap' }}>{shortOf(r.name)}</div>
      <div style={{ width: HAND_W, fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)' }}>{r.hand ?? ''}</div>
      {r.days.map((n, i) => (
        <div key={i} style={{ width: CELL_W, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: CELL_W - 16, height: 40, borderRadius: 10, boxSizing: 'border-box', border: n === 0 ? '2px solid rgba(250,248,243,.18)' : '2px solid transparent', background: SHADE[shadeStep(n)], display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, fontWeight: 800, fontSize: TYPE.label, color: shadeStep(n) === 3 ? '#1A1A1A' : '#FAF8F3', fontVariantNumeric: 'tabular-nums' }}>
            {n > 0 ? n : ''}
          </div>
        </div>
      ))}
      <div style={{ marginLeft: SPACE.m, width: SAFE_W - HEAD - 10 - NAME_W - HAND_W - CELL_W * 4 - SPACE.m, textAlign: 'right' }}>
        {r.tag && <div style={{ fontFamily: SANS, fontSize: TYPE.foot, color: r.tag === 'Rested 3+ days' ? 'rgba(250,248,243,.7)' : '#FDE047', lineHeight: 1, whiteSpace: 'nowrap' }}>{r.tag}</div>}
      </div>
    </div>
  )
}

function shortOf(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return full
  const suf = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts[parts.length - 1]) && parts.length > 2 ? ` ${parts.pop()}` : ''
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}${suf}`
}

export default function BullpenAvail({ game, localT, dur }: P) {
  const g = game.penGrid
  if (!g) return null
  const blocks: { team: PenTeam; abbr: string; color: string }[] = []
  if (g.away) blocks.push({ team: g.away, abbr: game.away.abbr, color: game.away.color })
  if (g.home) blocks.push({ team: g.home, abbr: game.home.abbr, color: game.home.color })
  const per = rowsPerTeam(blocks.length)
  const topLine = `Pen pitches, last 3 days: ${blocks.map(b => `${b.abbr} ${b.team.last3}`).join(' · ')}`
  const bodyH = TOP_LINE_H + blocks.reduce((s, b) => s + 64 + COLS_H + Math.min(b.team.rows.length, per) * ROW.grid, 0) + SPACE.l * Math.max(0, blocks.length - 1)
  const lastDate = blocks[0]?.team.dates.at(-1) ?? ''
  let idx = 0
  const nRows = blocks.reduce((s, b) => s + Math.min(b.team.rows.length, per), 0)
  const be = buildEndOf(dur)
  return (
    <>
      <Header kicker={AVAIL_KICKER} headline={AVAIL_HEADLINE} />
      <Body gap={0}>
        <div style={{ height: TOP_LINE_H, fontFamily: SANS, fontWeight: 700, fontSize: TYPE.label, color: '#FAF8F3', lineHeight: `${TOP_LINE_H}px` }}>{topLine}</div>
        {blocks.map(({ team, abbr, color }, bi) => (
          <div key={abbr} style={{ width: SAFE_W, marginTop: bi ? SPACE.l : 0 }}>
            <TeamTag abbr={abbr} color={color} />
            <div style={{ display: 'flex', height: COLS_H, alignItems: 'center', paddingLeft: HEAD + 10 + NAME_W + HAND_W }}>
              {team.dates.map(d => <div key={d} style={{ width: CELL_W, textAlign: 'center', fontFamily: SANS, fontSize: TYPE.foot, color: 'rgba(250,248,243,.7)' }}>{fmtShortDate(d)}</div>)}
            </div>
            {team.rows.slice(0, per).map(r => <Row key={r.id} r={r} p={prog(localT, revealAt(idx++, nRows, be, 0.3, 0.05), 0.3)} />)}
          </div>
        ))}
      </Body>
      <Foot after={BODY_TOP + bodyH}>Pitches by date · MLB game feeds · thru {fmtShortDate(lastDate)}</Foot>
    </>
  )
}
